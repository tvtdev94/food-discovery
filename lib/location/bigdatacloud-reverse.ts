import "server-only";
import { UpstreamError } from "@/lib/tools/errors";
import type { NominatimResult } from "@/lib/location/types";

const ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
const TIMEOUT_MS = 5_000;

interface BdcResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  countryName?: string;
  countryCode?: string;
}

/**
 * Reverse-geocode via BigDataCloud's free client endpoint.
 * No API key, no User-Agent policy — used as a fallback when Nominatim blocks
 * our UA (common if NOMINATIM_USER_AGENT lacks a valid contact email).
 * Rate limit: generous for free tier; safe for MVP.
 */
export async function bigDataCloudReverse(lat: number, lng: number): Promise<NominatimResult> {
  const url = `${ENDPOINT}?latitude=${lat}&longitude=${lng}&localityLanguage=vi`;

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: ac.signal,
    });
  } catch (err) {
    throw new UpstreamError("BigDataCloud fetch failed", err);
  } finally {
    clearTimeout(tid);
  }

  if (!res.ok) {
    throw new UpstreamError(`BigDataCloud returned HTTP ${res.status}`, undefined, res.status);
  }

  const data = (await res.json()) as BdcResponse;
  const city = data.city || data.locality;
  const country = data.countryName;
  const parts = [data.locality, city !== data.locality ? city : undefined, data.principalSubdivision, country].filter(Boolean);
  const label = parts.join(", ") || "Vị trí hiện tại";

  return { label, lat, lng, city, country };
}
