import "server-only";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { env } from "@/lib/env";

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

// Chat: 20 turns/session/10min + 100 turns/IP/hour.
export const ratelimitChatSession = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  prefix: "rl:chat:session",
  analytics: false,
});
export const ratelimitChatIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "1 h"),
  prefix: "rl:chat:ip",
  analytics: false,
});

// Nominatim proxy: 1 req/s/session (client key).
export const ratelimitGeocode = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "1 s"),
  prefix: "rl:geo:session",
  analytics: false,
});

// Nominatim proxy: 30 req/min/IP (H3 — IP-keyed layer; both limits must pass).
export const ratelimitGeocodeIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "rl:geo:ip",
  analytics: false,
});

// IP geolocate: 10 req/min/IP (H4 — guards ipapi.co quota).
export const ratelimitIpGeo = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "rl:ipgeo:ip",
  analytics: false,
});

// Login: 5/min/IP.
export const ratelimitLoginIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "rl:login:ip",
  analytics: false,
});

// Chat prewarm: 1 fire / 5 min / device. Avoids spam khi user refocus tab.
export const ratelimitChatPrewarm = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(1, "5 m"),
  prefix: "rl:chat:prewarm",
  analytics: false,
});

// Chat suggestions chips: 5 req / 5 min / device. Cao hơn prewarm (1/5min) vì
// user có thể refresh chips khi đổi khu vực; thấp hơn chat (20/10min) vì
// LLM cost cao hơn SearchApi.
export const ratelimitChatSuggestions = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "5 m"),
  prefix: "rl:chat:suggestions",
  analytics: false,
});
