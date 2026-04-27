import "server-only";
import { env } from "@/lib/env";
import { round, sha1Hex } from "@/lib/utils";
import { log } from "@/lib/logger";
import { cacheThrough } from "@/lib/tools/cache";
import { UpstreamError, RateLimitError } from "@/lib/tools/errors";
import { checkAndIncrementBudget, maxCallsForBudget } from "@/lib/observability/budget-guard";
import type { Place } from "@/lib/tools/types";

// Re-export so existing consumers (tests etc.) keep their import path working.
export { maxCallsForBudget };

const SEARCHAPI_ENDPOINT = "https://www.searchapi.io/api/v1/search";
const TIMEOUT_MS = 5_000;
const TTL_SEC = 600; // 10 min

// --- Price level mapping ---
// SearchApi returns `price` as "$", "$$", "$$$", "$$$$" (or undefined).

function coercePriceLevel(raw: string | undefined | null): Place["priceLevel"] {
  if (!raw) return null;
  const n = raw.length;
  if (n >= 1 && n <= 4) return n as 1 | 2 | 3 | 4;
  return null;
}

/**
 * Upgrade Google `googleusercontent.com` image URLs to HD by replacing the
 * trailing size suffix. Common patterns:
 *   `...=w408-h272-k-no`     → `=w1600-h900-k-no`
 *   `...=s88-...`            → `=s1600-...`
 *   `...=w200-h200-no-rj`    → `=w1600-h900-no-rj`
 * Non-Google URLs returned unchanged.
 */
function upgradeImageUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (!/googleusercontent\.com/i.test(url)) return url;

  // Pattern A: `=w<n>-h<n>...` → bump to w1600-h900 keeping trailing flags.
  // Pattern B: `=s<n>...`      → bump to s1600 keeping trailing flags.
  return url
    .replace(/=w\d+-h\d+/i, "=w1600-h900")
    .replace(/=s\d+/i, "=s1600");
}

// --- SearchApi response shapes (subset we rely on) ---

interface SapiGps {
  latitude?: number;
  longitude?: number;
}

interface SapiLocalResult {
  place_id?: string;
  data_id?: string;
  title?: string;
  address?: string;
  phone?: string;
  rating?: number;
  reviews?: number;
  price?: string;
  types?: string[];
  type?: string;
  open_state?: string;
  gps_coordinates?: SapiGps;
  thumbnail?: string;
  images?: Array<{ thumbnail?: string; image?: string } | string>;
  link?: string;
}

interface SapiResponse {
  local_results?: SapiLocalResult[];
  error?: string;
}

// --- Normalise raw API item → Place ---

function normalisePlaceItem(item: SapiLocalResult): Place | null {
  const placeId = item.place_id || item.data_id;
  const name = item.title;
  // Both id and name are required to form a usable Place.
  if (!placeId || !name) return null;

  // open_state examples: "Open", "Open ⋅ Closes 10 PM", "Closed", "Temporarily closed".
  let openNow: boolean | null = null;
  if (item.open_state) {
    const s = item.open_state.toLowerCase();
    if (s.startsWith("open")) openNow = true;
    else if (s.startsWith("closed") || s.startsWith("temporarily")) openNow = false;
  }

  // SearchApi doesn't surface a direct googleMapsUri. Build a canonical one
  // from the place_id (works on all platforms; client maps-deep-link.ts will
  // further transform for iOS/Android native apps).
  const mapsUri = item.link
    ? item.link
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`;

  // Thumbnail priority — pick HIGH-RES first to tránh blur khi stretch lên
  // hero card 640×176. SearchApi `item.thumbnail` thường là 88×88 → mờ.
  // `images[0].image` là original/full-res → sắc nét.
  //   1. images[0].image      (full-res, ưu tiên)
  //   2. images[0].thumbnail  (medium)
  //   3. raw string trong images[0] (some shapes)
  //   4. item.thumbnail       (small fallback)
  let thumbnail: string | undefined;
  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0];
    if (typeof first === "string") {
      thumbnail = first;
    } else {
      thumbnail = first.image ?? first.thumbnail;
    }
  }
  if (!thumbnail) thumbnail = item.thumbnail;
  // Upgrade Google CDN size suffix → HD. Pattern: `=w408-h272-k-no` hoặc
  // `=s88-...`. Thay bằng `=w1600-h900` để có nét. URL non-Google bỏ qua.
  thumbnail = upgradeImageUrl(thumbnail);

  return {
    placeId,
    name,
    address: item.address ?? "",
    lat: item.gps_coordinates?.latitude ?? 0,
    lng: item.gps_coordinates?.longitude ?? 0,
    rating: item.rating ?? null,
    reviews: item.reviews ?? null,
    priceLevel: coercePriceLevel(item.price),
    types: item.types ?? (item.type ? [item.type] : []),
    openNow,
    mapsUri,
    phone: item.phone,
    thumbnail,
  };
}

// --- Fetch from SearchApi.io Google Maps engine ---

interface FindPlacesParams {
  query: string;
  lat: number;
  lng: number;
  radiusM: number;
  openNow?: boolean;
  maxPrice?: number;
}

async function fetchPlaces(params: FindPlacesParams): Promise<Place[]> {
  const { query, lat, lng, radiusM } = params;

  // SearchApi `ll` format: `@lat,lng,Nm` (N = radius in meters, 62..18636559).
  const clampedRadius = Math.max(62, Math.min(18_636_559, Math.round(radiusM)));
  const ll = `@${lat},${lng},${clampedRadius}m`;

  const url = new URL(SEARCHAPI_ENDPOINT);
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("q", query);
  url.searchParams.set("ll", ll);
  url.searchParams.set("hl", "vi");
  url.searchParams.set("gl", "vn");
  url.searchParams.set("api_key", env.SEARCHAPI_API_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new UpstreamError("SearchApi fetch failed", err);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new RateLimitError();
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    log.error("places.http_error", { status: res.status, body: bodyText.slice(0, 300) });
    throw new UpstreamError(`SearchApi returned HTTP ${res.status}`, undefined, res.status);
  }

  const data = (await res.json()) as SapiResponse;
  if (data.error) {
    log.error("places.api_error", { err: String(data.error).slice(0, 200) });
    throw new UpstreamError(`SearchApi error: ${String(data.error).slice(0, 120)}`);
  }

  const results = (data.local_results ?? [])
    .slice(0, 15)
    .map(normalisePlaceItem)
    .filter((p): p is Place => p !== null);

  // Debug: first-call thumbnail audit so we can tell if SearchApi returns usable URLs.
  if (results.length > 0) {
    const sample = results[0];
    log.info("places.sample", {
      name: sample.name,
      thumb_present: Boolean(sample.thumbnail),
      thumb_preview: sample.thumbnail ? String(sample.thumbnail).slice(0, 80) : null,
      phone_present: Boolean(sample.phone),
    });
  }

  return results;
}

/**
 * Finds nearby restaurant places matching the query via SearchApi.io (Google Maps engine).
 * Results cached 10 min on rounded lat/lng + query hash + search params.
 * Budget guard runs ONLY on cache miss.
 *
 * Note: SearchApi doesn't expose explicit `open_now` / `price_level` filters — the
 * rule filter (lib/tools/rule-filter.ts) enforces those against normalised results.
 */
export async function findPlaces(params: FindPlacesParams): Promise<Place[]> {
  const { query, lat, lng, radiusM, openNow, maxPrice } = params;
  const rLat = round(lat, 3);
  const rLng = round(lng, 3);
  const queryHash = await sha1Hex(query.toLowerCase().trim());
  // v3: bump after thumbnail priority + Google CDN URL upgrade fix (HD images).
  const key = `places:v3:${rLat}:${rLng}:${queryHash}:${radiusM}:${openNow ? 1 : 0}:${maxPrice ?? "x"}`;
  const t0 = Date.now();

  // Produce fn wraps budget check + fetch + single retry on network/5xx.
  async function produce(): Promise<Place[]> {
    await checkAndIncrementBudget();
    try {
      return await fetchPlaces({ query, lat: rLat, lng: rLng, radiusM, openNow, maxPrice });
    } catch (err) {
      const isRetryable =
        err instanceof UpstreamError &&
        !(err instanceof RateLimitError) &&
        (err.status === undefined || err.status >= 500);
      if (isRetryable) {
        await new Promise((r) => setTimeout(r, 500));
        return fetchPlaces({ query, lat: rLat, lng: rLng, radiusM, openNow, maxPrice });
      }
      throw err;
    }
  }

  const { value, cached } = await cacheThrough(key, TTL_SEC, produce);
  const ms = Date.now() - t0;
  log.info(cached ? "places.hit" : "places.miss", { query, lat: rLat, lng: rLng, ms, count: value.length });
  return value;
}
