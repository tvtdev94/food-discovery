"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { parseSSE } from "@/lib/sse-parser";
import { getOrCreateDeviceId } from "@/hooks/use-active-location";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaceSnapshot {
  name: string;
  address?: string;
  cuisine?: string[];
  types?: string[];
  rating?: number;
  reviews?: number;
  priceLevel?: number;
  lat?: number;
  lng?: number;
  phone?: string;
  thumbnail?: string;
  mapsUri?: string;
}

export interface Recommendation {
  place_id: string;
  why_fits: string;
  snapshot?: PlaceSnapshot;
}

export type MessageStatus = "streaming" | "done" | "error";

/**
 * Lifecycle phase derived from SSE events. Drives UI loading indicators.
 *  - thinking:  initial state right after submit (no events yet)
 *  - searching: tool_start for find_places fired (Pass 1 in progress)
 *  - composing: places_filtered fired (Pass 2 running — text + recs in parallel)
 *  - done:      done event fired (or stream closed)
 */
export type MessagePhase = "thinking" | "searching" | "composing" | "done";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  recommendations?: Recommendation[];
  /** Only present on assistant messages */
  status?: MessageStatus;
  /** Only present on assistant messages — derived from SSE events */
  phase?: MessagePhase;
}

export interface ActiveLocationArg {
  lat: number;
  lng: number;
  label: string;
}

/** Mapped error category for UI component selection. */
export type ErrorCode = "rate_limited" | "budget" | "network" | "internal";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  /** Mapped error category — null when no error. */
  errorCode: ErrorCode | null;
  conversationId: string | null;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type ChatAction =
  | { type: "PUSH_USER_MSG"; message: ChatMessage }
  | { type: "PUSH_ASSISTANT_PENDING"; message: ChatMessage }
  | { type: "UPDATE_ASSISTANT"; id: string; patch: Partial<ChatMessage> }
  | { type: "APPEND_TEXT"; id: string; chunk: string }
  | { type: "SET_PHASE"; id: string; phase: MessagePhase }
  | { type: "SET_STREAMING"; value: boolean }
  | { type: "SET_ERROR"; error: string; errorCode: ErrorCode }
  | { type: "SET_CONVERSATION_ID"; id: string }
  | { type: "CLEAR" }
  | { type: "RESTORE_CONV_ID"; id: string }
  | { type: "RESTORE_MESSAGES"; messages: ChatMessage[]; conversationId: string };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "PUSH_USER_MSG":
      return { ...state, messages: [...state.messages, action.message] };

    case "PUSH_ASSISTANT_PENDING":
      return {
        ...state,
        messages: [...state.messages, action.message],
        isStreaming: true,
        error: null,
      };

    case "UPDATE_ASSISTANT":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, ...action.patch } : m,
        ),
      };

    case "APPEND_TEXT":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, text: m.text + action.chunk } : m,
        ),
      };

    case "SET_PHASE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, phase: action.phase } : m,
        ),
      };

    case "SET_STREAMING":
      return { ...state, isStreaming: action.value };

    case "SET_ERROR":
      return { ...state, error: action.error, errorCode: action.errorCode, isStreaming: false };

    case "SET_CONVERSATION_ID":
      return { ...state, conversationId: action.id };

    case "RESTORE_CONV_ID":
      return { ...state, conversationId: action.id };

    case "RESTORE_MESSAGES":
      return {
        messages: action.messages,
        isStreaming: false,
        error: null,
        errorCode: null,
        conversationId: action.conversationId,
      };

    case "CLEAR":
      return { messages: [], isStreaming: false, error: null, errorCode: null, conversationId: null };
  }
}

const initialState: ChatState = {
  messages: [],
  isStreaming: false,
  error: null,
  errorCode: null,
  conversationId: null,
};

const LS_CONV_KEY = "conv_id";

// ---------------------------------------------------------------------------
// SSE event payload types (validated at boundary)
// ---------------------------------------------------------------------------

interface RecsPayload {
  recommendations?: Recommendation[];
  assistant_message?: string;
  // Phase 4 runner may also emit a candidates/places map for snapshot hydration
  // TODO(phase-4-enhancement): runner SHOULD emit places_filtered { count, snapshots: [...] }
  //   with minimal fields. Until then, snapshot may be absent — render fallback gracefully.
  candidates?: Record<string, PlaceSnapshot>;
  places?: Record<string, PlaceSnapshot>;
}

function isRecsPayload(v: unknown): v is RecsPayload {
  return typeof v === "object" && v !== null && "recommendations" in v;
}

/** Maps a server error code string to a typed ErrorCode category for UI rendering. */
function mapErrorCode(code: string | undefined): ErrorCode {
  if (code === "rate_limited" || code === "upstream_rate_limit") return "rate_limited";
  if (code === "budget") return "budget";
  return "internal";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatStream() {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  // Ref to prevent double-sends while streaming
  const streamingRef = useRef(false);
  // H7: AbortController for cancelling in-flight SSE fetch on unmount/clear.
  const abortRef = useRef<AbortController | null>(null);

  // Abort any active stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // On mount: restore conversationId from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_CONV_KEY);
      if (stored) {
        dispatch({ type: "RESTORE_CONV_ID", id: stored });
      }
    } catch {
      // localStorage unavailable (SSR / private mode) — non-fatal
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, activeLocation: ActiveLocationArg): Promise<void> => {
      if (streamingRef.current) return; // Ignore sends while streaming
      if (!text.trim()) return;

      streamingRef.current = true;

      // H7: create fresh AbortController for this request; abort any prior one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();

      dispatch({
        type: "PUSH_USER_MSG",
        message: { id: userMsgId, role: "user", text: text.trim() },
      });
      dispatch({
        type: "PUSH_ASSISTANT_PENDING",
        message: {
          id: assistantMsgId,
          role: "assistant",
          text: "",
          status: "streaming",
          phase: "thinking",
        },
      });

      try {
        const deviceId = getOrCreateDeviceId();
        const convId = state.conversationId;

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": deviceId,
          },
          body: JSON.stringify({
            message: text.trim(),
            activeLocation,
            ...(convId ? { conversationId: convId } : {}),
            deviceId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        for await (const { event, data } of parseSSE(response)) {
          switch (event) {
            case "tool_start": {
              // Set phase to "searching" only when find_places fires.
              // Other tools (weather prefetched) are silent.
              const payload = data as { name?: string };
              if (payload.name === "find_places") {
                dispatch({ type: "SET_PHASE", id: assistantMsgId, phase: "searching" });
              }
              break;
            }

            case "tool_end": {
              // No UI update needed; tool finished
              break;
            }

            case "places_filtered": {
              // Install skeleton placeholders + advance phase.
              // Do NOT touch text — text streaming may have already started in parallel.
              const payload = data as { count?: number };
              const count = typeof payload.count === "number" ? payload.count : 3;
              const skeletons: Recommendation[] = Array.from({ length: count }, () => ({
                place_id: "",
                why_fits: "",
              }));
              dispatch({
                type: "UPDATE_ASSISTANT",
                id: assistantMsgId,
                patch: { recommendations: skeletons },
              });
              dispatch({ type: "SET_PHASE", id: assistantMsgId, phase: "composing" });
              break;
            }

            case "recs_delta": {
              if (isRecsPayload(data)) {
                // Hydrate snapshots if server provided a candidates / places map
                const snapshotMap: Record<string, PlaceSnapshot> =
                  data.candidates ?? data.places ?? {};

                const recs: Recommendation[] = (data.recommendations ?? []).map((r) => ({
                  ...r,
                  snapshot: r.snapshot ?? snapshotMap[r.place_id],
                }));

                // Text now owned by message_delta — IGNORE assistant_message even if
                // server still includes it (backwards-compat tolerance during rollover).
                dispatch({
                  type: "UPDATE_ASSISTANT",
                  id: assistantMsgId,
                  patch: { recommendations: recs },
                });
              }
              break;
            }

            case "message_delta": {
              // Server now streams text in chunks → APPEND, not REPLACE.
              const chunk =
                typeof data === "string" ? data : (data as { text?: string }).text ?? "";
              if (chunk) {
                dispatch({ type: "APPEND_TEXT", id: assistantMsgId, chunk });
              }
              break;
            }

            case "done": {
              const payload = data as { conversationId?: string };
              if (payload.conversationId) {
                dispatch({ type: "SET_CONVERSATION_ID", id: payload.conversationId });
                try {
                  localStorage.setItem(LS_CONV_KEY, payload.conversationId);
                } catch {
                  // Non-fatal
                }
              }
              dispatch({
                type: "UPDATE_ASSISTANT",
                id: assistantMsgId,
                patch: { status: "done" },
              });
              dispatch({ type: "SET_PHASE", id: assistantMsgId, phase: "done" });
              break;
            }

            case "error": {
              const payload = data as { code?: string; message?: string };
              const msg = payload.message ?? "Lỗi không xác định";
              const errCode = mapErrorCode(payload.code);
              dispatch({
                type: "UPDATE_ASSISTANT",
                id: assistantMsgId,
                patch: { status: "error", text: msg },
              });
              dispatch({ type: "SET_ERROR", error: msg, errorCode: errCode });
              break;
            }
          }
        }

        // Stream ended cleanly — ensure status + phase are "done" if not already set
        dispatch({
          type: "UPDATE_ASSISTANT",
          id: assistantMsgId,
          patch: { status: "done" },
        });
        dispatch({ type: "SET_PHASE", id: assistantMsgId, phase: "done" });
      } catch (err) {
        // H7: silently ignore AbortError — triggered by unmount or clear().
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const msg =
          err instanceof Error ? err.message : "Kết nối bị gián đoạn";
        dispatch({
          type: "UPDATE_ASSISTANT",
          id: assistantMsgId,
          patch: { status: "error", text: msg },
        });
        dispatch({ type: "SET_ERROR", error: msg, errorCode: "network" });
        toast({
          title: "Ôi 🙈",
          description: "Vũ trụ trục trặc, thử lại nha.",
          variant: "destructive",
        });
      } finally {
        streamingRef.current = false;
        dispatch({ type: "SET_STREAMING", value: false });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.conversationId],
  );

  /**
   * Loads a conversation from history into the chat state.
   * Called by app/page.tsx when ?c=<id> query param is present.
   * The caller fetches messages from the API and passes them in;
   * this hook restores them atomically via RESTORE_MESSAGES.
   */
  const loadConversation = useCallback(
    async (conversationId: string, restoredMessages?: ChatMessage[]): Promise<void> => {
      dispatch({
        type: "RESTORE_MESSAGES",
        messages: restoredMessages ?? [],
        conversationId,
      });
      try {
        localStorage.setItem(LS_CONV_KEY, conversationId);
      } catch {
        // Non-fatal
      }
    },
    [],
  );

  const clear = useCallback(() => {
    // H7: abort any active SSE stream before clearing state.
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    dispatch({ type: "CLEAR" });
    try {
      localStorage.removeItem(LS_CONV_KEY);
    } catch {
      // Non-fatal
    }
  }, []);

  return {
    messages: state.messages,
    isStreaming: state.isStreaming,
    error: state.error,
    errorCode: state.errorCode,
    sendMessage,
    loadConversation,
    conversationId: state.conversationId,
    clear,
  };
}
