import "server-only";
import { round } from "@/lib/utils";
import { log } from "@/lib/logger";
import { cacheThrough } from "@/lib/tools/cache";
import { UpstreamError } from "@/lib/tools/errors";
import type { Weather } from "@/lib/tools/types";

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

/**
 * Tuned weather decision thresholds.
 * Referenced by system-prompt.ts (v1) and persona-prompt-v2.ts.
 * Round 1 eval: rain 60%, hot 32°C, cold 18°C — adjust after eval round 2 if needed.
 */
export const WEATHER_THRESHOLDS = {
  HOT_TEMP_C: 32,
  COLD_TEMP_C: 18,
  HIGH_RAIN_PCT: 60,
} as const;
const TIMEOUT_MS = 5_000;
const TTL_SEC = 900; // 15 min

// WMO Weather interpretation codes → human-readable condition string.
// https://open-meteo.com/en/docs#weathervariables
const CODE_RANGES: Array<{ min: number; max: number; label: string }> = [
  { min: 0, max: 0, label: "clear" },
  { min: 1, max: 3, label: "cloudy" },
  { min: 45, max: 48, label: "fog" },
  { min: 51, max: 57, label: "drizzle" },
  { min: 61, max: 67, label: "rain" },
  { min: 71, max: 77, label: "snow" },
  { min: 80, max: 82, label: "rain-showers" },
  { min: 95, max: 99, label: "thunderstorm" },
];

export function weatherCodeToCondition(code: number): string {
  for (const r of CODE_RANGES) {
    if (code >= r.min && code <= r.max) return r.label;
  }
  return "unknown";
}

// --- Open-Meteo response shape (minimal) ---

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    is_day: number; // 0 | 1
    precipitation_probability: number;
  };
}

async function fetchWeather(lat: number, lng: number): Promise<Weather> {
  const url =
    `${OPEN_METEO_BASE}` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code,is_day,precipitation_probability` +
    `&timezone=auto`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal, cache: "no-store" });
  } catch (err) {
    throw new UpstreamError("Open-Meteo fetch failed", err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new UpstreamError(`Open-Meteo returned HTTP ${res.status}`, undefined, res.status);
  }

  const body = (await res.json()) as OpenMeteoResponse;
  const c = body.current;

  return {
    tempC: c.temperature_2m,
    condition: weatherCodeToCondition(c.weather_code),
    rainProbPct: c.precipitation_probability,
    isDay: c.is_day === 1,
    ts: Date.now(),
  };
}

/**
 * Returns current weather for the given coordinates.
 * Cached for 15 min keyed on lat/lng rounded to 2 decimal places (~1 km grid).
 */
export async function getWeather(lat: number, lng: number): Promise<Weather> {
  const rLat = round(lat, 2);
  const rLng = round(lng, 2);
  const key = `weather:v1:${rLat}:${rLng}`;
  const t0 = Date.now();

  // Single retry on network error or 5xx.
  async function produce(): Promise<Weather> {
    try {
      return await fetchWeather(rLat, rLng);
    } catch (err) {
      // Retry once on network errors or server-side upstream errors (not 4xx).
      const isRetryable =
        !(err instanceof UpstreamError) || (err.status !== undefined && err.status >= 500);
      if (isRetryable) {
        await new Promise((r) => setTimeout(r, 500));
        return fetchWeather(rLat, rLng);
      }
      throw err;
    }
  }

  const { value, cached } = await cacheThrough(key, TTL_SEC, produce);
  const ms = Date.now() - t0;
  log.info(cached ? "weather.hit" : "weather.miss", { lat: rLat, lng: rLng, ms });
  return value;
}
