import { MemberPreferences } from "../types.js";
export interface RouteEstimate { memberId:string; durationMinutes:number|null; distanceMeters:number|null; provider:string; }
export async function route(memberId:string,p:MemberPreferences,d:{latitude:number;longitude:number}):Promise<RouteEstimate>{
 if(p.latitude===undefined||p.longitude===undefined)return{memberId,durationMinutes:null,distanceMeters:null,provider:"missing-origin"};
 // The public OSRM demo server exposes car routing reliably. Walking/bike/public-transit
 // require a provider with those profiles, so we do not pretend to have those modes here.
 const u=`https://router.project-osrm.org/route/v1/driving/${p.longitude},${p.latitude};${d.longitude},${d.latitude}?overview=false`;
 try{
  const r=await fetch(u);if(!r.ok)return{memberId,durationMinutes:null,distanceMeters:null,provider:"osrm-unavailable"};
  const data=await r.json() as {routes?:Array<{duration:number;distance:number}>};const x=data.routes?.[0];
  return{memberId,durationMinutes:x?Math.ceil(x.duration/60):null,distanceMeters:x?.distance??null,provider:"OSRM driving"};
 }catch{return{memberId,durationMinutes:null,distanceMeters:null,provider:"osrm-unavailable"}}
}