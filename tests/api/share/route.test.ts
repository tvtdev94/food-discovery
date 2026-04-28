import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/resolve-identity", () => ({
  resolveIdentity: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  ratelimitShare: { limit: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/share/short-id", () => ({
  createShortIdWithRetry: vi.fn(),
}));

vi.mock("@/lib/share/snapshot", () => ({
  buildSnapshot: vi.fn(),
}));

vi.mock("@/lib/env-public", () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: "https://foodapp.test" },
}));

import { POST } from "@/app/api/share/route";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { ratelimitShare } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createShortIdWithRetry } from "@/lib/share/short-id";
import { buildSnapshot } from "@/lib/share/snapshot";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq(body: unknown, deviceId = "dev-1"): NextRequest {
  return new NextRequest("http://localhost/api/share", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-id": deviceId,
    },
    body: JSON.stringify(body),
  });
}

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

const MOCK_SNAPSHOT = {
  message_text: "Gợi ý của AI",
  recommendations: [{ place_id: "p1", why_fits: "Good", snapshot: { name: "Quán 1" } }],
  created_at: "2026-04-28T10:00:00Z",
};

function mockAllHappy() {
  vi.mocked(resolveIdentity).mockResolvedValue({
    ownerKey: "owner-1",
    userId: null,
    deviceId: "dev-1",
  });
  vi.mocked(ratelimitShare.limit).mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 3600_000,
    pending: Promise.resolve(),
  });
  vi.mocked(supabaseAdmin).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: VALID_UUID, owner_key: "owner-1" },
              error: null,
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  } as never);
  vi.mocked(buildSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
  vi.mocked(createShortIdWithRetry).mockResolvedValue("abcd1234");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns 201 with shortId and url", async () => {
    mockAllHappy();

    const req = makeReq({ message_id: VALID_UUID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.shortId).toBe("abcd1234");
    expect(json.url).toBe("https://foodapp.test/s/abcd1234");
  });

  it("rate limit exceeded: returns 429 with rate_limited error", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      ownerKey: "owner-1",
      userId: null,
      deviceId: "dev-1",
    });
    vi.mocked(ratelimitShare.limit).mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 1800_000,
      pending: Promise.resolve(),
    });

    const req = makeReq({ message_id: VALID_UUID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.error).toBe("rate_limited");
  });

  it("ownership mismatch: returns 404 when message not found for owner", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      ownerKey: "other-owner",
      userId: null,
      deviceId: "dev-2",
    });
    vi.mocked(ratelimitShare.limit).mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 3600_000,
      pending: Promise.resolve(),
    });
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as never);

    const req = makeReq({ message_id: VALID_UUID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("invalid body: returns 400 when message_id is not a UUID", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      ownerKey: "owner-1",
      userId: null,
      deviceId: "dev-1",
    });
    vi.mocked(ratelimitShare.limit).mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 3600_000,
      pending: Promise.resolve(),
    });

    const req = makeReq({ message_id: "not-a-uuid" });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_request");
  });

  it("DB insert error: returns 500 with db_error", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      ownerKey: "owner-1",
      userId: null,
      deviceId: "dev-1",
    });
    vi.mocked(ratelimitShare.limit).mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 3600_000,
      pending: Promise.resolve(),
    });
    vi.mocked(buildSnapshot).mockResolvedValue(MOCK_SNAPSHOT);
    vi.mocked(createShortIdWithRetry).mockResolvedValue("abcd1234");
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "messages") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: VALID_UUID, owner_key: "owner-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        // shared_recommendations INSERT fails
        return {
          insert: vi.fn().mockResolvedValue({ error: { message: "disk full" } }),
        };
      }),
    } as never);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeReq({ message_id: VALID_UUID });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe("db_error");
    consoleSpy.mockRestore();
  });
});
