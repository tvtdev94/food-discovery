import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { ipGeolocate, IpGeolocateRateLimitError } from "@/lib/location/ip-geolocate";
import { redis } from "@/lib/redis";
import { UpstreamError } from "@/lib/tools/errors";

// Mock fetch globally
global.fetch = vi.fn();

describe("ipGeolocate — IP lookup, Redis cache, error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: ipapi.co success → returns lat, lng, label", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null); // Cache miss

    const ipapiResponse = {
      latitude: 10.77,
      longitude: 106.7,
      city: "Ho Chi Minh",
      region: "Ho Chi Minh",
      country_name: "Vietnam",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("203.162.1.1");

    expect(result).toEqual({
      label: "Ho Chi Minh, Ho Chi Minh, Vietnam",
      lat: 10.77,
      lng: 106.7,
      city: "Ho Chi Minh",
      country: "Vietnam",
    });

    // Verify cache set
    expect(mockRedis.set).toHaveBeenCalledWith(
      "geo:ip:203.162.1.1",
      expect.objectContaining({
        lat: 10.77,
        lng: 106.7,
      }),
      { ex: 3600 },
    );
  });

  it("cache hit: 2nd call same IP → no fetch, return cached", async () => {
    const mockRedis = redis as any;
    const cachedResult = {
      label: "Cached Location",
      lat: 10.77,
      lng: 106.7,
      city: "HCM",
      country: "Vietnam",
    };

    mockRedis.get.mockResolvedValue(cachedResult);

    const result = await ipGeolocate("203.162.1.1");

    expect(result).toEqual(cachedResult);

    // Fetch should not be called
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("HTTP 500 error: ipapi.co server error → throws IpGeolocateRateLimitError", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const promise = ipGeolocate("203.162.1.1");

    await expect(promise).rejects.toThrow(IpGeolocateRateLimitError);
  });

  it("malformed response: missing lat → returns null", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const ipapiResponse = {
      // Missing latitude
      longitude: 106.7,
      city: "HCM",
      country_name: "Vietnam",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("203.162.1.1");

    // Null on missing lat/lng
    expect(result).toBeNull();
  });

  it("error response: data.error=true → returns null", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const ipapiResponse = {
      error: true,
      reason: "Invalid IP",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("invalid-ip");

    expect(result).toBeNull();
  });

  it("HTTP error: ipapi.co returns 429 → throws IpGeolocateRateLimitError", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });

    const promise = ipGeolocate("203.162.1.1");

    await expect(promise).rejects.toThrow(IpGeolocateRateLimitError);
  });

  it("fetch reject (network/abort) → throws UpstreamError wrapping the cause", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const networkErr = new Error("ECONNRESET");
    global.fetch = vi.fn().mockRejectedValue(networkErr);

    const promise = ipGeolocate("203.162.1.1");

    await expect(promise).rejects.toBeInstanceOf(UpstreamError);
  });

  it("localhost patterns: '127.0.0.1' → returns null immediately", async () => {
    const result = await ipGeolocate("127.0.0.1");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("localhost patterns: '::1' → returns null immediately", async () => {
    const result = await ipGeolocate("::1");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("localhost patterns: 'localhost' → returns null immediately", async () => {
    const result = await ipGeolocate("localhost");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("localhost patterns: 'unknown' → returns null immediately", async () => {
    const result = await ipGeolocate("unknown");

    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("whitespace handling: trims IP before processing", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const ipapiResponse = {
      latitude: 10.77,
      longitude: 106.7,
      city: "HCM",
      country_name: "Vietnam",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("  203.162.1.1  ");

    // Should work despite whitespace
    expect(result).toBeDefined();
    expect(result?.lat).toBe(10.77);

    // Fetch called with trimmed IP
    const fetchCall = (global.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toContain("203.162.1.1");
  });

  it("label generation: builds from city, region, country", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const ipapiResponse = {
      latitude: 10.77,
      longitude: 106.7,
      city: "Da Nang",
      region: "Da Nang",
      country_name: "Vietnam",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("203.162.1.1");

    expect(result?.label).toBe("Da Nang, Da Nang, Vietnam");
  });

  it("missing country_name: fallback label uses available fields", async () => {
    const mockRedis = redis as any;
    mockRedis.get.mockResolvedValue(null);

    const ipapiResponse = {
      latitude: 10.77,
      longitude: 106.7,
      city: "City",
      // Missing region and country
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(ipapiResponse),
    });

    const result = await ipGeolocate("203.162.1.1");

    // Should still work with partial data
    expect(result?.label).toBe("City");
  });
});
