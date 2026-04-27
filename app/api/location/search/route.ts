import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ratelimitGeocode, ratelimitGeocodeIp } from "@/lib/redis";
import { getClientIp, getSessionKey } from "@/lib/auth/rate-key";
import { searchPlaces, NominatimRateLimitError, NominatimFetchError } from "@/lib/location/nominatim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(3, "Query must be at least 3 characters").max(200),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({ q: req.nextUrl.searchParams.get("q") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }
  const { q } = parsed.data;

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

  try {
    const results = await searchPlaces(q);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof NominatimRateLimitError) {
      console.info(JSON.stringify({ evt: "nominatim:upstream_429", q }));
      return NextResponse.json({ error: "Upstream rate limit" }, { status: 503 });
    }
    if (err instanceof NominatimFetchError) {
      console.error(JSON.stringify({ evt: "nominatim:fetch_error", status: err.status, q }));
    }
    return NextResponse.json({ error: "Search service unavailable" }, { status: 503 });
  }
}
