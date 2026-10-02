import { randomInt } from "node:crypto";
import { Meetup, Member, MemberPreferences, ChatMessage, Vote } from "./types.js";
import { supabase } from "./db.js";
import { geocode } from "./services/geocoding.service.js";

const ttlMinutes = Number(process.env.MEETUP_TTL_MINUTES ?? 360);

const memberRow = (meetupId: string, m: Member) => ({
  id: m.id,
  meetup_id: meetupId,
  user_id: m.userId ?? null,
  name: m.name,
  area: m.preferences.area ?? null,
  latitude: m.preferences.latitude ?? null,
  longitude: m.preferences.longitude ?? null,
  transport_mode: m.preferences.transportMode ?? null,
  budget_min: m.preferences.budget ?? null,
  budget_max: m.preferences.budget ?? null,
  food_preferences: m.preferences.foodPreferences ?? [],
  activity_preferences: m.preferences.activityPreferences ?? [],
  availability: (m.preferences.availableFrom || m.preferences.availableTo)
    ? JSON.stringify({ from: m.preferences.availableFrom ?? null, to: m.preferences.availableTo ?? null })
    : null,
  max_travel_minutes: m.preferences.maxTravelMinutes ?? null,
  joined_at: m.joinedAt
});

const toMember = (r: any): Member => {
  let availableFrom: string | undefined;
  let availableTo: string | undefined;
  const rawAvailability = String(r.availability ?? "");
  if (rawAvailability) {
    try {
      const parsed = JSON.parse(rawAvailability);
      availableFrom = parsed.from || undefined;
      availableTo = parsed.to || undefined;
    } catch {
      // Backward compatibility for older records.
      availableFrom = rawAvailability || undefined;
    }
  }
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    name: r.name,
    joinedAt: r.joined_at,
    preferences: {
      area: r.area ?? undefined,
      latitude: r.latitude ?? undefined,
      longitude: r.longitude ?? undefined,
      transportMode: r.transport_mode ?? undefined,
      budget: r.budget_min ?? r.budget_max ?? undefined,
      foodPreferences: r.food_preferences ?? [],
      activityPreferences: r.activity_preferences ?? [],
      availableFrom: availableFrom || undefined,
      availableTo: availableTo || undefined,
      maxTravelMinutes: r.max_travel_minutes ?? undefined
    }
  };
};

export async function saveMeetup(meetup: Meetup): Promise<Meetup> {
  const { error: meetupError } = await supabase.from("meetups").upsert({
    id: meetup.id,
    title: meetup.title,
    invite_code: meetup.inviteCode,
    created_by: meetup.members[0]?.userId ?? null,
    status: "active",
    scheduled_at: meetup.scheduledAt ?? null,
    expires_at: meetup.expiresAt,
    // Do not overwrite an existing live plan during member/chat/vote updates.
  });
  if (meetupError) throw meetupError;

  const { error: deleteMembersError } = await supabase
    .from("meetup_members")
    .delete()
    .eq("meetup_id", meetup.id);
  if (deleteMembersError) throw deleteMembersError;

  const { error: membersError } = await supabase
    .from("meetup_members")
    .insert(meetup.members.map(m => memberRow(meetup.id, m)));
  if (membersError) throw membersError;

  const { error: deleteMessagesError } = await supabase
    .from("messages")
    .delete()
    .eq("meetup_id", meetup.id);
  if (deleteMessagesError) throw deleteMessagesError;

  if (meetup.chat.length) {
    const { error } = await supabase.from("messages").insert(
      meetup.chat.map(m => ({
        id: m.id,
        meetup_id: meetup.id,
        member_id: m.memberId,
        message: m.text,
        created_at: m.createdAt
      }))
    );
    if (error) throw error;
  }

  const { error: deleteVotesError } = await supabase
    .from("votes")
    .delete()
    .eq("meetup_id", meetup.id);
  if (deleteVotesError) throw deleteVotesError;

  if (meetup.votes.length) {
    const { error } = await supabase.from("votes").insert(
      meetup.votes.map(v => ({
        meetup_id: meetup.id,
        member_id: v.memberId,
        candidate_id: v.optionId,
        created_at: v.createdAt
      }))
    );
    if (error) throw error;
  }

  return meetup;
}

export async function createMeetup(meetup: Meetup): Promise<Meetup> {
  return saveMeetup(meetup);
}

export async function getMeetup(id: string): Promise<Meetup | undefined> {
  const { data: row, error } = await supabase.from("meetups").select("*").eq("id", id).maybeSingle();
  if (error || !row) return undefined;

  const { data: members } = await supabase.from("meetup_members").select("*").eq("meetup_id", id).order("joined_at");
  const { data: messages } = await supabase.from("messages").select("*").eq("meetup_id", id).order("created_at");
  const { data: votes } = await supabase.from("votes").select("*").eq("meetup_id", id).order("created_at");

  return {
    id: row.id,
    inviteCode: row.invite_code,
    title: row.title,
    organizerId: members?.[0]?.id ?? "",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    members: (members ?? []).map(toMember),
    chat: (messages ?? []).map((m: any) => ({
      id: m.id,
      memberId: m.member_id,
      text: m.message,
      createdAt: m.created_at
    })),
    votes: (votes ?? []).map((v: any) => ({
      memberId: v.member_id,
      optionId: v.candidate_id,
      createdAt: v.created_at
    })),
    finalPlan: row.final_plan ?? undefined,
    scheduledAt: row.scheduled_at ?? undefined
  };
}

export async function getMeetupByCode(code: string): Promise<Meetup | undefined> {
  const normalized = code.trim().toUpperCase();
  const { data: row } = await supabase.from("meetups").select("id").eq("invite_code", normalized).maybeSingle();
  return row ? getMeetup(row.id) : undefined;
}

export async function deleteExpiredMeetups(): Promise<void> {
  await supabase.from("meetups").delete().lte("expires_at", new Date().toISOString());
}

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export function getTtlMinutes(): number {
  return Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 360;
}



export async function saveMemberPreferences(meetupId: string, memberId: string, preferences: MemberPreferences): Promise<Member> {
  const current = await getMeetup(meetupId);
  if (!current) throw new Error("Meetup not found or expired");
  const member = current.members.find(m => m.id === memberId);
  if (!member) throw new Error("Member not found");

  let merged = { ...member.preferences, ...preferences };
  if (merged.area && (merged.latitude === undefined || merged.longitude === undefined)) {
    const point = await geocode(merged.area);
    if (point) merged = { ...merged, latitude: point.latitude, longitude: point.longitude };
  }
  const row = memberRow(meetupId, { ...member, preferences: merged });
  const { error } = await supabase.from("meetup_members").update({
    name: row.name,
    area: row.area,
    latitude: row.latitude,
    longitude: row.longitude,
    transport_mode: row.transport_mode,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    food_preferences: row.food_preferences,
    activity_preferences: row.activity_preferences,
    availability: row.availability,
    max_travel_minutes: row.max_travel_minutes
  }).eq("id", memberId).eq("meetup_id", meetupId);
  if (error) throw error;
  return { ...member, preferences: merged };
}

export async function saveChatMessage(meetupId: string, message: ChatMessage): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    id: message.id,
    meetup_id: meetupId,
    member_id: message.memberId,
    message: message.text,
    created_at: message.createdAt
  });
  if (error) throw error;
}

export async function saveVote(meetupId: string, vote: Vote): Promise<void> {
  const { error: deleteError } = await supabase.from("votes")
    .delete().eq("meetup_id", meetupId).eq("member_id", vote.memberId);
  if (deleteError) throw deleteError;
  const { error } = await supabase.from("votes").insert({
    meetup_id: meetupId,
    member_id: vote.memberId,
    candidate_id: vote.optionId,
    created_at: vote.createdAt
  });
  if (error) throw error;
}

export async function saveFinalPlan(meetupId: string, plan: any): Promise<void> {
  const { error } = await supabase.from("meetups").update({ final_plan: plan }).eq("id", meetupId);
  if (error) throw error;
}
