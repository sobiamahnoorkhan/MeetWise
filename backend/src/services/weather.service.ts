export interface WeatherContext {
  available: boolean;
  summary: string | null;
  source: string;
}

/**
 * Weather provider boundary. The planner must treat unavailable weather as unknown,
 * never as a fabricated forecast.
 */
export async function getWeatherContext(
  _latitude: number,
  _longitude: number,
  _when: string
): Promise<WeatherContext> {
  return { available: false, summary: null, source: "not-configured" };
}