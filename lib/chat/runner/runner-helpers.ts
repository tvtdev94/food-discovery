import "server-only";
import type { Place } from "@/lib/tools/types";
import type {
  FunctionCallOutputItem,
  MessageOutputItem,
  RunChatTurnParams,
} from "./runner-types";

/** Converts our history format into Responses API input messages. */
export function buildInputMessages(
  systemPrompt: string,
  history: RunChatTurnParams["history"],
  userMessage: string,
): unknown[] {
  const messages: unknown[] = [{ role: "system", content: systemPrompt }];

  for (const h of history) {
    if (h.role === "user" || h.role === "assistant") {
      messages.push({ role: h.role, content: h.content ?? "" });
    }
    // Skip tool call history items — they are not standard message format.
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

/** Extracts text content from a message output item. */
export function extractTextFromMessage(item: MessageOutputItem): string {
  return item.content
    .filter((c) => c.type === "output_text" || c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

/** Collects all Place[] arrays from find_places tool call outputs. */
export function collectPlacesFromOutputs(outputs: FunctionCallOutputItem[]): Place[] {
  const all: Place[] = [];
  for (const o of outputs) {
    try {
      const parsed = JSON.parse(o.output) as { places?: Place[] };
      if (Array.isArray(parsed.places)) {
        all.push(...parsed.places);
      }
    } catch {
      // Malformed output — skip.
    }
  }
  return all;
}
