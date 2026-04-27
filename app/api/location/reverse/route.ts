import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ratelimitGeocode, ratelimitGeocodeIp } from "@/lib/redis";
import { getClientIp, getSessionKey } from "@/lib/auth/rate-key";
import { reverseLookup, NominatimRateLimitError, NominatimFetchError } from "@/lib/location/nominatim";
import { bigDataCloudReverse } from "@/lib/location/bigdatacloud-reverse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    lat: req.nextUrl.searchParams.get("lat"),
    lng: req.nextUrl.searchParams.get("lng"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid lat/lng" },
      { status: 400 },
    );
  }
  const { lat, lng } = parsed.data;

  // H3: apply IP-keyed limit first (prevents header-rotation bypass), then session limit.
  const ip = getClientIp(req);
  const { success: ipOk } = await ratelimitGeocodeIp.limit(ip);
  if (!ipOk) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const sessionKey = getSessionKey(req);
  const { success: sessionOk } = await ratelimitGeocode.limit(sessionKey);
  if (!sessionOk) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "1" } },
    );
  }

  // Try Nominatim first (richer labels); fall back to BigDataCloud on any failure
  // (typical cause: OSM blocking UA with bogus email).
  try {
    const result = await reverseLookup(lat, lng);
    return NextResponse.json({ label: result.label, city: result.city, country: result.country });
  } catch (err) {
    if (err instanceof NominatimRateLimitError) {
      console.info(JSON.stringify({ evt: "nominatim:upstream_429", lat, lng }));
    } else if (err instanceof NominatimFetchError) {
      console.info(JSON.stringify({ evt: "nominatim:fetch_error", status: err.status, lat, lng }));
    } else {
      console.info(JSON.stringify({ evt: "nominatim:unexpected", lat, lng }));
    }
    // Fallback: BigDataCloud (no UA policy).
    try {
      const result = await bigDataCloudReverse(lat, lng);
      return NextResponse.json({ label: result.label, city: result.city, country: result.country });
    } catch (fallbackErr) {
      console.error(JSON.stringify({ evt: "reverse:all_failed", lat, lng, err: String(fallbackErr).slice(0, 120) }));
      return NextResponse.json({ error: "Reverse geocode service unavailable" }, { status: 503 });
    }
  }
}
