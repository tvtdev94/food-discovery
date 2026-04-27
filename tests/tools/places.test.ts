import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://redis.example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
    PLACES_DAILY_BUDGET_USD: 5,
    SEARCHAPI_API_KEY: "test-api-key",
    NOMINATIM_USER_AGENT: "test/0.1 (test@example.com)",
  },
}));

import { redis } from "@/lib/redis";
import { findPlaces, maxCallsForBudget } from "@/lib/tools/places";
import { BudgetExceededError } from "@/lib/tools/errors";

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
};

// Minimal SearchApi.io (engine=google_maps) response fixture
function makeSapiResponse() {
  return {
    local_results: [
      {
        place_id: "ChIJplace1",
        title: "Pho Bo Hanoi",
        address: "123 Hang Bac, Hoan Kiem, Ha Noi",
        gps_coordinates: { latitude: 21.0285, longitude: 105.8542 },
        rating: 4.6,
        reviews: 320,
        price: "$$",
        types: ["restaurant", "food"],
        open_state: "Open ⋅ Closes 10 PM",
        link: "https://maps.google.com/?cid=1",
      },
      {
        place_id: "ChIJplace2",
        title: "Bun Cha Huong Lien",
        address: "24 Le Van Huu, Hai Ba Trung, Ha Noi",
        gps_coordinates: { latitude: 21.0199, longitude: 105.8487 },
        rating: 4.3,
        reviews: 1200,
        price: "$",
        types: ["restaurant"],
        open_state: "Closed ⋅ Opens 7 AM",
        link: "https://maps.google.com/?cid=2",
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findPlaces", () => {
  it("normalises SearchApi response to Place[]", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    let capturedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify(makeSapiResponse()), { status: 200 });
    });

    const places = await findPlaces({
      query: "phở",
      lat: 21.03,
      lng: 105.85,
      radiusM: 2000,
    });

    // Field normalisation
    expect(places[0].placeId).toBe("ChIJplace1");
    expect(places[0].name).toBe("Pho Bo Hanoi");
    expect(places[0].lat).toBe(21.0285);
    expect(places[0].lng).toBe(105.8542);
    expect(places[0].priceLevel).toBe(2); // "$$" → 2
    expect(places[0].openNow).toBe(true); // open_state "Open..."

    expect(places[1].placeId).toBe("ChIJplace2");
    expect(places[1].priceLevel).toBe(1); // "$" → 1
    expect(places[1].openNow).toBe(false); // open_state "Closed..."

    // URL must target searchapi + carry engine, q, ll, api_key
    expect(capturedUrl).toContain("searchapi.io/api/v1/search");
    expect(capturedUrl).toContain("engine=google_maps");
    expect(capturedUrl).toContain("api_key=test-api-key");
    expect(capturedUrl).toMatch(/ll=%40[\d.]+%2C[\d.]+%2C\d+m/);
  });

  it("returns cached places without API call on cache hit", async () => {
    const cached = [
      {
        placeId: "cached-1",
        name: "Cached Place",
        address: "addr",
        lat: 21.03,
        lng: 105.85,
        rating: 4.0,
        reviews: 50,
        priceLevel: 1,
        types: ["restaurant"],
        openNow: true,
        mapsUri: "https://maps.google.com/?cid=cached",
      },
    ];
    mockRedis.get.mockResolvedValue(cached);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const places = await findPlaces({ query: "phở", lat: 21.03, lng: 105.85, radiusM: 2000 });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockRedis.incr).not.toHaveBeenCalled(); // budget NOT incremented on cache hit
    expect(places[0].placeId).toBe("cached-1");
  });

  it("throws BudgetExceededError when counter exceeds maxCallsForBudget", async () => {
    mockRedis.get.mockResolvedValue(null);
    // incr returns a value beyond the limit
    mockRedis.incr.mockResolvedValue(maxCallsForBudget + 1);
    mockRedis.expire.mockResolvedValue(1);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      findPlaces({ query: "phở", lat: 21.03, lng: 105.85, radiusM: 2000 }),
    ).rejects.toThrow(BudgetExceededError);

    // Fetch must NOT be called when budget is exceeded
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maxCallsForBudget is computed from PLACES_DAILY_BUDGET_USD / 0.02", () => {
    // env mock sets PLACES_DAILY_BUDGET_USD = 5 → floor(5/0.02) = 250
    expect(maxCallsForBudget).toBe(250);
  });

  it("throws RateLimitError on 429 response", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 429 }));

    const { RateLimitError } = await import("@/lib/tools/errors");
    await expect(
      findPlaces({ query: "phở", lat: 21.03, lng: 105.85, radiusM: 2000 }),
    ).rejects.toThrow(RateLimitError);
  });
});
