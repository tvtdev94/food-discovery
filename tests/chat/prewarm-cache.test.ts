import { describe, it, expect, vi } from "vitest";

// Mock server-only module
vi.mock("server-only", () => ({}));

import { getDefaultPrewarmQueries } from "@/lib/chat/prewarm-cache";

/**
 * Construct a Date whose VN local hour equals the requested value.
 * VN = UTC+7 (no DST), so UTC hour = (vnHour - 7 + 24) % 24.
 * Using UTC-explicit Date.UTC keeps the test deterministic regardless of the
 * machine TZ (Bangkok local matches VN, but CI runners may be UTC).
 */
function dateAt(vnHour: number): Date {
  const utcHour = (vnHour - 7 + 24) % 24;
  return new Date(Date.UTC(2026, 3, 26, utcHour, 0, 0));
}

describe("getDefaultPrewarmQueries", () => {
  it("breakfast bucket (7h) returns phở and cà phê sáng", () => {
    const q = getDefaultPrewarmQueries(dateAt(7));
    expect(q).toContain("quán phở");
    expect(q).toContain("cà phê sáng");
  });

  it("lunch bucket (12h) returns cơm trưa", () => {
    expect(getDefaultPrewarmQueries(dateAt(12))).toContain("cơm trưa");
  });

  it("afternoon bucket (16h) returns cà phê and trà sữa", () => {
    const q = getDefaultPrewarmQueries(dateAt(16));
    expect(q).toContain("cà phê");
    expect(q).toContain("trà sữa");
  });

  it("dinner bucket (19h) returns lẩu and nướng", () => {
    const q = getDefaultPrewarmQueries(dateAt(19));
    expect(q).toContain("lẩu");
    expect(q).toContain("nướng");
  });

  it("late-night bucket (2h) returns cháo and mì cay", () => {
    const q = getDefaultPrewarmQueries(dateAt(2));
    expect(q).toContain("cháo");
    expect(q).toContain("mì cay");
  });

  it("always includes evergreen quán ăn ngon", () => {
    [3, 7, 12, 16, 20, 23].forEach((h) => {
      expect(getDefaultPrewarmQueries(dateAt(h))).toContain("quán ăn ngon");
    });
  });

  it("returns 4-5 unique queries", () => {
    const q = getDefaultPrewarmQueries(dateAt(12));
    expect(q.length).toBeGreaterThanOrEqual(4);
    expect(new Set(q).size).toBe(q.length);
  });

  it("boundary: 5h morning is breakfast bucket", () => {
    const q = getDefaultPrewarmQueries(dateAt(5));
    expect(q).toContain("quán phở");
  });

  it("boundary: 10h early is lunch bucket", () => {
    const q = getDefaultPrewarmQueries(dateAt(10));
    expect(q).toContain("cơm trưa");
  });

  it("boundary: 14h afternoon is afternoon bucket", () => {
    const q = getDefaultPrewarmQueries(dateAt(14));
    expect(q).toContain("cà phê");
  });

  it("boundary: 18h evening is dinner bucket", () => {
    const q = getDefaultPrewarmQueries(dateAt(18));
    expect(q).toContain("quán ăn tối");
  });

  it("boundary: 23h late is late-night bucket", () => {
    const q = getDefaultPrewarmQueries(dateAt(23));
    expect(q).toContain("quán ăn khuya");
  });
});
