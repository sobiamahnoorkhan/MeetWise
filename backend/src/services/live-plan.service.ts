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

function preferenceMatch(meetup:Meetup,c:any){
 const prefs=[...new Set(meetup.members.flatMap(m=>[
  ...(m.preferences.activityPreferences??[]),
  ...(m.preferences.foodPreferences??[])
 ]))].filter(Boolean);
 const haystack=(c.name+" "+(c.address??"")+" "+c.type+" "+(c.cuisine??"")).toLowerCase();
 const matched=prefs.filter(p=>haystack.includes(p.toLowerCase()));
 return {prefs,matched};
}

export async function createLivePlan(meetup:Meetup,when?:string){
 const membersWithLocations=meetup.members.filter(m=>Number.isFinite(m.preferences.latitude)&&Number.isFinite(m.preferences.longitude));
 const missingMembers=meetup.members.filter(m=>!Number.isFinite(m.preferences.latitude)||!Number.isFinite(m.preferences.longitude)).map(m=>m.name);
 const preferences=[...new Set(meetup.members.flatMap(m=>[
  ...(m.preferences.activityPreferences??[]),
  ...(m.preferences.foodPreferences??[])
 ]))];
 if(membersWithLocations.length<1)return{status:"needs_input",missingData:["member location/area"]};
 if(missingMembers.length)return{status:"needs_input",missingData:missingMembers.map(name=>name+" needs a location/area before a fair plan can be calculated")};

 const center=groupCenter(meetup);
 if(!center)return{status:"needs_input",missingData:["member location/area"]};

 const candidates=await findPlaces(String(spreadRadiusKm(meetup,center)),preferences,center);
 if(!candidates.length)return{status:"no_results",candidates:[]};

 const results=await Promise.all(candidates.slice(0,24).map(async c=>{
   const travel=await Promise.all(meetup.members.map(m=>route(m.id,m.preferences,{latitude:c.latitude,longitude:c.longitude})));
   const confirmedTimes=travel.map(t=>t.durationMinutes).filter((t):t is number=>typeof t==="number");
   const maxTravel=confirmedTimes.length?Math.max(...confirmedTimes):null;
   const totalTravel=confirmedTimes.length?confirmedTimes.reduce((a,b)=>a+b,0):null;
   const averageTravel=confirmedTimes.length?totalTravel!/confirmedTimes.length:null;

   const weather=when?await getLiveWeather(c.latitude,c.longitude,when):null;
   const {prefs,matched}=preferenceMatch(meetup,c);

   let total=0,satisfied=0;
   const explanation:string[]=[
    `Shared meeting area is centered around ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)} from supplied member locations`
   ];

   meetup.members.forEach((m,i)=>{
     const limit=m.preferences.maxTravelMinutes,t=travel[i]?.durationMinutes;
     if(limit!==undefined){
       total++;
       if(t!==null&&t!==undefined&&t<=limit){
        satisfied++;
        explanation.push(m.name+": travel time is within their limit");
       }else{
        explanation.push(m.name+": travel limit is exceeded or could not be confirmed");
       }
     }
   });

   if(prefs.length){
    explanation.push(matched.length
      ? "Preference match found: "+matched.join(", ")
      : "No exact preference match was verified; venue was found near the shared meeting area");
   }

   if(weather?.available){
    total++;
    if((weather.precipitationProbability??0)<=50){
     satisfied++;
     explanation.push("Weather check: precipitation probability is at or below 50%");
    }else{
     explanation.push("Weather check: precipitation probability is above 50%");
    }
   }

   if(c.openingHours){
    explanation.push("Opening-hours information is available from the venue listing");
   }else{
    explanation.push("Opening-hours information was not available in the venue listing");
   }

   const score=total?Math.round(satisfied/total*100):null;
   return {
    candidate:c,
    travel,
    weather,
    score,
    maxTravelMinutes:maxTravel,
    totalTravelMinutes:totalTravel===null?null:Math.round(totalTravel),
    averageTravelMinutes:averageTravel===null?null:Math.round(averageTravel),
    constraintsSatisfied:satisfied,
    constraintsTotal:total,
    budgetStatus:"unknown — venue price was not verified",
    fairnessScore:null,
    availabilityStatus:c.operationalStatus==="opening_hours_available"
      ?"Opening-hours data found; live occupancy/reservation was not verified"
      :"Venue listing found; opening status was not verified",
    explanation
   };
 }));

 // Fairness is the hard objective: do not send one member far out of the way.
 // Among similarly fair options, reduce total travel time, then verified constraints.
 results.sort((a,b)=>
  (a.maxTravelMinutes??99999)-(b.maxTravelMinutes??99999) ||
  (a.totalTravelMinutes??99999)-(b.totalTravelMinutes??99999) ||
  (b.score??-1)-(a.score??-1)
 );

 const bestMax=results[0]?.maxTravelMinutes;
 results.forEach(x=>{
  x.fairnessScore=bestMax!=null&&x.maxTravelMinutes!=null
    ?Math.max(0,Math.round(100*(bestMax/(Math.max(bestMax,x.maxTravelMinutes)))))
    :null;
 });

 return{
  status:"ready",
  generatedAt:new Date().toISOString(),
  goal:meetup.title,
  center,
  candidates:results,
  objective:"First minimize the longest confirmed journey for fairness, then minimize total confirmed travel time, then consider verified constraints.",
  source:"OpenStreetMap/Nominatim + OSRM + Open-Meteo",
  limitations:[
   "Venue prices/budget fit are not verified by these free sources",
   "Live reservation, seating, occupancy, or crowd status is not verified",
   "Opening-hours data is only shown when the venue listing provides it and may not reflect temporary closures",
   "OSRM routing currently confirms driving routes; walking, bike and public-transit times are not separately verified",
   "The shared center is a starting search area; final ranking is based on road travel times"
  ]
 };
}