export interface PlaceCandidate {id:string;name:string;latitude:number;longitude:number;type:string;address?:string;source:string;}
export async function findPlaces(area:string,preferences:string[]):Promise<PlaceCandidate[]>{
 const q=[...preferences,area].filter(Boolean).join(" ");const u=new URL("https://nominatim.openstreetmap.org/search");u.searchParams.set("q",q);u.searchParams.set("format","jsonv2");u.searchParams.set("limit","10");
 const r=await fetch(u,{headers:{"User-Agent":"MeetWise-AI/1.0"}});if(!r.ok)throw new Error("Place research unavailable");
 const data=await r.json() as any[];return data.map(x=>({id:String(x.place_id),name:x.display_name.split(",")[0],latitude:Number(x.lat),longitude:Number(x.lon),type:x.type,address:x.display_name,source:"OpenStreetMap/Nominatim"}));
}