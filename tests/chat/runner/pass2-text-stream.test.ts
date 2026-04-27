import { describe, it, expect, vi } from "vitest";

// Mock server-only module
vi.mock("server-only", () => ({}));

// Mock the OpenAI client
vi.mock("@/lib/chat/runner/runner-openai-client", () => ({
  callResponsesStream: vi.fn(),
}));

// Mock logger (optional but clean)
vi.mock("@/lib/logger", () => ({
  log: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { runPass2TextStream } from "@/lib/chat/runner/pass2-text-stream";
import { callResponsesStream } from "@/lib/chat/runner/runner-openai-client";
import type { Place } from "@/lib/tools/types";

/**
 * Create a fake async iterable that yields stream events.
 */
function fakeStream(deltas: string[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const d of deltas) {
        yield { type: "response.output_text.delta", delta: d };
      }
      yield {
        type: "response.completed",
        response: { usage: { input_tokens: 100, output_tokens: 20 } },
      };
    },
  };
}

describe("runPass2TextStream", () => {
  it("accumulates message_delta events and returns fullText + usage", async () => {
    const deltas = ["Quán ", "ngon ", "lắm 🍜"];
    vi.mocked(callResponsesStream).mockResolvedValueOnce(fakeStream(deltas));

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const filteredPlaces: Place[] = [
      {
        placeId: "place-1",
        name: "Phở Gia",
        address: "HCM",
        lat: 10.77,
        lng: 106.7,
        rating: 4.5,
        reviews: 100,
        priceLevel: 2,
        types: ["restaurant"],
        openNow: true,
        mapsUri: "https://maps.google.com",
      },
    ];

    const result = await runPass2TextStream({
      inputMessages: [{ role: "system", content: "You are helpful" }],
      pass1FinalText: "Found 1 place",
      filteredPlaces,
      onEvent,
    });

    // Verify onEvent called 3 times with text chunks
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ event: "message_delta", data: "Quán " });
    expect(events[1]).toEqual({ event: "message_delta", data: "ngon " });
    expect(events[2]).toEqual({ event: "message_delta", data: "lắm 🍜" });

    // Verify return value
    expect(result.fullText).toBe("Quán ngon lắm 🍜");
    expect(result.usage.input_tokens).toBe(100);
    expect(result.usage.output_tokens).toBe(20);
  });

  it("handles stream failure mid-iteration by returning fallback text and zero usage", async () => {
    const deltas = ["Quán ", "ngon"];
    const brokenStream = {
      async *[Symbol.asyncIterator]() {
        for (const d of deltas) {
          yield { type: "response.output_text.delta", delta: d };
        }
        throw new Error("Stream interrupted");
      },
    };

    vi.mocked(callResponsesStream).mockResolvedValueOnce(brokenStream);

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2TextStream({
      inputMessages: [{ role: "system", content: "You are helpful" }],
      pass1FinalText: "Found 1 place",
      filteredPlaces: [],
      onEvent,
    });

    // Should have 2 delta events + fallback event
    // Events: "Quán ", "ngon", then fallback (because stream threw)
    // Actually: the function catches error and emits fallback only if !fullText
    // But here fullText = "Quán ngon" which is > 0, so no extra fallback emitted
    // Let me re-check the code logic...
    // Code: if (!fullText) { ... emit fallback as single delta }
    // So if we have partial text, we DON'T emit fallback delta.
    expect(events).toHaveLength(2);
    expect(result.fullText).toBe("Quán ngon");
    expect(result.usage.input_tokens).toBe(0);
    expect(result.usage.output_tokens).toBe(0);
  });

  it("uses provided n=0 filteredPlaces and still streams normally", async () => {
    const deltas = ["Không có quán"];
    vi.mocked(callResponsesStream).mockResolvedValueOnce(fakeStream(deltas));

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2TextStream({
      inputMessages: [{ role: "system", content: "You are helpful" }],
      pass1FinalText: "No places found",
      filteredPlaces: [], // Empty
      onEvent,
    });

    expect(events).toHaveLength(1);
    expect(events[0].data).toBe("Không có quán");
    expect(result.fullText).toBe("Không có quán");
  });

  it("returns fallback text without extra delta emit when stream fails with zero partial text", async () => {
    const brokenStream = {
      async *[Symbol.asyncIterator]() {
        // Throw immediately — no partial text
        throw new Error("Stream failed immediately");
      },
    };

    vi.mocked(callResponsesStream).mockResolvedValueOnce(brokenStream);

    const events: Array<{ event: string; data: unknown }> = [];
    const onEvent = (event: string, data: unknown) => {
      events.push({ event, data });
    };

    const result = await runPass2TextStream({
      inputMessages: [],
      pass1FinalText: "",
      filteredPlaces: [],
      onEvent,
    });

    // Should emit fallback text as a single delta event
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("message_delta");
    expect(events[0].data).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");

    expect(result.fullText).toBe("Đây là vài quán mình thấy hợp ý bạn 🙂");
    expect(result.usage.input_tokens).toBe(0);
    expect(result.usage.output_tokens).toBe(0);
  });
});
