import { Meetup } from "../types.js";
import { findPlaces } from "./live-places.service.js";
import { route } from "./routing.service.js";
import { getLiveWeather } from "./live-weather.service.js";

function groupCenter(meetup:Meetup){
 const points=meetup.members
  .map(m=>m.preferences)
  .filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude))
  .map(p=>({latitude:p.latitude as number,longitude:p.longitude as number}));
 if(!points.length) return null;
 return {
  latitude:points.reduce((s,p)=>s+p.latitude,0)/points.length,
  longitude:points.reduce((s,p)=>s+p.longitude,0)/points.length
 };
}

function spreadRadiusKm(meetup:Meetup,center:{latitude:number;longitude:number}){
 const points=meetup.members.map(m=>m.preferences).filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
 if(!points.length) return 3;
 const distances=points.map(p=>{
  const dy=(p.latitude!-center.latitude)*111;
  const dx=(p.longitude!-center.longitude)*111*Math.cos(center.latitude*Math.PI/180);
  return Math.sqrt(dx*dx+dy*dy);
 });
 return Math.min(25,Math.max(3,Math.max(...distances)*0.9+2));
}

export async function createLivePlan(meetup:Meetup,when?:string){
 const membersWithLocations=meetup.members.filter(m=>Number.isFinite(m.preferences.latitude)&&Number.isFinite(m.preferences.longitude));
 const areas=meetup.members.map(m=>m.preferences.area).filter(Boolean) as string[];
 const preferences=[...new Set(meetup.members.flatMap(m=>[...(m.preferences.activityPreferences??[]),...(m.preferences.foodPreferences??[])]))];
 if(!membersWithLocations.length)return{status:"needs_input",missingData:["member location/area"]};

 const center=groupCenter(meetup);
 if(!center)return{status:"needs_input",missingData:["member location/area"]};

 const candidates=await findPlaces(String(spreadRadiusKm(meetup,center)),preferences,center);
 if(!candidates.length)return{status:"no_results",candidates:[]};

 const results=await Promise.all(candidates.slice(0,20).map(async c=>{
   const travel=await Promise.all(meetup.members.map(m=>route(m.id,m.preferences,{latitude:c.latitude,longitude:c.longitude})));
   const confirmedTimes=travel.map(t=>t.durationMinutes).filter((t):t is number=>typeof t==="number");
   const maxTravel=confirmedTimes.length?Math.max(...confirmedTimes):null;
   const averageTravel=confirmedTimes.length?confirmedTimes.reduce((a,b)=>a+b,0)/confirmedTimes.length:null;

   const weather=when?await getLiveWeather(c.latitude,c.longitude,when):null;
   let total=0,satisfied=0;
   const explanation:string[]=[
    `Shared meeting area is centered around ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)} based on member locations`
   ];

   meetup.members.forEach((m,i)=>{
     const limit=m.preferences.maxTravelMinutes,t=travel[i]?.durationMinutes;
     if(limit!==undefined){
       total++;
       if(t!==null&&t!==undefined&&t<=limit){
        satisfied++;
        explanation.push(m.name+": travel time is within their limit");
       } else {
        explanation.push(m.name+": travel limit is not confirmed for this place");
       }
     }
   });

   if(preferences.length){
    const haystack=(c.name+" "+(c.address??"")+" "+c.type).toLowerCase();
    const matched=preferences.filter(p=>haystack.includes(p.toLowerCase()));
    explanation.push(matched.length
      ? "Research match: "+matched.join(", ")
      : "Place is near the shared center; exact preference match was not verified");
   }

   if(weather?.available){
    total++;
    if((weather.precipitationProbability??0)<=50){
     satisfied++;
     explanation.push("Weather check: precipitation probability is at or below 50%");
    } else {
     explanation.push("Weather check: precipitation probability is above 50%");
    }
   }

   const score=total?Math.round(satisfied/total*100):null;
   return {
    candidate:c,
    travel,
    weather,
    score,
    maxTravelMinutes:maxTravel,
    averageTravelMinutes:averageTravel===null?null:Math.round(averageTravel),
    constraintsSatisfied:satisfied,
    constraintsTotal:total,
    budgetStatus:"unknown — venue price was not verified",
    explanation
   };
 }));

 // The core MeetWise objective is fairness: first minimize the longest
 // confirmed journey, then the average journey, then other constraints.
 results.sort((a,b)=>
  (a.maxTravelMinutes??99999)-(b.maxTravelMinutes??99999) ||
  (a.averageTravelMinutes??99999)-(b.averageTravelMinutes??99999) ||
  (b.score??-1)-(a.score??-1)
 );

 return{
  status:"ready",
  generatedAt:new Date().toISOString(),
  goal:meetup.title,
  center,
  candidates:results,
  objective:"Minimize the longest confirmed travel time so no member is unnecessarily sent far out of the way; then minimize average travel time and consider verified constraints.",
  source:"OpenStreetMap/Nominatim + OSRM + Open-Meteo",
  limitations:[
   "Venue prices/budget fit are not verified by these sources",
   "OSRM routing is driving-based; walking, bike and public-transit times are not separately verified",
   "The shared center is based on the supplied member coordinates; road-network fairness can differ from a straight-line geographic center"
  ]
 };
}