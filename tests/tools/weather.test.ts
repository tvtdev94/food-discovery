import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    PLACES_DAILY_BUDGET_USD: 5,
    SEARCHAPI_API_KEY: "key",
    NOMINATIM_USER_AGENT: "test/0.1 (test@example.com)",
  },
}));

import { redis } from "@/lib/redis";
import { getWeather, weatherCodeToCondition } from "@/lib/tools/weather";

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

function makeOpenMeteoResponse(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      temperature_2m: 28.5,
      weather_code: 0,
      is_day: 1,
      precipitation_probability: 10,
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("weatherCodeToCondition", () => {
  it("maps code 0 → clear", () => expect(weatherCodeToCondition(0)).toBe("clear"));
  it("maps code 2 → cloudy", () => expect(weatherCodeToCondition(2)).toBe("cloudy"));
  it("maps code 63 → rain", () => expect(weatherCodeToCondition(63)).toBe("rain"));
  it("maps code 95 → thunderstorm", () => expect(weatherCodeToCondition(95)).toBe("thunderstorm"));
  it("maps code 53 → drizzle", () => expect(weatherCodeToCondition(53)).toBe("drizzle"));
  it("maps code 45 → fog", () => expect(weatherCodeToCondition(45)).toBe("fog"));
  it("maps code 73 → snow", () => expect(weatherCodeToCondition(73)).toBe("snow"));
  it("maps code 80 → rain-showers", () => expect(weatherCodeToCondition(80)).toBe("rain-showers"));
  it("returns unknown for unrecognised code", () => expect(weatherCodeToCondition(999)).toBe("unknown"));
});

describe("getWeather", () => {
  it("fetches and returns correct Weather shape on cache miss", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenMeteoResponse()), { status: 200 }),
    );

    const result = await getWeather(21.03, 105.85);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.tempC).toBe(28.5);
    expect(result.condition).toBe("clear");
    expect(result.isDay).toBe(true);
    expect(result.rainProbPct).toBe(10);
    expect(typeof result.ts).toBe("number");

    // Verify cache was written
    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("weather:v1:"),
      expect.objectContaining({ tempC: 28.5 }),
      { ex: 900 },
    );
  });

  it("returns cached value without calling fetch on cache hit", async () => {
    const cachedWeather = {
      tempC: 22,
      condition: "cloudy",
      rainProbPct: 30,
      isDay: false,
      ts: Date.now() - 60_000,
    };
    mockRedis.get.mockResolvedValue(cachedWeather);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await getWeather(21.03, 105.85);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.tempC).toBe(22);
    expect(result.condition).toBe("cloudy");
  });

  it("uses rounded lat/lng in cache key", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(makeOpenMeteoResponse()), { status: 200 }),
    );

    await getWeather(21.0367, 105.8523);

    // Cache key should use 2-decimal rounding: 21.04, 105.85
    expect(mockRedis.set).toHaveBeenCalledWith(
      "weather:v1:21.04:105.85",
      expect.any(Object),
      { ex: 900 },
    );
  });

  it("throws UpstreamError on non-200 response", async () => {
    mockRedis.get.mockResolvedValue(null);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    await expect(getWeather(0, 0)).rejects.toThrow("Open-Meteo returned HTTP 500");
  });
});
