import "server-only";
import { log } from "@/lib/logger";
import { buildRecSchema } from "@/lib/chat/response-schema";
import type { Place } from "@/lib/tools/types";
import { callResponsesCreate } from "./runner-openai-client";
import { extractTextFromMessage } from "./runner-helpers";
import type { MessageOutputItem } from "./runner-types";

interface RunPass2RecsParams {
  inputMessages: unknown[];
  pass1FinalText: string;
  filteredPlaces: Place[];
  onEvent: (event: string, data: unknown) => void;
  abortSignal?: AbortSignal;
}

interface RunPass2RecsResult {
  recommendations: Array<{ place_id: string; why_fits: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Pass 2 (recs branch): structured JSON output with place_id enum guard.
 *
 * Schema contains ONLY recommendations[] — text comes via the parallel
 * streaming call (pass2-text-stream.ts). After validation + snapshot
 * hydration, emits a single `recs_delta` SSE event.
 */
export async function runPass2Recs(params: RunPass2RecsParams): Promise<RunPass2RecsResult> {
  const { inputMessages, pass1FinalText, filteredPlaces, onEvent, abortSignal } = params;

  const placeIdEnum = filteredPlaces.map((p) => p.placeId);
  const recSchema = buildRecSchema(placeIdEnum);

  // Minimal candidate blob for token efficiency.
  const candidatesBlob = filteredPlaces.map((p) => ({
    place_id: p.placeId,
    name: p.name,
    rating: p.rating,
    reviews: p.reviews,
    price_level: p.priceLevel,
    types: p.types.slice(0, 2),
  }));

  const pass2SystemMsg =
    filteredPlaces.length > 0
      ? `Chọn 3-5 quán phù hợp nhất từ candidates dưới đây. Trả về JSON đúng schema với recommendations[]. why_fits ≤80 ký tự VI, nêu lý do quán hợp với user.\n\nCandidates JSON:\n${JSON.stringify(candidatesBlob)}`
      : "Không tìm thấy quán phù hợp. Trả về JSON với recommendations là mảng rỗng.";

  const pass2Input: unknown[] = [
    ...inputMessages,
    { role: "assistant", content: pass1FinalText || "(tool calls completed)" },
    { role: "user", content: pass2SystemMsg },
  ];

  const resp = await callResponsesCreate(
    {
      input: pass2Input,
      text: {
        format: {
          type: "json_schema",
          name: "Recommendations",
          strict: true,
          schema: recSchema,
        },
      },
    },
    { signal: abortSignal },
  );

  const usage = {
    input_tokens: resp.usage?.input_tokens ?? 0,
    output_tokens: resp.usage?.output_tokens ?? 0,
  };

  const messageItems = resp.output.filter(
    (o): o is MessageOutputItem => o.type === "message",
  );
  const text =
    messageItems.length > 0
      ? extractTextFromMessage(messageItems[messageItems.length - 1])
      : "";

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      log.warn("pass2_recs.parse_error", { preview: text.slice(0, 80) });
    }
  }

  // Hydrate snapshots; drop hallucinated place_ids.
  const placeById = new Map(filteredPlaces.map((p) => [p.placeId, p]));
  const validIds = new Set(placeIdEnum);

  const rawRecs =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { recommendations?: unknown }).recommendations)
      ? ((parsed as { recommendations: Array<{ place_id: string; why_fits: string }> }).recommendations)
      : [];

  const validRecs = rawRecs.filter((r) => {
    if (!validIds.has(r.place_id)) {
      log.warn("pass2_recs.hallucinated_place_id", { place_id: r.place_id });
      return false;
    }
    return true;
  });

  const hydratedRecs = validRecs.map((r) => ({
    ...r,
    snapshot: placeById.get(r.place_id),
  }));

  // Emit hydrated payload — client never double-decodes.
  onEvent("recs_delta", { recommendations: hydratedRecs });

  return {
    recommendations: validRecs.map((r) => ({ place_id: r.place_id, why_fits: r.why_fits })),
    usage,
  };
}
