// Client-safe Maps deep-link builder.
// Detects platform at call-time via navigator.userAgent.
// Scheme allow-list: https, geo, comgooglemaps (no arbitrary schemes).

export interface MapPlace {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
}

/**
 * Returns a platform-appropriate maps URL for the given place.
 * - iOS  → comgooglemaps:// deep link
 * - Android → geo: URI
 * - Desktop / SSR → https://www.google.com/maps/search/
 */
export function buildMapsLink(place: MapPlace): string {
  const { name, placeId, lat, lng } = place;
  const encodedName = encodeURIComponent(name);

  // SSR / server context — no navigator available
  if (typeof navigator === "undefined") {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  const ua = navigator.userAgent;

  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  if (isIos) {
    // comgooglemaps:// deep link; user's Google Maps app handles it.
    // If not installed, the OS will silently fail — out of scope per spec.
    return `comgooglemaps://?q=${encodedName}&center=${lat},${lng}`;
  }

  if (isAndroid) {
    // geo: URI — opened by any maps app registered on the device.
    return `geo:${lat},${lng}?q=${encodeURIComponent(placeId)}`;
  }

  // Desktop fallback
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(placeId)}`;
}
