import { randomUUID } from "node:crypto";
import { MemberPreferences, Meetup, ChatMessage, Vote } from "../types.js";
import { getMeetup } from "../store.js";

export async function requireMeetup(id: string): Promise<Meetup> {
  const meetup = await getMeetup(id);
  if (!meetup) throw new Error("Meetup not found or expired");
  return meetup;
}

export function updatePreferences(meetup: Meetup, memberId: string, preferences: MemberPreferences) {
  const member = meetup.members.find((m) => m.id === memberId);
  if (!member) throw new Error("Member not found");
  member.preferences = { ...member.preferences, ...preferences };
  return member;
}

export function addChatMessage(meetup: Meetup, memberId: string, text: string): ChatMessage {
  if (!meetup.members.some((m) => m.id === memberId)) throw new Error("Member does not belong to this meetup");
  const message: ChatMessage = { id: randomUUID(), memberId, text, createdAt: new Date().toISOString() };
  meetup.chat.push(message);
  return message;
}

export function castVote(meetup: Meetup, memberId: string, optionId: string): Vote[] {
  if (!meetup.members.some((m) => m.id === memberId)) throw new Error("Member does not belong to this meetup");
  meetup.votes = meetup.votes.filter((v) => v.memberId !== memberId);
  meetup.votes.push({ memberId, optionId, createdAt: new Date().toISOString() });
  return meetup.votes;
}