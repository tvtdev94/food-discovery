import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { buildSnapshot } from "@/lib/share/snapshot";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-uuid-1",
    content: "Đây là 5 quán tôi gợi ý cho bạn:",
    owner_key: "owner-abc",
    created_at: "2026-04-28T10:00:00Z",
    ...overrides,
  };
}

function makeRec(rank: number, overrides: Record<string, unknown> = {}) {
  return {
    place_id: `place-${rank}`,
    why_fits: `Why fits #${rank}`,
    rank,
    snapshot: {
      name: `Quán ${rank}`,
      rating: 4.5,
      reviews: 100,
      priceLevel: 2,
      address: `${rank} Nguyễn Huệ, Q1`,
      mapsUri: `https://maps.google.com/?q=place${rank}`,
      lat: 10.77,   // these should NOT appear in output
      lng: 106.7,   // these should NOT appear in output
    },
    ...overrides,
  };
}

/** Build a mock Supabase client that returns the given data/errors. */
function makeMockDb({
  msgData = null as unknown,
  msgError = null as { message: string } | null,
  recsData = null as unknown[] | null,
  recsError = null as { message: string } | null,
} = {}) {
  const msgChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: msgData, error: msgError }),
  };
  const recsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: recsData, error: recsError }),
  };

  let callCount = 0;
  return {
    from: vi.fn().mockImplementation(() => {
      // First call → messages table; second call → recommendations table
      return callCount++ === 0 ? msgChain : recsChain;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("buildSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns formatted snapshot without lat/lng", async () => {
    const db = makeMockDb({
      msgData: makeMessage(),
      recsData: [makeRec(1), makeRec(2), makeRec(3)],
    });

    const result = await buildSnapshot(db as never, "msg-uuid-1");

    expect(result).not.toBeNull();
    expect(result!.message_text).toBe("Đây là 5 quán tôi gợi ý cho bạn:");
    expect(result!.recommendations).toHaveLength(3);

    const first = result!.recommendations[0];
    expect(first.place_id).toBe("place-1");
    expect(first.why_fits).toBe("Why fits #1");
    expect(first.snapshot.name).toBe("Quán 1");
    expect(first.snapshot.rating).toBe(4.5);
    expect(first.snapshot.address).toBe("1 Nguyễn Huệ, Q1");

    // lat/lng must NOT be present in snapshot (PII protection)
    expect(first.snapshot).not.toHaveProperty("lat");
    expect(first.snapshot).not.toHaveProperty("lng");
  });

  it("missing message: returns null when message row not found", async () => {
    const db = makeMockDb({ msgData: null });

    const result = await buildSnapshot(db as never, "non-existent-uuid");

    expect(result).toBeNull();
  });

  it("message without recommendations: returns null (nothing to share)", async () => {
    const db = makeMockDb({
      msgData: makeMessage(),
      recsData: [], // empty array
    });

    const result = await buildSnapshot(db as never, "msg-uuid-1");

    expect(result).toBeNull();
  });

  it("RLS deny / db error on recommendations: returns null and logs error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const db = makeMockDb({
      msgData: makeMessage(),
      recsError: { message: "new row violates row-level security policy" },
    });

    const result = await buildSnapshot(db as never, "msg-uuid-1");

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[buildSnapshot] recommendations fetch error:"),
      expect.any(String),
    );

    consoleSpy.mockRestore();
  });
});
