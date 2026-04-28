import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/chat/runner/speculative-fetch", () => ({
  speculativeFindPlaces: vi.fn().mockResolvedValue(undefined),
}));

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

describe("runChatTurn — runner end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: orchestrates Pass 1 + Pass 2 → returns aggregated result", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở Gia");
    const place2 = createMockPlace("ChIJ2", "Bánh Mì King");

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

    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Hai quán này rất ngon",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

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

    // Verify result shape
    expect(result.assistantMessage).toBe("Hai quán này rất ngon");
    expect(result.recommendations).toHaveLength(2);
    expect(result.filteredPlaces).toHaveLength(2);
    expect(result.usage.input_tokens).toBe(500);
    expect(result.usage.output_tokens).toBe(130);

    // Verify places_filtered event emitted
    const placesFilteredEvent = events.find((e) => e.event === "places_filtered");
    expect(placesFilteredEvent).toBeDefined();
  });

  it("error path: Pass 2 text fails → uses fallback, recs still work", async () => {
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

    // Pass 2 text fails
    vi.mocked(runPass2TextStream).mockRejectedValueOnce(new Error("Stream error"));

    // Pass 2 recs still succeeds
    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [{ place_id: "ChIJ1", why_fits: "Good food" }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const events: Array<{ event: string; data: unknown }> = [];
    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "phở",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent: (e, d) => events.push({ event: e, data: d }),
    });

    // Text fallback used, recs still present
    expect(result.assistantMessage).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");
    expect(result.recommendations).toHaveLength(1);

    // Verify fallback message_delta event emitted
    const fallbackEvent = events.find((e) => e.event === "message_delta");
    expect(fallbackEvent?.data).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");
  });

  it("abort path: AbortSignal passed to runners → should respect signal", async () => {
    const place1 = createMockPlace("ChIJ1", "Phở");

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
      pass1FinalText: "Found 1",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Quán này tốt",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [{ place_id: "ChIJ1", why_fits: "Best" }],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const abortController = new AbortController();

    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "phở",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent: () => {},
      abortSignal: abortController.signal,
    });

    // Verify signal was passed to runners
    expect(vi.mocked(runPass2TextStream).mock.calls[0][0].abortSignal).toBe(
      abortController.signal,
    );
    expect(vi.mocked(runPass2Recs).mock.calls[0][0].abortSignal).toBe(
      abortController.signal,
    );

    // Result should still be valid
    expect(result.assistantMessage).toBe("Quán này tốt");
  });

  it("empty places path: 0 filtered places → emits empty array, text works", async () => {
    vi.mocked(runPass1ToolLoop).mockResolvedValueOnce({
      allToolCalls: [],
      findPlacesOutputs: [
        {
          type: "function_call_output",
          call_id: "call_1",
          output: JSON.stringify({ places: [] }),
        },
      ],
      pass1Input: [],
      pass1FinalText: "No places found",
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    vi.mocked(runPass2TextStream).mockResolvedValueOnce({
      fullText: "Không tìm thấy quán nào",
      usage: { input_tokens: 200, output_tokens: 30 },
    });

    vi.mocked(runPass2Recs).mockResolvedValueOnce({
      recommendations: [],
      usage: { input_tokens: 200, output_tokens: 50 },
    });

    const events: Array<{ event: string; data: unknown }> = [];
    const result = await runChatTurn({
      systemPrompt: "You are helpful",
      history: [],
      userMessage: "ăn ở nguyên hàng",
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      onEvent: (e, d) => events.push({ event: e, data: d }),
    });

    // Empty places still handled gracefully
    expect(result.filteredPlaces).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
    expect(result.assistantMessage).toBe("Không tìm thấy quán nào");

    // places_filtered event with count=0
    const placesFilteredEvent = events.find((e) => e.event === "places_filtered");
    expect((placesFilteredEvent?.data as any).count).toBe(0);
  });
});
