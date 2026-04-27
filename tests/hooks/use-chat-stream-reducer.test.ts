import { describe, it, expect } from "vitest";
import { chatReducer } from "@/hooks/use-chat-stream";
import type { ChatMessage } from "@/hooks/use-chat-stream";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  errorCode: "rate_limited" | "budget" | "network" | "internal" | null;
  conversationId: string | null;
}

describe("chatReducer", () => {
  const initialState: ChatState = {
    messages: [],
    isStreaming: false,
    error: null,
    errorCode: null,
    conversationId: null,
  };

  it("APPEND_TEXT accumulates chunks into message text", () => {
    // Start with an assistant message
    let state: ChatState = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "",
          status: "streaming",
          phase: "thinking",
        },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    // Dispatch 3 APPEND_TEXT actions
    state = chatReducer(state, { type: "APPEND_TEXT", id: "msg-1", chunk: "Quán " });
    expect(state.messages[0].text).toBe("Quán ");

    state = chatReducer(state, { type: "APPEND_TEXT", id: "msg-1", chunk: "ngon " });
    expect(state.messages[0].text).toBe("Quán ngon ");

    state = chatReducer(state, { type: "APPEND_TEXT", id: "msg-1", chunk: "lắm 🍜" });
    expect(state.messages[0].text).toBe("Quán ngon lắm 🍜");
  });

  it("SET_PHASE updates target message only", () => {
    let state: ChatState = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "Text 1",
          phase: "thinking",
          status: "streaming",
        },
        {
          id: "msg-2",
          role: "assistant",
          text: "Text 2",
          phase: "thinking",
          status: "streaming",
        },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    // Update phase for msg-1 only
    state = chatReducer(state, { type: "SET_PHASE", id: "msg-1", phase: "searching" });

    expect(state.messages[0].phase).toBe("searching");
    expect(state.messages[1].phase).toBe("thinking"); // Unchanged
  });

  it("UPDATE_ASSISTANT with recommendations does NOT reset text", () => {
    let state: ChatState = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "Existing text",
          phase: "composing",
          recommendations: [],
          status: "streaming",
        },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    // Update with new recommendations
    state = chatReducer(state, {
      type: "UPDATE_ASSISTANT",
      id: "msg-1",
      patch: {
        recommendations: [
          { place_id: "ChIJ1", why_fits: "Good food", snapshot: undefined },
        ],
      },
    });

    // Text should remain unchanged
    expect(state.messages[0].text).toBe("Existing text");
    expect(state.messages[0].recommendations).toHaveLength(1);
    expect(state.messages[0].recommendations![0].place_id).toBe("ChIJ1");
  });

  it("PUSH_ASSISTANT_PENDING creates new message with default phase and status", () => {
    let state: ChatState = initialState;

    const newMessage: ChatMessage = {
      id: "msg-new",
      role: "assistant",
      text: "",
      phase: "thinking",
      status: "streaming",
    };

    state = chatReducer(state, { type: "PUSH_ASSISTANT_PENDING", message: newMessage });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].id).toBe("msg-new");
    expect(state.messages[0].phase).toBe("thinking");
    expect(state.messages[0].status).toBe("streaming");
    expect(state.isStreaming).toBe(true);
    expect(state.error).toBeNull();
  });

  it("UPDATE_ASSISTANT preserves unmodified fields during patch", () => {
    let state: ChatState = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "Original text",
          phase: "composing",
          status: "streaming",
          recommendations: [
            { place_id: "ChIJ1", why_fits: "Good", snapshot: undefined },
          ],
        },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    // Patch only status
    state = chatReducer(state, {
      type: "UPDATE_ASSISTANT",
      id: "msg-1",
      patch: { status: "done" },
    });

    // Verify unmodified fields remain
    expect(state.messages[0].text).toBe("Original text");
    expect(state.messages[0].phase).toBe("composing");
    expect(state.messages[0].recommendations).toHaveLength(1);
    expect(state.messages[0].status).toBe("done");
  });

  it("APPEND_TEXT only appends to target message id", () => {
    let state: ChatState = {
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "Message 1",
          status: "streaming",
        },
        {
          id: "msg-2",
          role: "assistant",
          text: "Message 2",
          status: "streaming",
        },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    // Append to msg-2 only
    state = chatReducer(state, { type: "APPEND_TEXT", id: "msg-2", chunk: " appended" });

    expect(state.messages[0].text).toBe("Message 1"); // Unchanged
    expect(state.messages[1].text).toBe("Message 2 appended");
  });

  it("PUSH_USER_MSG adds message to list and does not affect streaming state", () => {
    let state: ChatState = {
      ...initialState,
      isStreaming: false,
    };

    const userMsg: ChatMessage = {
      id: "user-1",
      role: "user",
      text: "Hello, what restaurants?",
    };

    state = chatReducer(state, { type: "PUSH_USER_MSG", message: userMsg });

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe("user");
    expect(state.messages[0].text).toBe("Hello, what restaurants?");
    expect(state.isStreaming).toBe(false); // Unchanged
  });

  it("SET_ERROR sets error, errorCode, and isStreaming=false", () => {
    let state: ChatState = {
      ...initialState,
      isStreaming: true,
    };

    state = chatReducer(state, {
      type: "SET_ERROR",
      error: "Rate limit exceeded",
      errorCode: "rate_limited",
    });

    expect(state.error).toBe("Rate limit exceeded");
    expect(state.errorCode).toBe("rate_limited");
    expect(state.isStreaming).toBe(false);
  });

  it("SET_PHASE with multiple messages only updates target", () => {
    let state: ChatState = {
      messages: [
        { id: "a", role: "user", text: "hello" },
        { id: "b", role: "assistant", text: "hi", phase: "thinking", status: "streaming" },
        { id: "c", role: "assistant", text: "more", phase: "thinking", status: "streaming" },
      ],
      isStreaming: true,
      error: null,
      errorCode: null,
      conversationId: null,
    };

    state = chatReducer(state, { type: "SET_PHASE", id: "b", phase: "composing" });

    expect(state.messages[0].phase).toBeUndefined();
    expect(state.messages[1].phase).toBe("composing");
    expect(state.messages[2].phase).toBe("thinking");
  });

});
