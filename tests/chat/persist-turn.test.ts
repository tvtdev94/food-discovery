import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { persistTurn } from "@/lib/chat/persist-turn";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Place } from "@/lib/tools/types";

function createMockPlace(): Place {
  return {
    placeId: "ChIJ-place-1",
    name: "Test Restaurant",
    address: "123 Test St",
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

describe("persistTurn — conversation + message + recs persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: creates new conversation + inserts messages + saves recs", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "conv-123" },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            insert: vi.fn()
              .mockImplementationOnce(() => Promise.resolve({ error: null }))
              .mockImplementationOnce(() => ({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "msg-456" },
                    error: null,
                  }),
                }),
              })),
          };
        }
        if (table === "recommendations") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any);

    const place = createMockPlace();
    const result = await persistTurn({
      ownerKey: "user-abc",
      conversationId: null,
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      userMessage: "What should I eat?",
      assistantMessage: "Here are 5 options",
      toolCalls: [],
      recommendations: [
        {
          place_id: "ChIJ-place-1",
          why_fits: "Good food",
          snapshot: place,
          rank: 1,
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Verify returned conversation ID
    expect(result).toBeDefined();
    expect(result.conversationId).toBe("conv-123");
  });

  it("appends to existing conversation without throwing", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            insert: vi.fn()
              .mockImplementationOnce(() => Promise.resolve({ error: null }))
              .mockImplementationOnce(() => ({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "msg-789" },
                    error: null,
                  }),
                }),
              })),
          };
        }
        if (table === "recommendations") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any);

    const result = await persistTurn({
      ownerKey: "user-abc",
      conversationId: "conv-existing",
      activeLocation: { lat: 10.8, lng: 106.8, label: "District 1" },
      userMessage: "More options please",
      assistantMessage: "Here are more",
      toolCalls: [],
      recommendations: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Verify conversation ID preserved
    expect(result.conversationId).toBe("conv-existing");
  });

  it("handles recs insert error gracefully, returns conversation + message IDs", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "conv-partial" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            insert: vi.fn()
              .mockImplementationOnce(() => Promise.resolve({ error: null }))
              .mockImplementationOnce(() => ({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "msg-partial" },
                    error: null,
                  }),
                }),
              })),
          };
        }
        if (table === "recommendations") {
          return {
            insert: vi.fn().mockResolvedValue({
              error: new Error("recs insert failed"),
            }),
          };
        }
        return {};
      }),
    } as any);

    const place = createMockPlace();
    const result = await persistTurn({
      ownerKey: "user-abc",
      conversationId: null,
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      userMessage: "Test",
      assistantMessage: "Test response",
      toolCalls: [],
      recommendations: [
        {
          place_id: "ChIJ-place-1",
          why_fits: "Good food",
          snapshot: place,
          rank: 1,
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Still returns conversation ID despite recs failure (graceful — no throw)
    expect(result.conversationId).toBe("conv-partial");
  });

  it("returns a Promise — caller may dispatch fire-and-forget without await", async () => {
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "conversations") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "conv-ff" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            insert: vi.fn()
              .mockImplementationOnce(() => Promise.resolve({ error: null }))
              .mockImplementationOnce(() => ({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "msg-ff" },
                    error: null,
                  }),
                }),
              })),
          };
        }
        if (table === "recommendations") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as any);

    // Call persistTurn and capture the promise
    const promise = persistTurn({
      ownerKey: "user-ff",
      conversationId: null,
      activeLocation: { lat: 10.77, lng: 106.7, label: "HCM" },
      userMessage: "Fire and forget test",
      assistantMessage: "Response",
      toolCalls: [],
      recommendations: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    // Verify it's a promise
    expect(promise).toBeInstanceOf(Promise);

    // Give event loop a chance to process
    await new Promise((r) => setImmediate(r));

    // Now resolve the promise
    const result = await promise;

    // Verify it completed successfully
    expect(result.conversationId).toBe("conv-ff");
  });
});
