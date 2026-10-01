import { Meetup } from "../types.js";
import { createLivePlan } from "./live-plan.service.js";
import { saveFinalPlan } from "../store.js";

export async function replanMeetup(
  meetup: Meetup,
  reason: string,
  changedMemberId?: string,
  when?: string
){
  const plan = await createLivePlan(meetup, when);

  // Re-planning must update the same persisted live plan used by both
  // the organizer and joined members. This keeps places, fairness,
  // travel times, weather and voting options in sync.
  if (plan.status === "ready") {
    await saveFinalPlan(meetup.id, plan);
  }

  return {
    reason,
    changedMemberId,
    triggeredAt: new Date().toISOString(),
    plan
  };
}
