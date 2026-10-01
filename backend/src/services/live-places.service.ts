export interface PlaceCandidate {
 id:string;
 name:string;
 latitude:number;
 longitude:number;
 type:string;
 address?:string;
 source:string;
 openingHours?:string;
 website?:string;
 phone?:string;
 cuisine?:string;
 operationalStatus:"listing_found"|"opening_hours_available"|"opening_status_unknown";
}

interface Center { latitude:number; longitude:number; }

function bbox(center:Center,radiusKm:number){
 const latDelta=radiusKm/111;
 const lonDelta=radiusKm/(111*Math.max(Math.cos(center.latitude*Math.PI/180),0.2));
 return {west:center.longitude-lonDelta,north:center.latitude+latDelta,east:center.longitude+lonDelta,south:center.latitude-latDelta};
}

function distanceKm(a:Center,b:Center){
 const dy=(a.latitude-b.latitude)*111;
 const dx=(a.longitude-b.longitude)*111*Math.cos(a.latitude*Math.PI/180);
 return Math.sqrt(dx*dx+dy*dy);
}

function addResult(results:PlaceCandidate[],seen:Set<string>,x:any,source:string,query:string,center?:Center,radiusKm=25){
 const latitude=Number(x.lat ?? x.latitude), longitude=Number(x.lon ?? x.longitude);
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude)) return;
 if(center && distanceKm(center,{latitude,longitude})>radiusKm) return;
 const id=String(x.osm_type||x.type||"place")+":"+String(x.osm_id??x.id??x.place_id);
 if(seen.has(id)) return;
 const tags=x.tags??x.extratags??{};
 const name=String(x.name||x.display_name||tags.name||"").trim().split(",")[0]||query;
 if(!name) return;
 seen.add(id);
 const openingHours=typeof tags.opening_hours==="string"?tags.opening_hours:undefined;
 results.push({
  id,name,latitude,longitude,
  type:String(x.type||x.category||tags.amenity||tags.leisure||tags.shop||"place"),
  address:String(x.display_name||x.address||""),
  source,
  openingHours,
  website:typeof tags.website==="string"?tags.website:undefined,
  phone:typeof tags.phone==="string"?tags.phone:undefined,
  cuisine:typeof tags.cuisine==="string"?tags.cuisine:undefined,
  operationalStatus:openingHours?"opening_hours_available":"listing_found"
 });
}

async function nominatim(query:string,area:string,center:Center|undefined,radiusKm:number,results:PlaceCandidate[],seen:Set<string>){
 const u=new URL("https://nominatim.openstreetmap.org/search");
 u.searchParams.set("q",center?query:[query,area].filter(Boolean).join(" "));
 u.searchParams.set("format","jsonv2");
 u.searchParams.set("limit","10");
 u.searchParams.set("addressdetails","1");
 u.searchParams.set("extratags","1");
 u.searchParams.set("namedetails","1");
 if(center){
  const b=bbox(center,radiusKm);
  u.searchParams.set("viewbox",`${b.west},${b.north},${b.east},${b.south}`);
  u.searchParams.set("bounded","1");
 }
 const r=await fetch(u,{headers:{"User-Agent":"MeetWise-AI/1.0 (group meetup planner)"}});
 if(!r.ok) return;
 for(const x of await r.json() as any[]) addResult(results,seen,x,"OpenStreetMap/Nominatim",query,center,radiusKm);
}

async function photon(center:Center,query:string,radiusKm:number,results:PlaceCandidate[],seen:Set<string>){
 const u=new URL("https://photon.komoot.io/api/");
 u.searchParams.set("q",query);
 u.searchParams.set("lat",String(center.latitude));
 u.searchParams.set("lon",String(center.longitude));
 u.searchParams.set("limit","20");
 try{
  const r=await fetch(u,{headers:{"User-Agent":"MeetWise-AI/1.0 (group meetup planner)"}});
  if(!r.ok)return;
  const data=await r.json() as any;
  for(const f of data.features??[]){
   const coords=f.geometry?.coordinates;
   if(!Array.isArray(coords)||coords.length<2)continue;
   const p=f.properties??{};
   addResult(results,seen,{id:f.id||p.osm_id||Math.random(),type:p.osm_value||p.type,name:p.name,lat:coords[1],lon:coords[0],display_name:[p.name,p.street,p.city,p.state].filter(Boolean).join(", "),tags:{website:p.website,phone:p.phone,cuisine:p.cuisine}},"OpenStreetMap/Photon",query,center,radiusKm);
  }
 }catch{}
}

async function overpass(center:Center,radiusKm:number,results:PlaceCandidate[],seen:Set<string>){
 const q=`[out:json][timeout:20];(nwr(around:${Math.round(radiusKm*1000)},${center.latitude},${center.longitude})[amenity~"restaurant|cafe|fast_food|pub|food_court|cinema|theatre"];nwr(around:${Math.round(radiusKm*1000)},${center.latitude},${center.longitude})[leisure~"park|sports_centre|pitch|stadium"];nwr(around:${Math.round(radiusKm*1000)},${center.latitude},${center.longitude})[shop~"mall|supermarket"];);out center tags;`;
 try{
  const endpoints=[
   "https://overpass-api.de/api/interpreter",
   "https://overpass.kumi.systems/api/interpreter",
   "https://overpass.private.coffee/api/interpreter"
  ];
  let response:Response|undefined;
  for(const endpoint of endpoints){
   try{
    const rr=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"text/plain","User-Agent":"MeetWise-AI/1.0"},body:q});
    if(rr.ok){response=rr;break;}
   }catch{}
  }
  if(!response)return;
  const r=response;
  const data=await r.json() as any;
  for(const x of data.elements??[]){
   const lat=x.lat??x.center?.lat,lon=x.lon??x.center?.lon;
   addResult(results,seen,{...x,lat,lon,display_name:x.tags?.name,address:x.tags?.["addr:street"]||x.tags?.["addr:city"]||""},"OpenStreetMap/Overpass",String(x.tags?.name||"venue"),center,radiusKm);
  }
 }catch{}
}

export async function findPlaces(area:string,preferences:string[],center?:Center):Promise<PlaceCandidate[]>{
 const queries=[...new Set([...preferences.filter(Boolean),"restaurant","cafe","park","food","shopping mall","sports centre","cinema"])].slice(0,10);
 const results:PlaceCandidate[]=[]; const seen=new Set<string>();
 const radiusKm=center?Math.min(25,Math.max(5,Number(area)||5)):25;

 for(const query of queries){
  try{await nominatim(query,area,center,radiusKm,results,seen);}catch{}
 }
 // Nominatim is sparse for POI/category searches in some Pakistani areas.
 // Use Overpass as a second OSM source, then widen Nominatim once without bbox if needed.
 if(center && results.length<8){
  const localRadius=Math.min(25,Math.max(8,radiusKm*1.5));
  for(const q of ["restaurant","cafe","pizza","burger","park","shopping mall","cinema","sports"]){
   await photon(center,q,localRadius,results,seen);
   if(results.length>=12)break;
  }
  if(results.length<5) await overpass(center,localRadius,results,seen);
 }
 if(center && results.length<5){
  for(const query of ["restaurant","cafe","park","shopping mall","sports ground","cinema"]){
   try{await nominatim(query,"",undefined,0,results,seen);}catch{}
   if(results.length>=8)break;
  }
  // The unbounded fallback is filtered after retrieval so distant places are never presented.
  for(let i=results.length-1;i>=0;i--){
   if(distanceKm(center,{latitude:results[i].latitude,longitude:results[i].longitude})>Math.min(25,Math.max(8,radiusKm*1.5))) results.splice(i,1);
  }
 }
 return results.slice(0,30);
}
