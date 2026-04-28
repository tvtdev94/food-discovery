import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: {
    warn: vi.fn(),
  },
}));

import { loadHistory } from "@/lib/chat/load-history";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Create mock Supabase client with chainable methods for loadHistory
 */
function createMockSupabaseClient() {
  const mockMessageSelect = vi.fn();
  const mockMessageEq = vi.fn();
  const mockMessageOrder = vi.fn();
  const mockMessageLimit = vi.fn();
  const mockConvEq = vi.fn();
  const mockConvEq2 = vi.fn();
  const mockConvMaybeSingle = vi.fn();
  const mockPrefEq = vi.fn();
  const mockPrefMaybeSingle = vi.fn();

  // Messages chain: select → eq → order → limit
  mockMessageSelect.mockReturnValue({ eq: mockMessageEq });
  mockMessageEq.mockReturnValue({ order: mockMessageOrder });
  mockMessageOrder.mockReturnValue({ limit: mockMessageLimit });

  // Conversations chain: select → eq → eq → maybeSingle
  mockConvEq.mockReturnValue({ eq: mockConvEq2 });
  mockConvEq2.mockReturnValue({ maybeSingle: mockConvMaybeSingle });

  // Preferences chain: select → eq → maybeSingle
  mockPrefEq.mockReturnValue({ maybeSingle: mockPrefMaybeSingle });

  const messagesChain = {
    select: mockMessageSelect,
  };

  const conversationsChain = {
    select: vi.fn().mockReturnValue({ eq: mockConvEq }),
  };

  const preferencesChain = {
    select: vi.fn().mockReturnValue({ eq: mockPrefEq }),
  };

  const mockDb = {
    from: vi.fn((table: string) => {
      if (table === "messages") return messagesChain;
      if (table === "conversations") return conversationsChain;
      if (table === "preferences") return preferencesChain;
      return {};
    }),
  };

  return {
    db: mockDb as any,
    mockMessageLimit,
    mockConvMaybeSingle,
    mockPrefMaybeSingle,
  };
}

describe("loadHistory — conversation message + preference loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: loads messages + preferences for owned conversation", async () => {
    const mockDb = createMockSupabaseClient();
    vi.mocked(supabaseAdmin).mockReturnValue(mockDb.db);

    // Database returns in reverse chronological order (as per loadHistory DESC order)
    const messageData = [
      {
        role: "assistant",
        content: "Here are 5 options",
        tool_calls: [],
      },
      {
        role: "user",
        content: "What should I eat?",
        tool_calls: null,
      },
    ];

    // Mock messages query
    mockDb.mockMessageLimit.mockResolvedValueOnce({
      data: messageData,
      error: null,
    });

    // Mock conversation verification
    mockDb.mockConvMaybeSingle.mockResolvedValueOnce({
      data: { id: "conv-123" },
      error: null,
    });

    // Mock preferences query
    mockDb.mockPrefMaybeSingle.mockResolvedValueOnce({
      data: {
        context: { favoriteFood: "phở", budget: 50000 },
      },
      error: null,
    });

    const result = await loadHistory("conv-123", "owner-abc");

    // Verify history (reversed to chronological)
    expect(result.history).toHaveLength(2);
    expect(result.history[0].role).toBe("user");
    expect(result.history[0].content).toBe("What should I eat?");
    expect(result.history[1].role).toBe("assistant");

    // Verify preferences loaded
    expect(result.preferences).toEqual({
      favoriteFood: "phở",
      budget: 50000,
    });
  });

  it("owner_key mismatch filter → returns empty messages (defense-in-depth alongside RLS)", async () => {
    const mockDb = createMockSupabaseClient();
    vi.mocked(supabaseAdmin).mockReturnValue(mockDb.db);

    const messageData = [
      { role: "user", content: "Message 1", tool_calls: null },
    ];

    // Messages query succeeds
    mockDb.mockMessageLimit.mockResolvedValueOnce({
      data: messageData,
      error: null,
    });

    // Conversation lookup fails (owner_key mismatch)
    mockDb.mockConvMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // Preferences lookup succeeds but for different user
    mockDb.mockPrefMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await loadHistory("conv-wrong-owner", "wrong-owner-key");

    // History should be empty due to owner mismatch
    expect(result.history).toHaveLength(0);
  });

  it("empty conversation: no messages → returns empty array", async () => {
    const mockDb = createMockSupabaseClient();
    vi.mocked(supabaseAdmin).mockReturnValue(mockDb.db);

    // Messages query returns empty
    mockDb.mockMessageLimit.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    // Conversation exists and owner matches
    mockDb.mockConvMaybeSingle.mockResolvedValueOnce({
      data: { id: "conv-empty" },
      error: null,
    });

    // Preferences loading
    mockDb.mockPrefMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await loadHistory("conv-empty", "owner-abc");

    // Empty history but no error
    expect(result.history).toHaveLength(0);
    expect(result.preferences).toEqual({});
  });

  it("pagination: limit=10, returns ≤10 messages in chronological order", async () => {
    const mockDb = createMockSupabaseClient();
    vi.mocked(supabaseAdmin).mockReturnValue(mockDb.db);

    // Database returns in reverse chronological order (descending created_at)
    // Message 9 (newest) to Message 0 (oldest) from DB
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: (9 - i) % 2 === 0 ? "user" : "assistant",
      content: `Message ${9 - i}`,
      tool_calls: null,
    }));

    mockDb.mockMessageLimit.mockResolvedValueOnce({
      data: messages,
      error: null,
    });

    // Conversation exists
    mockDb.mockConvMaybeSingle.mockResolvedValueOnce({
      data: { id: "conv-many" },
      error: null,
    });

    // Preferences
    mockDb.mockPrefMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await loadHistory("conv-many", "owner-abc");

    // Verify count
    expect(result.history).toHaveLength(10);

    // Verify messages are in chronological order (oldest first after reverse)
    expect(result.history[0].content).toBe("Message 0");
    expect(result.history[9].content).toBe("Message 9");
  });

  it("null conversationId: skips message loading, loads preferences only", async () => {
    const mockDb = createMockSupabaseClient();
    vi.mocked(supabaseAdmin).mockReturnValue(mockDb.db);

    // Preferences only
    mockDb.mockPrefMaybeSingle.mockResolvedValueOnce({
      data: {
        context: { language: "vi" },
      },
      error: null,
    });

    const result = await loadHistory(null, "owner-abc");

    // Empty history
    expect(result.history).toHaveLength(0);

    // Preferences still loaded
    expect(result.preferences).toEqual({ language: "vi" });
  });
});
