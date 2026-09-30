import { Meetup } from "../types.js";
import { findPlaces } from "./live-places.service.js";
import { route } from "./routing.service.js";
import { getLiveWeather } from "./live-weather.service.js";

export async function createLivePlan(meetup:Meetup,when?:string){
 const areas=meetup.members.map(m=>m.preferences.area).filter(Boolean) as string[];
 const preferences=[...new Set(meetup.members.flatMap(m=>[...(m.preferences.activityPreferences??[]),...(m.preferences.foodPreferences??[])]))];
 if(!areas.length)return{status:"needs_input",missingData:["member location/area"]};
 const candidates=await findPlaces(areas.join(" "),preferences);
 if(!candidates.length)return{status:"no_results",candidates:[]};
 const results=await Promise.all(candidates.slice(0,8).map(async c=>{
   const travel=await Promise.all(meetup.members.map(m=>route(m.id,m.preferences,{latitude:c.latitude,longitude:c.longitude})));
   const weather=when?await getLiveWeather(c.latitude,c.longitude,when):null;
   let total=0,satisfied=0,maxTravel=0;
   const explanation:string[]=[];
   meetup.members.forEach((m,i)=>{
     const limit=m.preferences.maxTravelMinutes,t=travel[i]?.durationMinutes;
     if(limit!==undefined){total++;if(t!==null&&t!==undefined&&t<=limit){satisfied++;explanation.push(m.name+": travel time fits limit")}else explanation.push(m.name+": travel limit not confirmed")}
     if(t!==null&&t!==undefined)maxTravel=Math.max(maxTravel,t);
   });
   if(preferences.length){total++;satisfied++;explanation.push("Place research used the group's food/activity preferences")}
   if(weather?.available){total++;if((weather.precipitationProbability??0)<=50)satisfied++;explanation.push("Live weather was checked")}
   const score=total?Math.round(satisfied/total*100):0;
   return{candidate:c,travel,weather,score,maxTravelMinutes:maxTravel,constraintsSatisfied:satisfied,constraintsTotal:total,explanation};
 }));
 results.sort((a,b)=>b.score-a.score||(a.maxTravelMinutes??99999)-(b.maxTravelMinutes??99999));
 return{status:"ready",generatedAt:new Date().toISOString(),goal:meetup.title,candidates:results,objective:"Satisfy member constraints and reduce the worst confirmed travel time",source:"OpenStreetMap/Nominatim + OSRM + Open-Meteo"};
}