import { Meetup } from "../types.js";
import { findPlaces } from "./live-places.service.js";
import { route } from "./routing.service.js";
import { getLiveWeather } from "./live-weather.service.js";
export async function createLivePlan(meetup:Meetup,when?:string){
 const areas=meetup.members.map(m=>m.preferences.area).filter(Boolean) as string[];
 const preferences=[...new Set(meetup.members.flatMap(m=>[...(m.preferences.activityPreferences??[]),...(m.preferences.foodPreferences??[])]))];
 if(!areas.length)return{status:"needs_input",missingData:["member location/area"]};
 const candidates=await findPlaces(areas.join(" "),preferences);if(!candidates.length)return{status:"no_results",candidates:[]};
 const results=await Promise.all(candidates.slice(0,5).map(async c=>({candidate:c,travel:await Promise.all(meetup.members.map(m=>route(m.id,m.preferences,{latitude:c.latitude,longitude:c.longitude}))),weather:when?await getLiveWeather(c.latitude,c.longitude,when):null})));
 return{status:"ready",generatedAt:new Date().toISOString(),goal:meetup.title,candidates:results,source:"Live external providers"};
}