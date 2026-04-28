import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock supabase admin — short-id module uses it for collision check
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(),
}));

import { generateShortId, createShortIdWithRetry } from "@/lib/share/short-id";

// ---------------------------------------------------------------------------
// generateShortId
// ---------------------------------------------------------------------------
describe("generateShortId", () => {
  it("returns exactly 8 characters from base62 alphabet", () => {
    const id = generateShortId();
    expect(id).toHaveLength(8);
    expect(/^[0-9a-zA-Z]{8}$/.test(id)).toBe(true);
  });

  it("distribution sanity: 100 IDs have ≥80 unique values (collision resistance)", () => {
    const ids = Array.from({ length: 100 }, () => generateShortId());
    const unique = new Set(ids);
    // With 62^8 ≈ 218T space, 100 samples should almost certainly all be unique.
    // Using 80 as a very conservative floor to avoid flakiness.
    expect(unique.size).toBeGreaterThanOrEqual(80);
  });
});

// ---------------------------------------------------------------------------
// createShortIdWithRetry
// ---------------------------------------------------------------------------
describe("createShortIdWithRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeMockDb(existsOnAttempts: number[] = []) {
    let callCount = 0;
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockImplementation(() => {
              const attempt = callCount++;
              if (existsOnAttempts.includes(attempt)) {
                // Simulate collision: row exists
                return Promise.resolve({ data: { short_id: "existing0" }, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            }),
          }),
        }),
      }),
    };
  }

  it("returns a valid base62 short ID on first attempt (no collision)", async () => {
    const mockDb = makeMockDb(); // no collisions
    const id = await createShortIdWithRetry(mockDb as never);
    expect(id).toHaveLength(8);
    expect(/^[0-9a-zA-Z]{8}$/.test(id)).toBe(true);
  });

  it("retries on collision and returns a valid ID on second attempt", async () => {
    // First attempt collides, second is free
    const mockDb = makeMockDb([0]);
    const id = await createShortIdWithRetry(mockDb as never, 5);
    expect(id).toHaveLength(8);
    // maybeSingle should have been called twice (1 collision + 1 success)
    const maybeSingleMock = mockDb.from().select().eq().maybeSingle;
    expect(maybeSingleMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxRetries when all attempts collide", async () => {
    // All 3 attempts produce collisions
    const mockDb = makeMockDb([0, 1, 2]);
    await expect(createShortIdWithRetry(mockDb as never, 3)).rejects.toThrow(
      /Failed to generate unique short_id after 3 attempts/,
    );
  });

  it("propagates DB error immediately without retrying", async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "connection refused" },
            }),
          }),
        }),
      }),
    };
    await expect(createShortIdWithRetry(mockDb as never, 5)).rejects.toThrow(
      /DB error: connection refused/,
    );
    // Should only call once — no retry on DB errors
    const maybeSingleMock = mockDb.from().select().eq().maybeSingle;
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });
});
