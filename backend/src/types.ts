export type TransportMode = "walking" | "bike" | "car" | "public_transport" | "other";

export interface MemberPreferences {
  area?: string;
  latitude?: number;
  longitude?: number;
  transportMode?: TransportMode;
  budget?: number;
  foodPreferences?: string[];
  activityPreferences?: string[];
  availableFrom?: string;
  availableTo?: string;
  maxTravelMinutes?: number;
}

export interface Member {
  id: string;
  userId?: string;
  name: string;
  joinedAt: string;
  preferences: MemberPreferences;
}

export interface ChatMessage {
  id: string;
  memberId: string;
  text: string;
  createdAt: string;
}

export interface Vote {
  memberId: string;
  optionId: string;
  createdAt: string;
}

export interface Meetup {
  id: string;
  inviteCode: string;
  title: string;
  organizerId: string;
  createdAt: string;
  expiresAt: string;
  scheduledAt?: string;
  members: Member[];
  chat: ChatMessage[];
  votes: Vote[];
  finalPlan?: any;
}
