export interface PlaceCandidate {id:string;name:string;latitude:number;longitude:number;type:string;address?:string;source:string;}

interface Center { latitude:number; longitude:number; }

function bbox(center:Center, radiusKm:number){
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
  "shopping mall"
 ])].slice(0,8);

 const results:PlaceCandidate[]=[];
 const seen=new Set<string>();

 for(const query of queries){
  const u=new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q",center ? query : [query,area].filter(Boolean).join(" "));
  u.searchParams.set("format","jsonv2");
  u.searchParams.set("limit","5");
  u.searchParams.set("addressdetails","1");

  if(center){
   const radiusKm=Math.min(25,Math.max(3,Number(area)||3));
   const b=bbox(center,radiusKm);
   u.searchParams.set("viewbox",`${b.west},${b.north},${b.east},${b.south}`);
   u.searchParams.set("bounded","1");
  }

  const r=await fetch(u,{headers:{"User-Agent":"MeetWise-AI/1.0 (group meetup planner)"}});
  if(!r.ok) continue;
  const data=await r.json() as any[];

  for(const x of data){
   const id=String(x.place_id);
   const latitude=Number(x.lat),longitude=Number(x.lon);
   if(seen.has(id)||!Number.isFinite(latitude)||!Number.isFinite(longitude)) continue;
   seen.add(id);
   results.push({
    id,
    name:String(x.display_name||"").split(",")[0]||query,
    latitude,
    longitude,
    type:String(x.type||"place"),
    address:String(x.display_name||""),
    source:"OpenStreetMap/Nominatim"
   });
  }
 }

 return results;
}