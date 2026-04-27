import "server-only";

import { round } from "@/lib/utils";
import { getVnHour } from "@/lib/chat/prewarm-cache";
import type { Weather } from "@/lib/tools/types";

/**
 * Pure helpers cho LLM-generated quick chips suggestions.
 *
 * Bucket location/time/weather thành keys ngắn → cache key composite ổn định
 * (~1km radius zone × 5 hour buckets × 4 weather modes = 20 cache slots/zone).
 * High hit rate: cùng khu cùng giờ cùng thời tiết → cùng chip set 1h.
 */

// ---------------------------------------------------------------------------
// Hour bucket — derive từ VN local hour (UTC+7, no DST).
// ---------------------------------------------------------------------------

export type HourBucket = "morning" | "lunch" | "afternoon" | "evening" | "latenight";

export function getHourBucket(now: Date): HourBucket {
  const h = getVnHour(now);
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 14) return "lunch";
  if (h >= 14 && h < 18) return "afternoon";
  if (h >= 18 && h < 23) return "evening";
  return "latenight";
}

// ---------------------------------------------------------------------------
// Weather key — guard order: rainy_cool → hot_day → cool_evening → mild.
// ---------------------------------------------------------------------------

export type WeatherKey = "rainy_cool" | "hot_day" | "cool_evening" | "mild";

export function getWeatherKey(weather: Weather): WeatherKey {
  if (weather.rainProbPct > 50) return "rainy_cool";
  if (weather.tempC > 32 && weather.isDay) return "hot_day";
  if (weather.tempC < 26 && !weather.isDay) return "cool_evening";
  return "mild";
}

// ---------------------------------------------------------------------------
// Composite cache key — 1km zone × hour × weather. TTL 1h ở caller.
// ---------------------------------------------------------------------------

export function buildCacheKey(
  lat: number,
  lng: number,
  hourBucket: HourBucket,
  weatherKey: WeatherKey,
): string {
  return `chips:${round(lat, 2)}:${round(lng, 2)}:${hourBucket}:${weatherKey}`;
}
