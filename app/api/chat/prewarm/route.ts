import "server-only";
import { z } from "zod";
import { NextRequest } from "next/server";
import { ratelimitChatPrewarm } from "@/lib/redis";
import { findPlaces } from "@/lib/tools/places";
import { getDefaultPrewarmQueries } from "@/lib/chat/prewarm-cache";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

const PREWARM_RADIUS_M = 2000;

/**
 * POST /api/chat/prewarm
 *
 * Fire-and-forget endpoint. Khi client có location ready, gọi 1 lần để
 * pre-warm SearchApi cache cho 3-5 query phổ biến theo giờ. Trả 202 NGAY,
 * không chờ findPlaces — Promise.allSettled chạy background.
 *
 * Debounce 5min/device qua Upstash. Identity gentle: chấp nhận guest
 * (deviceId-only). Budget guard đã có sẵn trong findPlaces.
 */
export async function POST(req: NextRequest): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    const raw: unknown = await req.json();
    body = BodySchema.parse(raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // Gentle identity: deviceId header preferred, fallback to IP for ratelimit key.
  const deviceId = req.headers.get("x-device-id")?.trim() || null;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rateKey = deviceId ?? ip;

  const limit = await ratelimitChatPrewarm.limit(rateKey);
  if (!limit.success) {
    return Response.json({ accepted: false, throttled: true }, { status: 202 });
  }

  const queries = getDefaultPrewarmQueries(new Date());
  // Round lat/lng to 3 decimals (~110m) to reduce PII granularity in logs.
  log.info("prewarm.fire", {
    count: queries.length,
    lat: Math.round(body.lat * 1000) / 1000,
    lng: Math.round(body.lng * 1000) / 1000,
  });

  // Fire-and-forget. Don't await — return 202 immediately. Errors swallowed
  // so a slow/failed SearchApi call never propagates as an unhandled rejection.
  void Promise.allSettled(
    queries.map((q) =>
      findPlaces({ query: q, lat: body.lat, lng: body.lng, radiusM: PREWARM_RADIUS_M }),
    ),
  ).catch(() => {
    /* impossible — allSettled never rejects, but belt-and-suspenders */
  });

  return Response.json({ accepted: true, queries: queries.length }, { status: 202 });
}
