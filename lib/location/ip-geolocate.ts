import "server-only";
import { redis } from "@/lib/redis";
import { UpstreamError } from "@/lib/tools/errors";
import type { NominatimResult } from "@/lib/location/types";

const TTL = 3600; // 1h

const LOCALHOST_PATTERNS = ["127.0.0.1", "::1", "localhost", "unknown", ""];

export class IpGeolocateRateLimitError extends Error {
  constructor(public status: number) {
    super(`ipapi.co returned HTTP ${status}`);
    this.name = "IpGeolocateRateLimitError";
  }
}

interface IpapiResponse {
  latitude?: number;
  longitude?: number;
  city?: string;
  country_name?: string;
  region?: string;
  error?: boolean;
  reason?: string;
}

export async function ipGeolocate(ip: string): Promise<NominatimResult | null> {
  const trimmed = ip.trim();

  if (LOCALHOST_PATTERNS.includes(trimmed)) return null;

  const cacheKey = `geo:ip:${trimmed}`;
  const cached = await redis.get<NominatimResult>(cacheKey);
  if (cached) return cached;

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(`https://ipapi.co/${encodeURIComponent(trimmed)}/json/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (err) {
    throw new UpstreamError("ipapi.co fetch failed", err);
  } finally {
    clearTimeout(tid);
  }

  if (!res.ok) throw new IpGeolocateRateLimitError(res.status);

  const data: IpapiResponse = await res.json() as IpapiResponse;

  if (data.error || data.latitude == null || data.longitude == null) return null;

  const city = data.city;
  const country = data.country_name;
  const label = [city, data.region, country].filter(Boolean).join(", ");

  const result: NominatimResult = {
    label: label || "Unknown location",
    lat: data.latitude,
    lng: data.longitude,
    city,
    country,
  };

  await redis.set(cacheKey, result, { ex: TTL });
  console.info(JSON.stringify({ evt: "ip:geolocate", city, country }));
  return result;
}
