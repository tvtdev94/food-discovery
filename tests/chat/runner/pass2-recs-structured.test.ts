import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/chat/runner/runner-openai-client", () => ({
  callResponsesCreate: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { runPass2Recs } from "@/lib/chat/runner/pass2-recs-structured";
import { callResponsesCreate } from "@/lib/chat/runner/runner-openai-client";
import type { Place } from "@/lib/tools/types";
import type { MessageOutputItem, ResponsesResponse } from "@/lib/chat/runner/runner-types";

/**
 * Create a canned Responses API response for structured output.
 */
function createMockResponse(recommendations: Array<{ place_id: string; why_fits: string }>): ResponsesResponse {
  return {
    id: "resp_x",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ recommendations }),
          },
        ],
      },
    ] as MessageOutputItem[],
    usage: { input_tokens: 200, output_tokens: 50 },
  };
}

/**
 * Create mock Place objects for testing.
 */
function createMockPlace(
  placeId: string,
  name: string,
  rating: number = 4.5,
  reviews: number = 100,
): Place {
  return {
    placeId,
    name,
    address: `Address of ${name}`,
    lat: 10.77,
    lng: 106.7,
    rating,
    reviews,
    priceLevel: 2,
    types: ["restaurant", "food"],
    openNow: true,
    mapsUri: "https://maps.google.com",
  };
}

describe("runPass2Recs", () => {
  it("hydrates recommendations with snapshots from filteredPlaces", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");
    const place2 = createMockPlace("ChIJ2", "Bánh Mì King");
    const filteredPlaces = [place1, place2];

    const mockResponse = createMockResponse([
      { place_id: "ChIJ1", why_fits: "Vibe yên tĩnh" },
      { place_id: "ChIJ2", why_fits: "Bánh mì ngon" },
    ]);

    vi.mocked(callResponsesCreate).mockResolvedValueOnce(mockResponse);

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2Recs({
      inputMessages: [{ role: "system", content: "You are helpful" }],
      pass1FinalText: "Found 2 places",
      filteredPlaces,
      onEvent,
    });

    // Verify single recs_delta event emitted
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("recs_delta");

    const payload = events[0].data as { recommendations: unknown[] };
    expect(Array.isArray(payload.recommendations)).toBe(true);
    expect(payload.recommendations).toHaveLength(2);

    // Verify hydrated snapshot in payload
    const rec1 = (payload.recommendations[0] as { snapshot?: Place }) as any;
    expect(rec1.snapshot).toBeDefined();
    expect(rec1.snapshot.placeId).toBe("ChIJ1");
    expect(rec1.snapshot.name).toBe("Phở Gia");

    // Verify return value (recommendations without snapshot field)
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].place_id).toBe("ChIJ1");
    expect(result.recommendations[0].why_fits).toBe("Vibe yên tĩnh");
    expect(result.recommendations[1].place_id).toBe("ChIJ2");
    expect(result.recommendations[1].why_fits).toBe("Bánh mì ngon");

    expect(result.usage.input_tokens).toBe(200);
    expect(result.usage.output_tokens).toBe(50);
  });

  it("drops hallucinated place_ids not in filteredPlaces", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");
    const filteredPlaces = [place1];

    // Mock returns a recommendation with place_id that doesn't exist in filtered
    const mockResponse = createMockResponse([
      { place_id: "ChIJ1", why_fits: "Real place" },
      { place_id: "ChIJHallucinated", why_fits: "Fake place" },
    ]);

    vi.mocked(callResponsesCreate).mockResolvedValueOnce(mockResponse);

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2Recs({
      inputMessages: [],
      pass1FinalText: "Found 1 place",
      filteredPlaces,
      onEvent,
    });

    // Hallucinated place should be filtered out
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].place_id).toBe("ChIJ1");

    // Payload should also only have 1 valid rec
    const payload = events[0].data as { recommendations: unknown[] };
    expect(payload.recommendations).toHaveLength(1);
  });

  it("handles empty filteredPlaces with empty recommendations response", async () => {
    const mockResponse = createMockResponse([]);

    vi.mocked(callResponsesCreate).mockResolvedValueOnce(mockResponse);

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2Recs({
      inputMessages: [],
      pass1FinalText: "No places found",
      filteredPlaces: [],
      onEvent,
    });

    expect(result.recommendations).toHaveLength(0);
    expect(events[0].event).toBe("recs_delta");
    const payload = events[0].data as { recommendations: unknown[] };
    expect(payload.recommendations).toHaveLength(0);
  });

  it("aggregates usage tokens correctly", async () => {
    const place1 = createMockPlace("ChIJ1", "Restaurant 1");
    const mockResponse = createMockResponse([{ place_id: "ChIJ1", why_fits: "Good food" }]);
    // Override usage for this test
    (mockResponse as any).usage = { input_tokens: 500, output_tokens: 150 };

    vi.mocked(callResponsesCreate).mockResolvedValueOnce(mockResponse);

    const onEvent = () => {};
    const result = await runPass2Recs({
      inputMessages: [],
      pass1FinalText: "",
      filteredPlaces: [place1],
      onEvent,
    });

    expect(result.usage.input_tokens).toBe(500);
    expect(result.usage.output_tokens).toBe(150);
  });
});
