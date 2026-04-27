import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only before any imports that use it
vi.mock("server-only", () => ({}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock env
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "gpt-4o-mini",
    SEARCHAPI_API_KEY: "places-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    NOMINATIM_USER_AGENT: "test/0.1 (test@example.com)",
    PLACES_DAILY_BUDGET_USD: 5,
  },
}));

// Mock redis for budget check
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), incr: vi.fn(), expire: vi.fn() },
  ratelimitChatSession: { limit: vi.fn() },
  ratelimitChatIp: { limit: vi.fn() },
}));

// Mock the tool wrappers
vi.mock("@/lib/tools/weather", () => ({
  getWeather: vi.fn(),
}));
vi.mock("@/lib/tools/places", () => ({
  findPlaces: vi.fn(),
}));

import { dispatchTool } from "@/lib/chat/dispatch-tools";
import { getWeather } from "@/lib/tools/weather";
import { findPlaces } from "@/lib/tools/places";
import { BudgetExceededError } from "@/lib/tools/errors";

const mockGetWeather = getWeather as ReturnType<typeof vi.fn>;
const mockFindPlaces = findPlaces as ReturnType<typeof vi.fn>;

const SAMPLE_WEATHER = {
  tempC: 30,
  condition: "clear",
  rainProbPct: 5,
  isDay: true,
  ts: Date.now(),
};

const SAMPLE_PLACE = {
  placeId: "place-1",
  name: "Phở Hà Nội",
  address: "123 Đường Láng",
  lat: 21.02,
  lng: 105.83,
  rating: 4.5,
  reviews: 120,
  priceLevel: 2,
  types: ["restaurant"],
  openNow: true,
  mapsUri: "https://maps.google.com/?cid=1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatchTool — get_weather", () => {
  it("calls getWeather with parsed lat/lng and returns weather object", async () => {
    mockGetWeather.mockResolvedValue(SAMPLE_WEATHER);

    const result = await dispatchTool("get_weather", { lat: 21.02, lng: 105.83 });

    expect(mockGetWeather).toHaveBeenCalledWith(21.02, 105.83);
    expect(result).toEqual(SAMPLE_WEATHER);
  });

  it("accepts JSON string args", async () => {
    mockGetWeather.mockResolvedValue(SAMPLE_WEATHER);

    const result = await dispatchTool("get_weather", JSON.stringify({ lat: 10.5, lng: 106.7 }));

    expect(mockGetWeather).toHaveBeenCalledWith(10.5, 106.7);
    expect(result).toEqual(SAMPLE_WEATHER);
  });

  it("propagates non-budget errors", async () => {
    mockGetWeather.mockRejectedValue(new Error("network error"));

    await expect(dispatchTool("get_weather", { lat: 10, lng: 106 })).rejects.toThrow("network error");
  });
});

describe("dispatchTool — find_places", () => {
  it("calls findPlaces with correct params and wraps result in { places }", async () => {
    mockFindPlaces.mockResolvedValue([SAMPLE_PLACE]);

    const result = await dispatchTool("find_places", {
      query: "phở bò",
      lat: 21.02,
      lng: 105.83,
      radius_m: 1500,
      open_now: true,
      max_price: 3,
    });

    expect(mockFindPlaces).toHaveBeenCalledWith({
      query: "phở bò",
      lat: 21.02,
      lng: 105.83,
      radiusM: 1500,
      openNow: true,
      maxPrice: 3,
    });
    expect(result).toEqual({ places: [SAMPLE_PLACE] });
  });

  it("uses default radius_m when not provided", async () => {
    mockFindPlaces.mockResolvedValue([]);

    await dispatchTool("find_places", { query: "bún chả", lat: 21.0, lng: 105.8 });

    expect(mockFindPlaces).toHaveBeenCalledWith(
      expect.objectContaining({ radiusM: 2000 }),
    );
  });

  it("maps BudgetExceededError to { error: 'budget_exceeded' } without throwing", async () => {
    mockFindPlaces.mockRejectedValue(new BudgetExceededError("Daily limit hit"));

    const result = await dispatchTool("find_places", {
      query: "cơm tấm",
      lat: 10.8,
      lng: 106.7,
    });

    expect(result).toEqual({ error: "budget_exceeded" });
  });

  it("propagates non-budget errors from findPlaces", async () => {
    mockFindPlaces.mockRejectedValue(new Error("upstream 500"));

    await expect(
      dispatchTool("find_places", { query: "lẩu", lat: 10.8, lng: 106.7 }),
    ).rejects.toThrow("upstream 500");
  });
});

describe("dispatchTool — unknown tool", () => {
  it("returns { error: 'unknown_tool', name } for unrecognised tool name", async () => {
    const result = await dispatchTool("resolve_location", { address: "Hà Nội" });

    expect(result).toEqual({ error: "unknown_tool", name: "resolve_location" });
  });
});

describe("dispatchTool — BudgetExceededError on get_weather", () => {
  it("maps BudgetExceededError to { error: 'budget_exceeded' } for get_weather too", async () => {
    mockGetWeather.mockRejectedValue(new BudgetExceededError());

    const result = await dispatchTool("get_weather", { lat: 10, lng: 106 });

    expect(result).toEqual({ error: "budget_exceeded" });
  });
});
