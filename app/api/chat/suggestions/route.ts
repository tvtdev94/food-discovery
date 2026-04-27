import "server-only";
import { z } from "zod";
import { NextRequest } from "next/server";

import { ratelimitChatSuggestions, redis } from "@/lib/redis";
import { getWeather } from "@/lib/tools/weather";
import { cacheThrough } from "@/lib/tools/cache";
import {
  getHourBucket,
  getWeatherKey,
  buildCacheKey,
} from "@/lib/chat/build-suggestions-context";
import { generateSuggestions, type ChipItem } from "@/lib/chat/llm-suggestions";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/suggestions
 *
 * Trả 6 quick-chip prompt VI sinh bởi LLM theo context (location/hour/weather).
 * Composite cache 1h: `chips:{rLat2}:{rLng2}:{hourBucket}:{weatherKey}`.
 *
 * UX: never 5xx. Mọi failure (rate limit, weather down, LLM fail) → trả
 * `{ chips: [] }` 200. Client render skeleton briefly rồi disappear silent.
 */

const BodySchema = z.object({
  lat: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 90, {
    message: "lat must be a finite number in [-90, 90]",
  }),
  lng: z.number().refine((v) => Number.isFinite(v) && Math.abs(v) <= 180, {
    message: "lng must be a finite number in [-180, 180]",
  }),
});

const CACHE_TTL_SEC = 3600;
const NEGATIVE_CACHE_TTL_SEC = 60;

const FALLBACK_WEATHER = {
  tempC: 28,
  condition: "unknown",
  rainProbPct: 0,
  isDay: true,
  ts: Date.now(),
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: z.infer<typeof BodySchema>;
    try {
      const raw: unknown = await req.json();
      body = BodySchema.parse(raw);
    } catch {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    // Identity gentle: deviceId header preferred, fallback IP for ratelimit key.
    const deviceId = req.headers.get("x-device-id")?.trim() || null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const rateKey = deviceId ?? ip;

    const limit = await ratelimitChatSuggestions.limit(rateKey);
    if (!limit.success) {
      log.info("chips.throttled", { rateKey: rateKey.slice(0, 12) });
      return Response.json({ chips: [] }, { status: 200 });
    }

    // Weather: fallback "mild" nếu fail để cache key vẫn deterministic.
    let weather;
    try {
      weather = await getWeather(body.lat, body.lng);
    } catch (err) {
      log.warn("chips.weather_fail", { err: String(err).slice(0, 80) });
      weather = { ...FALLBACK_WEATHER, ts: Date.now() };
    }

    const hourBucket = getHourBucket(new Date());
    const weatherKey = getWeatherKey(weather);
    const key = buildCacheKey(body.lat, body.lng, hourBucket, weatherKey);

    const t0 = Date.now();
    const { value: chips, cached } = await cacheThrough<ChipItem[]>(
      key,
      CACHE_TTL_SEC,
      () =>
        generateSuggestions({
          lat: body.lat,
          lng: body.lng,
          hourBucket,
          weatherKey,
          weather,
        }),
    );
    const ms = Date.now() - t0;

    log.info(cached ? "chips.hit" : "chips.miss", {
      key,
      ms,
      count: chips.length,
    });

    // Negative cache: nếu produce() vừa run + trả [] (LLM fail) → set TTL
    // ngắn 60s thay vì 1h để tránh user thấy chips empty 1h khi LLM phục hồi.
    if (!cached && chips.length === 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await redis.set(key, [] as any, { ex: NEGATIVE_CACHE_TTL_SEC });
      } catch {
        // Best-effort; existing 1h cache vẫn ghi đè bởi cacheThrough trước đó.
      }
    }

    return Response.json({ chips }, { status: 200 });
  } catch (err) {
    log.warn("chips.route_unhandled", { err: String(err).slice(0, 120) });
    return Response.json({ chips: [] }, { status: 200 });
  }
}
