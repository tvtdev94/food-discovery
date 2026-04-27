import "server-only";
import { dispatchTool } from "@/lib/chat/dispatch-tools";
import { ALL_TOOL_SCHEMAS } from "@/lib/chat/tool-schemas";
import { callResponsesCreate } from "./runner-openai-client";
import { extractTextFromMessage } from "./runner-helpers";
import type {
  FunctionCallItem,
  FunctionCallOutputItem,
  MessageOutputItem,
  Pass1Result,
} from "./runner-types";

interface RunPass1Params {
  inputMessages: unknown[];
  onEvent: (event: string, data: unknown) => void;
  abortSignal?: AbortSignal;
}

/**
 * Pass 1: tool-calling loop (max 3 rounds).
 * - Calls Responses API with tools enabled.
 * - For each function_call output, dispatches the tool and feeds result back.
 * - Loop ends when model emits no more function calls.
 * - Captures find_places outputs separately for downstream rule filtering.
 */
export async function runPass1ToolLoop(params: RunPass1Params): Promise<Pass1Result> {
  const { inputMessages, onEvent, abortSignal } = params;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const allToolCalls: unknown[] = [];
  const findPlacesOutputs: FunctionCallOutputItem[] = [];

  let pass1Input: unknown[] = inputMessages;
  let pass1FinalText = "";

  for (let round = 0; round < 3; round++) {
    const resp = await callResponsesCreate(
      {
        input: pass1Input,
        tools: ALL_TOOL_SCHEMAS,
        tool_choice: "auto",
      },
      { signal: abortSignal },
    );

    totalInputTokens += resp.usage?.input_tokens ?? 0;
    totalOutputTokens += resp.usage?.output_tokens ?? 0;

    const functionCalls = resp.output.filter(
      (o): o is FunctionCallItem => o.type === "function_call",
    );
    const messageItems = resp.output.filter(
      (o): o is MessageOutputItem => o.type === "message",
    );

    if (messageItems.length > 0) {
      pass1FinalText = extractTextFromMessage(messageItems[messageItems.length - 1]);
    }

    if (functionCalls.length === 0) break;

    const toolOutputItems: FunctionCallOutputItem[] = [];

    for (const fc of functionCalls) {
      onEvent("tool_start", { name: fc.name, args: fc.arguments });
      const t0 = Date.now();

      const result = await dispatchTool(fc.name, fc.arguments);
      const ms = Date.now() - t0;

      onEvent("tool_end", { name: fc.name, ms });
      allToolCalls.push({ name: fc.name, arguments: fc.arguments, result });

      const outputItem: FunctionCallOutputItem = {
        type: "function_call_output",
        call_id: fc.call_id,
        output: JSON.stringify(result),
      };
      toolOutputItems.push(outputItem);

      if (fc.name === "find_places") {
        findPlacesOutputs.push(outputItem);
      }
    }

    // Build next round input: previous response output + tool outputs.
    pass1Input = [...pass1Input, ...resp.output, ...toolOutputItems];
  }

  return {
    allToolCalls,
    findPlacesOutputs,
    pass1Input,
    pass1FinalText,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
  };
}
