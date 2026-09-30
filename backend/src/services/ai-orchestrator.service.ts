import { Meetup } from "../types.js";

export interface PlanningContext {
  goal: string;
  memberCount: number;
  constraints: Array<{ memberId: string; preferences: Meetup["members"][number]["preferences"] }>;
}

export function buildPlanningContext(meetup: Meetup): PlanningContext {
  return {
    goal: meetup.title,
    memberCount: meetup.members.length,
    constraints: meetup.members.map((member) => ({
      memberId: member.id,
      preferences: member.preferences
    }))
  };
}

export function getAgentPipeline() {
  return [
    "constraint-extraction",
    "place-research",
    "mobility-evaluation",
    "weather-context",
    "plan-generation",
    "group-voting",
    "dynamic-replanning"
  ];
}