import { MemberPreferences } from "../types.js";

export interface TravelEstimate {
  memberId: string;
  durationMinutes: number | null;
  distanceMeters: number | null;
  provider: string;
}

/**
 * Routing provider boundary. Implement with OSRM or another permitted routing service.
 * We intentionally do not invent travel times.
 */
export async function estimateTravelTime(
  _memberId: string,
  _preferences: MemberPreferences,
  _destination: { latitude: number; longitude: number }
): Promise<TravelEstimate> {
  return { memberId: _memberId, durationMinutes: null, distanceMeters: null, provider: "not-configured" };
}