import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";
import { scrubError } from "@/lib/observability/scrub";

export interface UsageLogEntry {
  ownerKey?: string;
  conversationId?: string | null;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  toolCallsCount?: number;
  placesCalls?: number;
  cacheHits?: number;
  durationMs?: number;
  errorCode?: string;
}

/**
 * Fire-and-forget: inserts a usage_log row after each chat turn.
 * Never throws, never blocks the response critical path.
 */
export function flushTurn(entry: UsageLogEntry): void {
  queueMicrotask(async () => {
    try {
      await supabaseAdmin()
        .from("usage_log")
        .insert({
          owner_key: entry.ownerKey ?? null,
          conversation_id: entry.conversationId ?? null,
          model: entry.model ?? null,
          input_tokens: entry.inputTokens ?? 0,
          output_tokens: entry.outputTokens ?? 0,
          tool_calls_count: entry.toolCallsCount ?? 0,
          places_calls: entry.placesCalls ?? 0,
          cache_hits: entry.cacheHits ?? 0,
          duration_ms: entry.durationMs ?? 0,
          error_code: entry.errorCode ?? null,
        });
    } catch (e) {
      log.warn("usage_log.fail", { err: scrubError(e).message });
    }
  });
}
