export interface PlaceCandidate {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  source: string;
  raw?: unknown;
}

export interface PlaceResearchRequest {
  area?: string;
  activityPreferences: string[];
  foodPreferences: string[];
}

/**
 * Adapter boundary for real place providers.
 * No fabricated venue data is returned here.
 */
export async function researchPlaces(_request: PlaceResearchRequest): Promise<PlaceCandidate[]> {
  return [];
}