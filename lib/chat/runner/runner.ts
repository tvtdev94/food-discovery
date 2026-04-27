import "server-only";
import { log } from "@/lib/logger";
import { ruleFilter, filterByDistance } from "@/lib/tools/rule-filter";
import { buildInputMessages, collectPlacesFromOutputs } from "./runner-helpers";
import { runPass1ToolLoop } from "./pass1-tool-loop";
import { runPass2Recs } from "./pass2-recs-structured";
import { runPass2TextStream, TEXT_STREAM_FALLBACK } from "./pass2-text-stream";
import { expandSearch } from "./expand-search";
import { speculativeFindPlaces } from "./speculative-fetch";
import type { RunChatTurnParams, RunChatTurnResult } from "./runner-types";

/**
 * Orchestrator for a chat turn.
 *
 * Pipeline:
 *  1. Pass 1 — tool loop (find_places, weather, geocode), max 3 rounds.
 *  2. Rule-filter places → top 5 candidates → emit `places_filtered`.
 *  3. Pass 2 (parallel via Promise.allSettled):
 *     - Text stream: emits `message_delta` chunks (no JSON shape).
 *     - Recs structured: emits one `recs_delta` with hydrated snapshots.
 *  4. Build aggregated result for caller (route → persistTurn).
 *
 * Each branch in step 3 is independently fault-tolerant: failure of one
 * does not block the other. Text fallback is short VI string; recs fallback
 * is empty array.
 */
export async function runChatTurn(params: RunChatTurnParams): Promise<RunChatTurnResult> {
  const { systemPrompt, history, userMessage, activeLocation, onEvent, abortSignal } = params;

  const inputMessages = buildInputMessages(systemPrompt, history, userMessage);

  // Speculative SearchApi: kick song song với Pass-1 LLM. Warm cache để
  // dispatchTool sau hit instant. Errors swallowed inside, void = không await.
  void speculativeFindPlaces({
    userMessage,
    lat: activeLocation.lat,
    lng: activeLocation.lng,
  });

  // Pass 1 — tool loop.
  const pass1 = await runPass1ToolLoop({ inputMessages, onEvent, abortSignal });

  // Filter candidates → cap at 5 for Pass-2 token efficiency.
  // Rec output maxItems=5 anyway; 5 candidates đủ menu cho model chọn 3-5 recs.
  const rawPlaces = collectPlacesFromOutputs(pass1.findPlacesOutputs);
  // STRICT distance filter — SearchApi `ll=` chỉ là bias không strict, Google
  // hay trả quán famous toàn quốc khi query khớp tên. 10km = "quanh đây".
  const NEARBY_KM = 10;
  const nearby = filterByDistance(
    rawPlaces,
    activeLocation.lat,
    activeLocation.lng,
    NEARBY_KM,
  );
  const filteredAll = ruleFilter(nearby);
  // Cap 5: lighter Pass-2 token; recs schema maxItems=5; sufficient menu.
  let filteredPlaces = filteredAll.slice(0, 5);
  let wasExpanded = false;

  log.info("places.filter", {
    raw: rawPlaces.length,
    nearby: nearby.length,
    filtered_all: filteredAll.length,
    sent_to_pass2: filteredPlaces.length,
  });

  // Auto-expand fallback: nếu 0 quán quanh 10km → relax + mở rộng radius
  // thay vì đẩy việc tự thử lại cho user. wasExpanded → text-stream sẽ
  // báo user "mình đã tìm xa hơn".
  if (filteredPlaces.length === 0) {
    const expanded = await expandSearch({
      toolCalls: pass1.allToolCalls as Array<{
        name: string;
        arguments: string;
        result: unknown;
      }>,
      userLat: activeLocation.lat,
      userLng: activeLocation.lng,
      onEvent,
    });
    filteredPlaces = expanded.places.slice(0, 5);
    wasExpanded = expanded.wasExpanded && filteredPlaces.length > 0;
  }

  onEvent("places_filtered", { count: filteredPlaces.length });

  // Pass 2 — parallel: text stream + structured recs.
  const [textRes, recsRes] = await Promise.allSettled([
    runPass2TextStream({
      inputMessages,
      pass1FinalText: pass1.pass1FinalText,
      filteredPlaces,
      wasExpanded,
      onEvent,
      abortSignal,
    }),
    runPass2Recs({
      inputMessages,
      pass1FinalText: pass1.pass1FinalText,
      filteredPlaces,
      onEvent,
      abortSignal,
    }),
  ]);

  // Resolve text branch.
  let assistantMessage = TEXT_STREAM_FALLBACK;
  let textUsage = { input_tokens: 0, output_tokens: 0 };
  if (textRes.status === "fulfilled") {
    assistantMessage = textRes.value.fullText || TEXT_STREAM_FALLBACK;
    textUsage = textRes.value.usage;
  } else {
    // pass2-text-stream catches its own errors and returns fallback, so this
    // branch is unreachable in practice. Defensive emit kept in case future
    // refactors let exceptions escape (e.g. abort in a different code path).
    log.warn("runner.text_branch_failed", { err: String(textRes.reason) });
    onEvent("message_delta", TEXT_STREAM_FALLBACK);
  }

  // Resolve recs branch.
  let recommendations: Array<{ place_id: string; why_fits: string }> = [];
  let recsUsage = { input_tokens: 0, output_tokens: 0 };
  if (recsRes.status === "fulfilled") {
    recommendations = recsRes.value.recommendations;
    recsUsage = recsRes.value.usage;
  } else {
    log.warn("runner.recs_branch_failed", { err: String(recsRes.reason) });
    onEvent("recs_delta", { recommendations: [] });
  }

  const usage = {
    input_tokens: pass1.usage.input_tokens + textUsage.input_tokens + recsUsage.input_tokens,
    output_tokens: pass1.usage.output_tokens + textUsage.output_tokens + recsUsage.output_tokens,
  };

  return {
    assistantMessage,
    recommendations,
    filteredPlaces,
    toolCalls: pass1.allToolCalls,
    usage,
  };
}
