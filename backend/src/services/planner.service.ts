import { Meetup } from "../types.js";
export interface PlanCandidate { id:string; status:"research_required"; title:string; reasons:string[]; }
export interface MeetupPlan { generatedAt:string; pipeline:string[]; candidates:PlanCandidate[]; missingData:string[]; }
export function generatePlan(meetup:Meetup):MeetupPlan {
  const missingData:string[]=[];
  for(const member of meetup.members){
    if(!member.preferences.area && !(member.preferences.latitude!==undefined && member.preferences.longitude!==undefined))
      missingData.push(member.name+": location");
  }
  return {generatedAt:new Date().toISOString(),pipeline:["constraint-extraction","place-research","mobility-evaluation","weather-context","plan-generation"],candidates:[],missingData};
}