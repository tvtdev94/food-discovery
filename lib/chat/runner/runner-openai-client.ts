import "server-only";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import type { ResponsesResponse } from "./runner-types";

/**
 * OpenAI client + Responses API helpers.
 * - Lazy singleton (avoids env validation at import time during tests).
 * - `callResponsesCreate`: blocking call with model fallback to gpt-4o-mini.
 * - `callResponsesStream`: streaming iterator with same fallback logic.
 */

let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

function isModelNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { status?: number; code?: string; message?: string };
    if (e.status && e.status >= 400 && e.status < 500) {
      const msg = (e.message ?? "").toLowerCase();
      return (
        msg.includes("model") &&
        (msg.includes("not found") || msg.includes("does not exist") || msg.includes("invalid"))
      );
    }
  }
  return false;
}

interface CallOptions {
  signal?: AbortSignal;
}

/** Blocking Responses API call with fallback to gpt-4o-mini on model-not-found 4xx. */
export async function callResponsesCreate(
  params: Record<string, unknown>,
  options?: CallOptions,
  modelOverride?: string,
): Promise<ResponsesResponse> {
  const openai = getOpenAI();
  const model = modelOverride ?? env.OPENAI_MODEL;
  const sdkOpts = options?.signal ? { signal: options.signal } : undefined;

  try {
    // openai.responses.create is the Responses API method in SDK v4.77+
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (openai as any).responses.create({ ...params, model }, sdkOpts);
    return resp as ResponsesResponse;
  } catch (err: unknown) {
    if (!modelOverride && isModelNotFoundError(err)) {
      log.warn("responses_runner.model_fallback", {
        attempted: env.OPENAI_MODEL,
        fallback: "gpt-4o-mini",
        api: "create",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (openai as any).responses.create(
        { ...params, model: "gpt-4o-mini" },
        sdkOpts,
      );
      return resp as ResponsesResponse;
    }
    throw err;
  }
}

/**
 * Streaming Responses API call. Returns an async iterable of stream events.
 * Each event has shape `{ type: string; delta?: string; response?: ... }`.
 * Caller iterates via `for await ... of stream` and filters event types.
 *
 * The signal aborts the underlying connection; iteration will throw and the
 * caller's catch handles it (typically returning a fallback string).
 */
export async function callResponsesStream(
  params: Record<string, unknown>,
  options?: CallOptions,
  modelOverride?: string,
): Promise<AsyncIterable<unknown>> {
  const openai = getOpenAI();
  const model = modelOverride ?? env.OPENAI_MODEL;
  const sdkOpts = options?.signal ? { signal: options.signal } : undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await (openai as any).responses.stream({ ...params, model }, sdkOpts);
    return stream as AsyncIterable<unknown>;
  } catch (err: unknown) {
    if (!modelOverride && isModelNotFoundError(err)) {
      log.warn("responses_runner.model_fallback", {
        attempted: env.OPENAI_MODEL,
        fallback: "gpt-4o-mini",
        api: "stream",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (openai as any).responses.stream(
        { ...params, model: "gpt-4o-mini" },
        sdkOpts,
      );
      return stream as AsyncIterable<unknown>;
    }
    throw err;
  }
}
