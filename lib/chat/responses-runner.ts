import "server-only";

/**
 * Facade for the chat runner pipeline.
 *
 * Implementation lives in `./runner/` — split into small modules:
 *  - `runner.ts`              — orchestrator (Pass 1 → places_filtered → parallel Pass 2)
 *  - `pass1-tool-loop.ts`     — tool-calling loop (find_places, weather, geocode)
 *  - `pass2-text-stream.ts`   — streaming Vietnamese text (emits message_delta chunks)
 *  - `pass2-recs-structured.ts` — JSON structured recs with place_id enum guard
 *  - `runner-openai-client.ts` — OpenAI singleton + create/stream helpers
 *  - `runner-helpers.ts`      — input builder, message text extractor, places collector
 *  - `runner-types.ts`        — shared types
 */

export { runChatTurn } from "./runner/runner";
export type { RunChatTurnParams, RunChatTurnResult } from "./runner/runner-types";
