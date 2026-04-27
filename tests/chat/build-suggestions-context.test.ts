import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getHourBucket,
  getWeatherKey,
  buildCacheKey,
} from "@/lib/chat/build-suggestions-context";
import type { Weather } from "@/lib/tools/types";

/** Build Date với VN local hour cụ thể (UTC+7, no DST). */
function dateAt(vnHour: number): Date {
  const utcHour = (vnHour - 7 + 24) % 24;
  return new Date(Date.UTC(2026, 3, 27, utcHour, 0, 0));
}

function weatherAt(opts: Partial<Weather>): Weather {
  return {
    tempC: 28,
    condition: "clear",
    rainProbPct: 0,
    isDay: true,
    ts: Date.now(),
    ...opts,
  };
}

describe("getHourBucket", () => {
  it.each([
    [5, "morning"],
    [7, "morning"],
    [9, "morning"],
    [10, "lunch"],
    [12, "lunch"],
    [13, "lunch"],
    [14, "afternoon"],
    [16, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [20, "evening"],
    [22, "evening"],
    [23, "latenight"],
    [2, "latenight"],
    [4, "latenight"],
  ])("VN hour %i → %s", (h, expected) => {
    expect(getHourBucket(dateAt(h))).toBe(expected);
  });
});

describe("getWeatherKey — guard order rainy_cool → hot_day → cool_evening → mild", () => {
  it("rainProbPct >50 → rainy_cool (override hot/cool)", () => {
    expect(getWeatherKey(weatherAt({ rainProbPct: 60, tempC: 35, isDay: true }))).toBe(
      "rainy_cool",
    );
  });

  it("hot_day: tempC >32 + isDay (no rain)", () => {
    expect(getWeatherKey(weatherAt({ tempC: 34, isDay: true, rainProbPct: 10 }))).toBe(
      "hot_day",
    );
  });

  it("cool_evening: tempC <26 + !isDay", () => {
    expect(getWeatherKey(weatherAt({ tempC: 24, isDay: false, rainProbPct: 10 }))).toBe(
      "cool_evening",
    );
  });

  it("mild: default (28C day, no rain)", () => {
    expect(getWeatherKey(weatherAt({ tempC: 28, isDay: true, rainProbPct: 10 }))).toBe(
      "mild",
    );
  });

  it("hot but night → mild (hot_day requires isDay)", () => {
    expect(getWeatherKey(weatherAt({ tempC: 34, isDay: false, rainProbPct: 10 }))).toBe(
      "mild",
    );
  });

  it("cool but day → mild (cool_evening requires !isDay)", () => {
    expect(getWeatherKey(weatherAt({ tempC: 24, isDay: true, rainProbPct: 10 }))).toBe(
      "mild",
    );
  });
});

describe("buildCacheKey", () => {
  it("formats with rounded coords + bucket + weather", () => {
    expect(buildCacheKey(10.7769, 106.7009, "lunch", "mild")).toBe(
      "chips:10.78:106.7:lunch:mild",
    );
  });

  it("rounds lat/lng to 2 decimals (~1km zone)", () => {
    expect(buildCacheKey(10.776912, 106.700856, "lunch", "mild")).toBe(
      "chips:10.78:106.7:lunch:mild",
    );
  });

  it("differs across hour buckets (same coords)", () => {
    const a = buildCacheKey(10.77, 106.7, "morning", "mild");
    const b = buildCacheKey(10.77, 106.7, "evening", "mild");
    expect(a).not.toBe(b);
  });

  it("differs across weather modes", () => {
    const a = buildCacheKey(10.77, 106.7, "lunch", "mild");
    const b = buildCacheKey(10.77, 106.7, "lunch", "rainy_cool");
    expect(a).not.toBe(b);
  });
});
