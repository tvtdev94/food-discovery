import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/chat/runner/pass1-tool-loop", () => ({
  runPass1ToolLoop: vi.fn(),
}));

vi.mock("@/lib/chat/runner/pass2-text-stream", () => ({
  runPass2TextStream: vi.fn(),
  TEXT_STREAM_FALLBACK: "Đây là vài quán mình thấy hợp ý bạn 🙂",
}));

vi.mock("@/lib/chat/runner/pass2-recs-structured", () => ({
  runPass2Recs: vi.fn(),
}));

// Speculative-fetch hits env (via findPlaces). Stub at module boundary so
// orchestrator tests don't need real API keys.
vi.mock("@/lib/chat/runner/speculative-fetch", () => ({
  speculativeFindPlaces: vi.fn().mockResolvedValue(undefined),
}));

// expand-search also hits env via findPlaces.
vi.mock("@/lib/chat/runner/expand-search", () => ({
  expandSearch: vi.fn().mockResolvedValue({ places: [], wasExpanded: false }),
}));

vi.mock("@/lib/tools/rule-filter", () => ({
  ruleFilter: vi.fn((places) => places),
  filterByDistance: vi.fn((places) => places),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { runChatTurn } from "@/lib/chat/runner/runner";
import { runPass1ToolLoop } from "@/lib/chat/runner/pass1-tool-loop";
import { runPass2TextStream } from "@/lib/chat/runner/pass2-text-stream";
import { runPass2Recs } from "@/lib/chat/runner/pass2-recs-structured";
import { ruleFilter } from "@/lib/tools/rule-filter";
import type { Place } from "@/lib/tools/types";

function createMockPlace(placeId: string, name: string): Place {
  return {
    placeId,
    name,
    address: `Address of ${name}`,
    lat: 10.77,
    lng: 106.7,
    rating: 4.5,
    reviews: 100,
    priceLevel: 2,
    types: ["restaurant"],
    openNow: true,
    mapsUri: "https://maps.google.com",
  };
}

describe("runChatTurn orchestrator", () => {
  it("orchestrates Pass 1 + Pass 2 (both succeed) → emits events in order", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");
    const place2 = createMockPlace("ChIJ2", "Bánh Mì King");

    // Mock Pass 1
    vi.mocked(runPass1ToolLoop).mockResolvedValueOnce({
      allToolCalls: [],
      findPlacesOutputs: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify({ places: [place1, place2] }),
        },
      ],
      pass1Input: [],
      pass1FinalText: "Found 2 places",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Mock ruleFilter
    vi.mocked(ruleFilter).mockReturnValueOnce([place1, place2]);

    // Mock Pass 2 — text
    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Hai quán này rất ngon",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    // Mock Pass 2 — recs
    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [
        { place_id: "ChIJ1", why_fits: "Vibe yên" },
        { place_id: "ChIJ2", why_fits: "Bánh mì ngon" },
      ],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "phở quận 1",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent,
    });

    // Verify places_filtered event emitted
    const placesFilteredEvent = events.find((e) => e.event === "places_filtered");
    expect(placesFilteredEvent).toBeDefined();
    expect((placesFilteredEvent?.data as any).count).toBe(2);

    // Verify result
    expect(result.assistantMessage).toBe("Hai quán này rất ngon");
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].why_fits).toBe("Vibe yên");

    // Verify aggregated usage
    expect(result.usage.input_tokens).toBe(100 + 200 + 200);
    expect(result.usage.output_tokens).toBe(50 + 30 + 50);
  });

  it("handles text branch failure → emits fallback message_delta", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");

    vi.mocked(runPass1ToolLoop).mockResolvedValueOnce({
      allToolCalls: [],
      findPlacesOutputs: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify({ places: [place1] }),
        },
      ],
      pass1Input: [],
      pass1FinalText: "Found 1 place",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    vi.mocked(ruleFilter).mockReturnValueOnce([place1]);

    // Pass 2 text fails
    vi.mocked(runPass2TextStream).mockRejectedValueOnce(new Error("Stream failed"));

    // Pass 2 recs succeeds
    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [{ place_id: "ChIJ1", why_fits: "Good food" }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "phở",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent,
    });

    // Text branch failure → should emit fallback message_delta
    const fallbackEvent = events.find((e) => e.event === "message_delta");
    expect(fallbackEvent).toBeDefined();
    expect(fallbackEvent?.data).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");

    // assistantMessage should be fallback
    expect(result.assistantMessage).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");

    // Recs should still be present
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].why_fits).toBe("Good food");
  });

  it("handles recs branch failure → emits empty recs_delta, text intact", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");

    vi.mocked(runPass1ToolLoop).mockResolvedValueOnce({
      allToolCalls: [],
      findPlacesOutputs: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify({ places: [place1] }),
        },
      ],
      pass1Input: [],
      pass1FinalText: "Found 1 place",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    vi.mocked(ruleFilter).mockReturnValueOnce([place1]);

    // Pass 2 text succeeds
    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Quán này rất tốt",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    // Pass 2 recs fails
    vi.mocked(runPass2Recs).mockRejectedValueOnce(new Error("Parse error"));

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "phở",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent,
    });

    // Recs branch failure → should emit empty recs_delta
    const recsFailEvent = events.find((e) => e.event === "recs_delta");
    expect(recsFailEvent).toBeDefined();
    const recsPayload = recsFailEvent?.data as any;
    expect(recsPayload.recommendations).toEqual([]);

    // Text should be intact
    expect(result.assistantMessage).toBe("Quán này rất tốt");

    // Recommendations should be empty
    expect(result.recommendations).toHaveLength(0);
  });

  it("caps filteredPlaces at 5 to reduce token load", async () => {
    // Create 10 places
    const places = Array.from({ length: 10 }, (_, i) =>
      createMockPlace(`ChIJ${i}`, `Place ${i}`),
    );

    vi.mocked(runPass1ToolLoop).mockResolvedValueOnce({
      allToolCalls: [],
      findPlacesOutputs: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify({ places }),
        },
      ],
      pass1Input: [],
      pass1FinalText: "Found 10 places",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Mock ruleFilter to return all 10
    vi.mocked(ruleFilter).mockReturnValueOnce(places);

    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Text here",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const onEvent = () => {};

    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "restaurant",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent,
    });

    // Verify runner caps filteredPlaces at 5 even though ruleFilter returned 10
    // (runner slice(0, 5) — Wave 1 cap to reduce Pass-2 token usage).
    expect(result.filteredPlaces).toHaveLength(5);
    expect(result.filteredPlaces[0].placeId).toBe("ChIJ0");
    expect(result.filteredPlaces[4].placeId).toBe("ChIJ4");
  });
});
