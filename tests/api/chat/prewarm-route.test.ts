import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only module
vi.mock("server-only", () => ({}));

vi.mock("@/lib/redis", () => ({
  ratelimitChatPrewarm: {
    limit: vi.fn(),
  },
}));

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveIdentity: vi.fn().mockResolvedValue({ ownerKey: "owner-abc" }),
}));

vi.mock("@/lib/tools/places", () => ({
  findPlaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from "@/app/api/chat/prewarm/route";
import { ratelimitChatPrewarm } from "@/lib/redis";
import { findPlaces } from "@/lib/tools/places";
import { NextRequest } from "next/server";

function makeReq(body: unknown, deviceId = "dev-1"): NextRequest {
  return new NextRequest("http://localhost/api/chat/prewarm", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": deviceId,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/prewarm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 202 on success", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: 16.07, lng: 108.22 }));

    expect(res.status).toBe(202);
  });

  it("returns 202 with accepted true on success", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: 16.07, lng: 108.22 }));
    const json = (await res.json()) as unknown;

    expect(res.status).toBe(202);
    expect(json).toMatchObject({ accepted: true });
  });

  it("fires findPlaces multiple times on success", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: 16.07, lng: 108.22 }));
    expect(res.status).toBe(202);

    // allSettled is fire-and-forget — give microtask a tick
    await new Promise((r) => setImmediate(r));

    const callCount = vi.mocked(findPlaces).mock.calls.length;
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  it("returns 202 with throttled true on ratelimit miss", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: 1, lng: 2 }));
    const json = (await res.json()) as unknown;

    expect(res.status).toBe(202);
    expect(json).toMatchObject({ accepted: false, throttled: true });
  });

  it("returns 400 on invalid body (missing lat)", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lng: 108.22 }));

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid body (non-number lat)", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: "bad", lng: 108.22 }));

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const req = new NextRequest("http://localhost/api/chat/prewarm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("uses deviceId from header for ratelimit key", async () => {
    vi.mocked(ratelimitChatPrewarm.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    });

    const res = await POST(makeReq({ lat: 16.07, lng: 108.22 }, "custom-device-id"));
    expect(res.status).toBe(202);

    expect(vi.mocked(ratelimitChatPrewarm.limit)).toHaveBeenCalledWith("custom-device-id");
  });
});
