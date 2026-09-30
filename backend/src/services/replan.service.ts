import { Meetup } from "../types.js";
import { generatePlan } from "./planner.service.js";
export async function replanMeetup(meetup:Meetup,reason:string,changedMemberId?:string){
  return {reason,changedMemberId,triggeredAt:new Date().toISOString(),plan:await generatePlan(meetup)};
}
