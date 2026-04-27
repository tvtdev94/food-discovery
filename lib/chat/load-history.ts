import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export interface HistoryMessage {
  role: string;
  content: string | null;
  tool_calls: unknown;
}

export interface LoadHistoryResult {
  history: HistoryMessage[];
  preferences: Record<string, unknown>;
}

/**
 * Loads the last 10 messages for a conversation and the owner's preference context.
 * Uses service-role client to bypass RLS — owner_key enforced in WHERE clause.
 */
export async function loadHistory(
  conversationId: string | null,
  ownerKey: string,
): Promise<LoadHistoryResult> {
  const db = supabaseAdmin();

  // Load last 10 messages in reverse-chron order, then flip to chronological.
  let history: HistoryMessage[] = [];
  if (conversationId) {
    const { data, error } = await db
      .from("messages")
      .select("role, content, tool_calls")
      .eq("conversation_id", conversationId)
      // Enforce ownership via conversations join isn't straightforward in select;
      // instead join through conversations to verify owner_key.
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      log.warn("load_history.messages_error", { conversationId, err: error.message });
    } else if (data) {
      // Verify messages belong to a conversation owned by this key.
      const { data: conv } = await db
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("owner_key", ownerKey)
        .maybeSingle();

      if (conv) {
        // Reverse to restore chronological order.
        history = (data as HistoryMessage[]).reverse();
      } else {
        log.warn("load_history.owner_mismatch", { conversationId });
      }
    }
  }

  // Load preferences context blob.
  let preferences: Record<string, unknown> = {};
  const { data: prefData, error: prefError } = await db
    .from("preferences")
    .select("context")
    .eq("owner_key", ownerKey)
    .maybeSingle();

  if (prefError) {
    log.warn("load_history.prefs_error", { err: prefError.message });
  } else if (prefData?.context && typeof prefData.context === "object") {
    preferences = prefData.context as Record<string, unknown>;
  }

  return { history, preferences };
}
