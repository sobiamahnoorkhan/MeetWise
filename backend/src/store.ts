import { randomInt } from "node:crypto";
import { Meetup } from "./types.js";

const meetups = new Map<string, Meetup>();

const ttlMinutes = Number(process.env.MEETUP_TTL_MINUTES ?? 360);

export function createMeetup(meetup: Meetup): Meetup {
  meetups.set(meetup.id, meetup);
  return meetup;
}

export function getMeetup(id: string): Meetup | undefined {
  return meetups.get(id);
}

export function getMeetupByCode(code: string): Meetup | undefined {
  const normalized = code.trim().toUpperCase();
  return [...meetups.values()].find((m) => m.inviteCode === normalized);
}

export function deleteExpiredMeetups(): void {
  const now = Date.now();
  for (const [id, meetup] of meetups) {
    if (new Date(meetup.expiresAt).getTime() <= now) {
      meetups.delete(id);
    }
  }
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function getTtlMinutes(): number {
  return Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 360;
}
