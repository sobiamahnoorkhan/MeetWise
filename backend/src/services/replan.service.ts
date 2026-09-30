import { Meetup } from "../types.js";
import { generatePlan, MeetupPlan } from "./planner.service.js";
export interface ReplanResult { reason:string; changedMemberId?:string; plan:MeetupPlan; }
export function replanMeetup(meetup:Meetup,reason:string,changedMemberId?:string):ReplanResult {
 return {reason,changedMemberId,plan:generatePlan(meetup)};
}