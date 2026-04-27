import { type NextRequest, NextResponse } from "next/server";
import { ratelimitIpGeo } from "@/lib/redis";
import { getClientIp } from "@/lib/auth/rate-key";
import { ipGeolocate, IpGeolocateRateLimitError } from "@/lib/location/ip-geolocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);

  // H4: guard ipapi.co quota — 10 req/min/IP.
  const { success } = await ratelimitIpGeo.limit(ip);
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const result = await ipGeolocate(ip);
    if (!result) {
      return NextResponse.json({ error: "Unable to geolocate IP" }, { status: 503 });
    }
    return NextResponse.json(
      { lat: result.lat, lng: result.lng, label: result.label, city: result.city, country: result.country, source: "ip" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof IpGeolocateRateLimitError) {
      console.info(JSON.stringify({ evt: "ip:ratelimit", status: err.status }));
    } else {
      console.error("ip-geolocate error", err);
    }
    return NextResponse.json({ error: "Location service unavailable" }, { status: 503 });
  }
}
