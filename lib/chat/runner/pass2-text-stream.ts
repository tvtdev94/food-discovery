import "server-only";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/tools/types";
import { callResponsesStream } from "./runner-openai-client";

interface RunPass2TextStreamParams {
  inputMessages: unknown[];
  pass1FinalText: string;
  filteredPlaces: Place[];
  /** True khi runner phải gọi expandSearch để cứu vớt 0 quán. Text sẽ
   *  giải thích "mình mở rộng tìm xa hơn" để user biết. */
  wasExpanded?: boolean;
  onEvent: (event: string, data: unknown) => void;
  abortSignal?: AbortSignal;
}

interface RunPass2TextStreamResult {
  fullText: string;
  usage: { input_tokens: number; output_tokens: number };
}

/** Single source of truth for the short fallback. Imported by orchestrator too. */
export const TEXT_STREAM_FALLBACK = "Đây là vài quán mình thấy hợp ý bạn 🙂";

/**
 * Pass 2 (text branch): streaming Vietnamese assistant message.
 *
 * Runs concurrently with pass2-recs-structured. Emits `message_delta` for
 * each text chunk so the client can render characters as they arrive.
 *
 * Prompt forbids listing quán names — cards already show them. Text bubble
 * explains the *theme* / connecting reason.
 *
 * On stream failure: logs, returns fallback text + zero usage. Does NOT throw
 * (recs branch must still render).
 */
export async function runPass2TextStream(
  params: RunPass2TextStreamParams,
): Promise<RunPass2TextStreamResult> {
  const {
    inputMessages,
    pass1FinalText,
    filteredPlaces,
    wasExpanded = false,
    onEvent,
    abortSignal,
  } = params;

  const n = filteredPlaces.length;
  let userPrompt: string;
  if (n > 0 && wasExpanded) {
    userPrompt = `Khu user không có quán hợp ý nên mình MỞ RỘNG TÌM XA HƠN và chọn được ${n} quán. Hãy viết 1 đoạn ngắn (tối đa 4 câu, ≤2 emoji) báo user: "khu mình không có quán hợp gu lắm, mình tìm xa hơn xíu" rồi giới thiệu vibe các quán. KHÔNG liệt kê tên quán (cards bên dưới đã hiện tên rồi). Giọng vui tính casual VI.`;
  } else if (n > 0) {
    userPrompt = `Mình đã chọn được ${n} quán phù hợp cho user. Hãy viết 1 đoạn ngắn (tối đa 4 câu, ≤2 emoji) giới thiệu vibe chung tại sao những quán này hợp với user. KHÔNG liệt kê tên quán (cards bên dưới đã hiện tên rồi). Giọng vui tính, casual VI.`;
  } else {
    userPrompt =
      "Không tìm thấy quán phù hợp dù mình đã mở rộng tìm xa hơn. Viết 1-2 câu xin lỗi nhẹ nhàng và gợi ý user đổi từ khoá. ≤2 emoji.";
  }

  const streamInput: unknown[] = [
    ...inputMessages,
    { role: "assistant", content: pass1FinalText || "(tool calls completed)" },
    { role: "user", content: userPrompt },
  ];

  let fullText = "";
  let usage = { input_tokens: 0, output_tokens: 0 };

  try {
    const stream = await callResponsesStream(
      { input: streamInput },
      { signal: abortSignal },
    );

    for await (const evt of stream) {
      const e = evt as {
        type?: string;
        delta?: string;
        response?: {
          usage?: { input_tokens?: number; output_tokens?: number };
        };
      };

      if (e.type === "response.output_text.delta" && typeof e.delta === "string") {
        fullText += e.delta;
        onEvent("message_delta", e.delta);
        continue;
      }

      if (e.type === "response.completed" && e.response?.usage) {
        usage = {
          input_tokens: e.response.usage.input_tokens ?? 0,
          output_tokens: e.response.usage.output_tokens ?? 0,
        };
      }
      // Other event types (response.created, output_item.added, etc.) — skip.
    }
  } catch (err) {
    log.warn("pass2_text_stream.failed", {
      err: String(err),
      hasPartial: fullText.length > 0,
    });
    if (!fullText) {
      // No partial text — emit fallback as single delta so client sees something.
      fullText = TEXT_STREAM_FALLBACK;
      onEvent("message_delta", TEXT_STREAM_FALLBACK);
    }
  }

  return { fullText, usage };
}
