import "server-only";
import { env } from "@/lib/env";
import { round, sha1Hex } from "@/lib/utils";
import { cacheThrough } from "@/lib/tools/cache";
import { UpstreamError } from "@/lib/tools/errors";
import type { NominatimResult } from "@/lib/location/types";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const TTL = 86400; // 24h

// --- Typed errors ---

export class NominatimRateLimitError extends Error {
  constructor() {
    super("Nominatim returned 429 Too Many Requests");
    this.name = "NominatimRateLimitError";
  }
}

export class NominatimFetchError extends Error {
  constructor(public status: number) {
    super(`Nominatim returned HTTP ${status}`);
    this.name = "NominatimFetchError";
  }
}

// --- OSM response shapes (minimal) ---

interface OsmSearchItem {
  place_id?: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

interface OsmReverseItem {
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

// --- Helpers ---

function headers(): Record<string, string> {
  return { "User-Agent": env.NOMINATIM_USER_AGENT, Accept: "application/json" };
}

function extractCity(address?: OsmSearchItem["address"]): string | undefined {
  return address?.city ?? address?.town ?? address?.village;
}

function parseSearchItem(item: OsmSearchItem): NominatimResult {
  return {
    label: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    city: extractCity(item.address),
    country: item.address?.country,
    placeId: item.place_id != null ? String(item.place_id) : undefined,
  };
}

// --- Public API ---

export async function searchPlaces(q: string): Promise<NominatimResult[]> {
  const normalised = q.toLowerCase().trim();
  const cacheKey = `nom:search:${await sha1Hex(normalised)}`;

  const { value } = await cacheThrough(cacheKey, TTL, async () => {
    const url = `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, { headers: headers(), cache: "no-store", signal: ac.signal });
    } catch (err) {
      throw new UpstreamError("Nominatim search fetch failed", err);
    } finally {
      clearTimeout(tid);
    }

    if (res.status === 429) throw new NominatimRateLimitError();
    if (!res.ok) throw new NominatimFetchError(res.status);

    const raw: OsmSearchItem[] = (await res.json()) as OsmSearchItem[];
    const results = raw.slice(0, 5).map(parseSearchItem);
    console.info(JSON.stringify({ evt: "nominatim:search", q: normalised, hits: results.length }));
    return results;
  });

  return value;
}

export async function reverseLookup(lat: number, lng: number): Promise<NominatimResult> {
  const rLat = round(lat, 4);
  const rLng = round(lng, 4);
  const cacheKey = `nom:rev:${rLat}:${rLng}`;

  const { value } = await cacheThrough(cacheKey, TTL, async () => {
    const url = `${NOMINATIM_BASE}/reverse?format=json&addressdetails=1&lat=${rLat}&lon=${rLng}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, { headers: headers(), cache: "no-store", signal: ac.signal });
    } catch (err) {
      throw new UpstreamError("Nominatim reverse fetch failed", err);
    } finally {
      clearTimeout(tid);
    }

    if (res.status === 429) throw new NominatimRateLimitError();
    if (!res.ok) throw new NominatimFetchError(res.status);

    const raw: OsmReverseItem = (await res.json()) as OsmReverseItem;
    const result: NominatimResult = {
      label: raw.display_name,
      lat: rLat,
      lng: rLng,
      city: extractCity(raw.address),
      country: raw.address?.country,
    };
    console.info(JSON.stringify({ evt: "nominatim:reverse", lat: rLat, lng: rLng }));
    return result;
  });

  return value;
}
