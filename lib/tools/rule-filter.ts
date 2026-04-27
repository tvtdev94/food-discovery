/** Pure function — no server-only import needed. Filters and sorts Place[] by quality rules. */

import type { Place, FilterOpts } from "@/lib/tools/types";

/**
 * Applies quality filters then sorts by rating descending.
 * Defaults relaxed for VN market: minRating=3.5, minReviews=3.
 * openNow filter: honoured only when caller explicitly sets true AND place has a
 * non-null `openNow` — SearchApi open_state parsing is heuristic, so null places
 * pass through rather than silently dropping.
 */
export function ruleFilter(places: Place[], opts: FilterOpts = {}): Place[] {
  const { minRating = 3.5, minReviews = 3, openNow } = opts;
  return places
    .filter(
      (p) =>
        (p.rating ?? 0) >= minRating &&
        (p.reviews ?? 0) >= minReviews &&
        (openNow ? p.openNow !== false : true),
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 15);
}

/**
 * Haversine distance in km between two lat/lng pairs.
 * Pure — no I/O. Same formula as client `restaurant-card.tsx` (DRY).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Drop quán xa hơn `maxKm` so với user. Cần thiết vì SearchApi `ll=@lat,lng,Nm`
 * chỉ là **bias** không strict — Google có thể trả quán famous trên toàn quốc
 * khi query khớp tên (vd: "Thang Long" tại Huế nhưng quán ở Hà Nội).
 */
export function filterByDistance(
  places: Place[],
  userLat: number,
  userLng: number,
  maxKm: number,
): Place[] {
  return places.filter((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
    if (p.lat === 0 && p.lng === 0) return false;
    return haversineKm(userLat, userLng, p.lat, p.lng) <= maxKm;
  });
}
