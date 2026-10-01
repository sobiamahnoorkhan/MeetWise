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
 return {
  west:center.longitude-lonDelta,
  north:center.latitude+latDelta,
  east:center.longitude+lonDelta,
  south:center.latitude-latDelta
 };
}

export async function findPlaces(area:string,preferences:string[],center?:Center):Promise<PlaceCandidate[]>{
 const queries=[...new Set([
  ...preferences.filter(Boolean),
  "restaurant",
  "cafe",
  "park",
  "food",
  "shopping mall",
  "sports centre",
  "cinema"
 ])].slice(0,10);

 const results:PlaceCandidate[]=[];
 const seen=new Set<string>();

 for(const query of queries){
  const u=new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q",center ? query : [query,area].filter(Boolean).join(" "));
  u.searchParams.set("format","jsonv2");
  u.searchParams.set("limit","8");
  u.searchParams.set("addressdetails","1");
  u.searchParams.set("extratags","1");
  u.searchParams.set("namedetails","1");

  if(center){
   const radiusKm=Math.min(25,Math.max(3,Number(area)||3));
   const b=bbox(center,radiusKm);
   u.searchParams.set("viewbox",`${b.west},${b.north},${b.east},${b.south}`);
   u.searchParams.set("bounded","1");
  }

  try{
   const r=await fetch(u,{headers:{"User-Agent":"MeetWise-AI/1.0 (group meetup planner)"}});
   if(!r.ok) continue;
   const data=await r.json() as any[];

   for(const x of data){
    const id=String(x.osm_type||"place")+":"+String(x.osm_id??x.place_id);
    const latitude=Number(x.lat),longitude=Number(x.lon);
    if(seen.has(id)||!Number.isFinite(latitude)||!Number.isFinite(longitude)) continue;
    seen.add(id);

    const tags=x.extratags??{};
    const openingHours=typeof tags.opening_hours==="string" ? tags.opening_hours : undefined;
    results.push({
     id,
     name:String(x.name||x.display_name||"").trim().split(",")[0]||query,
     latitude,
     longitude,
     type:String(x.type||x.category||"place"),
     address:String(x.display_name||""),
     source:"OpenStreetMap/Nominatim",
     openingHours,
     website:typeof tags.website==="string"?tags.website:undefined,
     phone:typeof tags.phone==="string"?tags.phone:undefined,
     cuisine:typeof tags.cuisine==="string"?tags.cuisine:undefined,
     operationalStatus:openingHours?"opening_hours_available":"listing_found"
    });
   }
  }catch{
   // A failed query should not discard results from other queries.
  }
 }

 return results;
}