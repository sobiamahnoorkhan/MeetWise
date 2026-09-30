export interface Coordinates { latitude:number; longitude:number; displayName:string; }
export async function geocode(query:string):Promise<Coordinates|null>{
  const url=new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q",query); url.searchParams.set("format","jsonv2"); url.searchParams.set("limit","1");
  const r=await fetch(url,{headers:{"User-Agent":"MeetWise-AI/1.0"}});
  if(!r.ok) throw new Error("Geocoding provider unavailable");
  const data=await r.json() as Array<{lat:string;lon:string;display_name:string}>;
  const x=data[0]; return x?{latitude:Number(x.lat),longitude:Number(x.lon),displayName:x.display_name}:null;
}