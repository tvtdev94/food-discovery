import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only module
vi.mock("server-only", () => ({}));

// Mock dependencies
vi.mock("@/lib/tools/places", () => ({
  findPlaces: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { findPlaces } from "@/lib/tools/places";
import { log } from "@/lib/logger";
import { heuristicQuery, speculativeFindPlaces } from "@/lib/chat/runner/speculative-fetch";

describe("heuristicQuery", () => {
  const now = new Date(2026, 3, 26, 12, 0, 0); // lunch time

  it("matches cuisine keyword phở from message", () => {
    expect(heuristicQuery("muốn ăn phở bò", now)).toBe("phở");
  });

  it("matches cuisine keyword cà phê from message", () => {
    expect(heuristicQuery("Cà phê gần đây", now)).toBe("cà phê");
  });

  it("matches cuisine keyword lẩu from message", () => {
    expect(heuristicQuery("đi ăn lẩu nha", now)).toBe("lẩu");
  });

  it("falls back to first time-bucket query when no cuisine keyword", () => {
    const v = heuristicQuery("đói quá", now);
    expect(v).toBe("cơm trưa"); // First query in lunch bucket
  });

  it("case-insensitive match", () => {
    expect(heuristicQuery("PHỞ ngon nhất", now)).toBe("phở");
  });

  it("empty message falls back to time-bucket", () => {
    const v = heuristicQuery("", now);
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("matches first cuisine keyword in order if multiple present", () => {
    // phở comes before lẩu in CUISINE_KEYWORDS
    expect(heuristicQuery("ăn phở hay lẩu", now)).toBe("phở");
  });
});

describe("speculativeFindPlaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls findPlaces with derived query and radiusM 2000", async () => {
    (findPlaces as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await speculativeFindPlaces({
      userMessage: "ăn phở",
      lat: 16.07,
      lng: 108.22,
      now: new Date(2026, 3, 26, 12),
    });

    expect(findPlaces).toHaveBeenCalledWith({
      query: "phở",
      lat: 16.07,
      lng: 108.22,
      radiusM: 2000,
    });
  });

  it("logs spec.warmed on success", async () => {
    (findPlaces as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await speculativeFindPlaces({
      userMessage: "ăn phở",
      lat: 16.07,
      lng: 108.22,
    });

    expect(log.info).toHaveBeenCalledWith("spec.warmed", { query: "phở" });
  });

  it("swallows findPlaces errors silently", async () => {
    (findPlaces as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("SearchApi timeout"),
    );

    await expect(
      speculativeFindPlaces({
        userMessage: "x",
        lat: 0,
        lng: 0,
      }),
    ).resolves.toBeUndefined();
  });

  it("logs spec.failed on error", async () => {
    const testError = new Error("SearchApi timeout");
    (findPlaces as ReturnType<typeof vi.fn>).mockRejectedValueOnce(testError);

    await speculativeFindPlaces({
      userMessage: "x",
      lat: 0,
      lng: 0,
    });

    expect(log.warn).toHaveBeenCalledWith("spec.failed", {
      err: expect.stringContaining("SearchApi timeout"),
    });
  });

  it("uses current date when now not provided", async () => {
    (findPlaces as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const beforeCall = new Date();
    await speculativeFindPlaces({
      userMessage: "ăn cơm",
      lat: 10.77,
      lng: 106.7,
    });
    const afterCall = new Date();

    // Verify findPlaces was called (time heuristic applied)
    expect(findPlaces).toHaveBeenCalled();
    const callArgs = (findPlaces as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.query).toBeDefined();
  });
});
