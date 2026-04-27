import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/tools/types";
import type { Json } from "@/lib/supabase/database-types";

export interface PersistTurnInput {
  ownerKey: string;
  conversationId: string | null;
  activeLocation: { lat: number; lng: number; label: string };
  userMessage: string;
  assistantMessage: string;
  toolCalls: unknown[];
  recommendations: Array<{
    place_id: string;
    why_fits: string;
    snapshot: Place;
    rank: number;
  }>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface PersistTurnResult {
  conversationId: string;
  assistantMessageId: string;
}

/**
 * Persists a full chat turn to Supabase using the service-role client.
 * Best-effort — catches and logs errors, never re-throws.
 * Returns conversationId (new or existing) and the new assistant message id.
 */
export async function persistTurn(input: PersistTurnInput): Promise<PersistTurnResult> {
  const db = supabaseAdmin();

  const {
    ownerKey,
    conversationId: inputConvId,
    activeLocation,
    userMessage,
    assistantMessage,
    toolCalls,
    recommendations,
    usage,
  } = input;

  // Fallback ids so we can always return something even on partial failure.
  let conversationId = inputConvId ?? "";
  let assistantMessageId = "";

  try {
    // --- Upsert conversation ---
    if (!inputConvId) {
      // New conversation: create with title = first 40 chars of user message.
      const title = userMessage.slice(0, 40);
      const { data, error } = await db
        .from("conversations")
        .insert({
          owner_key: ownerKey,
          title,
          active_location: activeLocation,
        })
        .select("id")
        .single();

      if (error || !data) {
        log.error("persist_turn.create_conv_error", { err: error?.message });
        return { conversationId, assistantMessageId };
      }
      conversationId = data.id as string;
    } else {
      // Existing conversation: update location + timestamp.
      const { error } = await db
        .from("conversations")
        .update({ active_location: activeLocation, updated_at: new Date().toISOString() })
        .eq("id", inputConvId)
        .eq("owner_key", ownerKey);

      if (error) {
        log.warn("persist_turn.update_conv_error", { err: error.message });
        // Non-fatal — continue with persist.
      }
    }

    // --- Insert user message ---
    const { error: userMsgError } = await db.from("messages").insert({
      conversation_id: conversationId,
      owner_key: ownerKey,
      role: "user",
      content: userMessage,
      tool_calls: null,
      usage: null,
    });

    if (userMsgError) {
      log.warn("persist_turn.user_msg_error", { err: userMsgError.message });
    }

    // --- Insert assistant message ---
    const { data: assistantMsgData, error: assistantMsgError } = await db
      .from("messages")
      .insert({
        conversation_id: conversationId,
        owner_key: ownerKey,
        role: "assistant",
        content: assistantMessage,
        tool_calls: toolCalls as unknown as Json,
        usage: usage as unknown as Json,
      })
      .select("id")
      .single();

    if (assistantMsgError || !assistantMsgData) {
      log.warn("persist_turn.assistant_msg_error", { err: assistantMsgError?.message });
      return { conversationId, assistantMessageId };
    }

    assistantMessageId = assistantMsgData.id as string;

    // --- Bulk insert recommendations ---
    if (recommendations.length > 0) {
      const rows = recommendations.map((r) => ({
        message_id: assistantMessageId,
        owner_key: ownerKey,
        place_id: r.place_id,
        snapshot: r.snapshot as unknown as Json,
        rank: r.rank,
        why_fits: r.why_fits,
      }));

      const { error: recError } = await db.from("recommendations").insert(rows);
      if (recError) {
        log.warn("persist_turn.recs_error", { err: recError.message, count: rows.length });
      }
    }
  } catch (err) {
    // Best-effort: log but do not re-throw.
    log.error("persist_turn.unexpected_error", { err: String(err) });
  }

  return { conversationId, assistantMessageId };
}
