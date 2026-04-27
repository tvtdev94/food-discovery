import "server-only";
import type { Place } from "@/lib/tools/types";

/**
 * Shared types for the chat runner pipeline.
 *
 * The Responses API (SDK v4.77+) returns `output` as an array of items.
 * We narrow only the items we care about; unknown items are tolerated.
 */

export interface FunctionCallItem {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface FunctionCallOutputItem {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export interface MessageOutputItem {
  type: "message";
  role: string;
  content: Array<{ type: string; text?: string }>;
}

export type OutputItem =
  | FunctionCallItem
  | FunctionCallOutputItem
  | MessageOutputItem
  | { type: string };

export interface ResponsesResponse {
  id: string;
  output: OutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface RunChatTurnParams {
  systemPrompt: string;
  history: Array<{ role: string; content: string | null; tool_calls?: unknown }>;
  userMessage: string;
  activeLocation: { lat: number; lng: number; label: string };
  onEvent: (event: string, data: unknown) => void;
  /** Aborts in-flight OpenAI calls when route times out or client disconnects. */
  abortSignal?: AbortSignal;
}

export interface RunChatTurnResult {
  assistantMessage: string;
  recommendations: Array<{ place_id: string; why_fits: string }>;
  filteredPlaces: Place[];
  toolCalls: unknown[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface Pass1Result {
  allToolCalls: unknown[];
  findPlacesOutputs: FunctionCallOutputItem[];
  pass1Input: unknown[];
  pass1FinalText: string;
  usage: { input_tokens: number; output_tokens: number };
}
