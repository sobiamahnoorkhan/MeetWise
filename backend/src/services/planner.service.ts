import { Meetup } from "../types.js";
import { createLivePlan } from "./live-plan.service.js";
export interface MeetupPlan { generatedAt:string; pipeline:string[]; status:string; [key:string]:unknown; }
export async function generatePlan(meetup:Meetup,when?:string):Promise<MeetupPlan>{
  const live=await createLivePlan(meetup,when);
  return {generatedAt:new Date().toISOString(),pipeline:["constraint-extraction","place-research","mobility-evaluation","weather-context","plan-generation"],...live};
}
