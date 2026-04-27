import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/redis", () => ({
  ratelimitChatSuggestions: { limit: vi.fn() },
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

vi.mock("@/lib/tools/weather", () => ({
  getWeather: vi.fn(),
}));

vi.mock("@/lib/tools/cache", () => ({
  cacheThrough: vi.fn(),
}));

vi.mock("@/lib/chat/llm-suggestions", () => ({
  generateSuggestions: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/chat/suggestions/route";
import { ratelimitChatSuggestions, redis } from "@/lib/redis";
import { getWeather } from "@/lib/tools/weather";
import { cacheThrough } from "@/lib/tools/cache";
import { generateSuggestions } from "@/lib/chat/llm-suggestions";
import { NextRequest } from "next/server";

function makeReq(body: unknown, deviceId = "dev-1"): NextRequest {
  return new NextRequest("http://localhost/api/chat/suggestions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": deviceId,
    },
    body: JSON.stringify(body),
  });
}

function rateOk() {
  return {
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 300000,
    pending: Promise.resolve(),
  } as Awaited<ReturnType<typeof ratelimitChatSuggestions.limit>>;
}

function rateBlocked() {
  return {
    success: false,
    limit: 5,
    remaining: 0,
    reset: Date.now() + 300000,
    pending: Promise.resolve(),
  } as Awaited<ReturnType<typeof ratelimitChatSuggestions.limit>>;
}

const FAKE_WEATHER = {
  tempC: 28,
  condition: "clear",
  rainProbPct: 0,
  isDay: true,
  ts: Date.now(),
};

import type { ChipItem } from "@/lib/chat/llm-suggestions";

const VALID_CHIPS: ChipItem[] = [
  { prompt: "Phở nóng?", iconName: "Soup", tone: "blue" },
  { prompt: "Cà phê chiều", iconName: "Coffee", tone: "amber" },
  { prompt: "Bún đậu", iconName: "Sandwich", tone: "green" },
  { prompt: "Đi nhóm", iconName: "Users", tone: "rose" },
  { prompt: "Ít tiền", iconName: "Wallet", tone: "pink" },
  { prompt: "Quán ngon", iconName: "Sparkles", tone: "purple" },
];

describe("POST /api/chat/suggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 + chips on cache hit", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockResolvedValueOnce(FAKE_WEATHER);
    vi.mocked(cacheThrough).mockResolvedValueOnce({
      value: VALID_CHIPS,
      cached: true,
    });

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { chips: typeof VALID_CHIPS };
    expect(json.chips).toHaveLength(6);
    expect(generateSuggestions).not.toHaveBeenCalled();
  });

  it("returns 200 + chips on cache miss (LLM produces)", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockResolvedValueOnce(FAKE_WEATHER);
    vi.mocked(cacheThrough).mockImplementationOnce(async (_k, _ttl, produce) => ({
      value: await produce(),
      cached: false,
    }));
    vi.mocked(generateSuggestions).mockResolvedValueOnce(VALID_CHIPS);

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { chips: typeof VALID_CHIPS };
    expect(json.chips).toHaveLength(6);
    expect(generateSuggestions).toHaveBeenCalledTimes(1);
  });

  it("returns 400 on invalid body (lat string)", async () => {
    const res = await POST(makeReq({ lat: "abc", lng: 106.7 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on lat out of range", async () => {
    const res = await POST(makeReq({ lat: 999, lng: 106.7 }));
    expect(res.status).toBe(400);
  });

  it("returns 200 + empty chips when rate limited (silent throttle)", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateBlocked());

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { chips: unknown[] };
    expect(json.chips).toEqual([]);
    expect(getWeather).not.toHaveBeenCalled();
  });

  it("falls back to mild weather when getWeather throws", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockRejectedValueOnce(new Error("weather down"));
    vi.mocked(cacheThrough).mockResolvedValueOnce({
      value: VALID_CHIPS,
      cached: false,
    });

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    expect(cacheThrough).toHaveBeenCalled();
  });

  it("sets negative cache (60s TTL) when LLM returns empty array on miss", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockResolvedValueOnce(FAKE_WEATHER);
    vi.mocked(cacheThrough).mockResolvedValueOnce({ value: [], cached: false });

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { chips: unknown[] };
    expect(json.chips).toEqual([]);

    // Negative cache override
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^chips:/),
      expect.any(Array),
      { ex: 60 },
    );
  });

  it("does NOT set negative cache when chips empty BUT cached=true (already cached)", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockResolvedValueOnce(FAKE_WEATHER);
    vi.mocked(cacheThrough).mockResolvedValueOnce({ value: [], cached: true });

    await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("returns 200 + empty on unhandled inner error (no 5xx)", async () => {
    vi.mocked(ratelimitChatSuggestions.limit).mockResolvedValueOnce(rateOk());
    vi.mocked(getWeather).mockResolvedValueOnce(FAKE_WEATHER);
    vi.mocked(cacheThrough).mockRejectedValueOnce(new Error("redis exploded"));

    const res = await POST(makeReq({ lat: 10.77, lng: 106.7 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { chips: unknown[] };
    expect(json.chips).toEqual([]);
  });
});
