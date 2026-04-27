import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only before any imports that use it
vi.mock("server-only", () => ({}));

// Mock redis
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock env (required transitively)
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
import { cacheThrough } from "@/lib/tools/cache";

const mockRedis = redis as unknown as {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cacheThrough", () => {
  it("calls produce and stores result on cache miss", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");

    const produce = vi.fn().mockResolvedValue({ foo: "bar" });
    const result = await cacheThrough("test-key", 60, produce);

    expect(produce).toHaveBeenCalledOnce();
    expect(mockRedis.set).toHaveBeenCalledWith("test-key", { foo: "bar" }, { ex: 60 });
    expect(result).toEqual({ value: { foo: "bar" }, cached: false });
  });

  it("returns cached value without calling produce on cache hit", async () => {
    mockRedis.get.mockResolvedValue({ foo: "cached" });

    const produce = vi.fn();
    const result = await cacheThrough("test-key", 60, produce);

    expect(produce).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
    expect(result).toEqual({ value: { foo: "cached" }, cached: true });
  });

  it("treats redis read failure as cache miss", async () => {
    mockRedis.get.mockRejectedValue(new Error("Redis down"));
    mockRedis.set.mockResolvedValue("OK");

    const produce = vi.fn().mockResolvedValue(42);
    const result = await cacheThrough("test-key", 60, produce);

    expect(produce).toHaveBeenCalledOnce();
    expect(result).toEqual({ value: 42, cached: false });
  });

  it("throws UpstreamError when redis write fails after produce", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockRejectedValue(new Error("Redis write down"));

    const produce = vi.fn().mockResolvedValue("value");

    await expect(cacheThrough("test-key", 60, produce)).rejects.toThrow("Redis write failed");
  });
});
