import { describe, it, expect } from "vitest";
import { ruleFilter } from "@/lib/tools/rule-filter";
import type { Place } from "@/lib/tools/types";

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    placeId: "id-1",
    name: "Test Place",
    address: "123 Main St",
    lat: 0,
    lng: 0,
    rating: 4.5,
    reviews: 100,
    priceLevel: 2,
    types: ["restaurant"],
    openNow: true,
    mapsUri: "https://maps.google.com/?cid=1",
    ...overrides,
  };
}

describe("ruleFilter", () => {
  it("passes all places that meet defaults (minRating=3.5, minReviews=3)", () => {
    const places = [
      makePlace({ placeId: "a", rating: 4.5, reviews: 50 }),
      makePlace({ placeId: "b", rating: 3.6, reviews: 5 }),
      makePlace({ placeId: "c", rating: 3.6, reviews: 3 }),
    ];
    const result = ruleFilter(places);
    expect(result).toHaveLength(3);
    // sorted descending by rating
    expect(result[0].placeId).toBe("a");
  });

  it("filters out places below minRating", () => {
    const places = [
      makePlace({ placeId: "good", rating: 4.0, reviews: 20 }),
      makePlace({ placeId: "bad", rating: 3.0, reviews: 50 }),
    ];
    const result = ruleFilter(places, { minRating: 3.5 });
    expect(result).toHaveLength(1);
    expect(result[0].placeId).toBe("good");
  });

  it("filters out places below minReviews", () => {
    const places = [
      makePlace({ placeId: "enough", rating: 4.0, reviews: 15 }),
      makePlace({ placeId: "few", rating: 4.8, reviews: 3 }),
    ];
    const result = ruleFilter(places, { minReviews: 10 });
    expect(result).toHaveLength(1);
    expect(result[0].placeId).toBe("enough");
  });

  it("when openNow=true: drops only explicitly-closed; keeps open + unknown", () => {
    const places = [
      makePlace({ placeId: "open", openNow: true }),
      makePlace({ placeId: "closed", openNow: false }),
      makePlace({ placeId: "unknown", openNow: null }),
    ];
    const result = ruleFilter(places, { openNow: true });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.placeId).sort()).toEqual(["open", "unknown"]);
  });

  it("returns empty array for empty input", () => {
    expect(ruleFilter([])).toEqual([]);
  });
});
