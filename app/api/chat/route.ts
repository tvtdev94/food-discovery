import "server-only";
import { z } from "zod";
import { NextRequest } from "next/server";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { ratelimitChatSession, ratelimitChatIp } from "@/lib/redis";
import { loadHistory } from "@/lib/chat/load-history";
import { buildSystemPromptV2 as buildSystemPrompt } from "@/lib/chat/persona-prompt-v2";
import { makeSSEStream } from "@/lib/chat/sse";
import { runChatTurn } from "@/lib/chat/responses-runner";
import { persistTurn } from "@/lib/chat/persist-turn";
import { getWeather } from "@/lib/tools/weather";
import { RateLimitError, BudgetExceededError } from "@/lib/tools/errors";
import { log } from "@/lib/logger";
import { flushTurn } from "@/lib/observability/usage-logger";
import { captureException } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Request body schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  activeLocation: z.object({
    lat: z.number(),
    lng: z.number(),
    label: z.string().min(1).max(200),
  }),
  conversationId: z.string().uuid().optional(),
  deviceId: z.string().max(128).optional(),
});

// ---------------------------------------------------------------------------
// SSE response headers
// ---------------------------------------------------------------------------

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

// ---------------------------------------------------------------------------
// POST /api/chat
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<Response> {
  // --- Parse body ---
  let body: z.infer<typeof BodySchema>;
  try {
    const raw: unknown = await req.json();
    body = BodySchema.parse(raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { message, activeLocation, conversationId } = body;

  // --- Resolve identity ---
  let ownerKey: string;
  try {
    const identity = await resolveIdentity(req);
    ownerKey = identity.ownerKey;
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // --- Rate limiting ---
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const sessionKey = conversationId ?? ownerKey;

  const [sessionLimit, ipLimit] = await Promise.all([
    ratelimitChatSession.limit(sessionKey),
    ratelimitChatIp.limit(ip),
  ]);

  if (!sessionLimit.success || !ipLimit.success) {
    // reset is a unix-ms timestamp from Upstash — coerce to 0 if somehow absent.
    const reset = Math.max(
      (sessionLimit.reset as number | undefined) ?? 0,
      (ipLimit.reset as number | undefined) ?? 0,
    );
    const retryAfter = Math.ceil((reset - Date.now()) / 1000);
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(retryAfter, 1)) },
      },
    );
  }

  // --- Load history + preferences ---
  const { history, preferences } = await loadHistory(conversationId ?? null, ownerKey);

  // --- Pre-fetch weather (saves one tool round) ---
  let weather;
  try {
    weather = await getWeather(activeLocation.lat, activeLocation.lng);
  } catch (err) {
    log.warn("chat.weather_prefetch_failed", { err: String(err) });
    // Non-fatal — fallback to neutral weather so prompt still works.
    weather = {
      tempC: 28,
      condition: "unknown",
      rainProbPct: 0,
      isDay: true,
      ts: Date.now(),
    };
  }

  // --- Build system prompt ---
  const systemPrompt = buildSystemPrompt({
    activeLocation,
    weather,
    userContext: preferences,
    nowIso: new Date().toISOString(),
  });

  // --- Create SSE stream ---
  const { readable, write, close } = makeSSEStream();

  // --- AbortController plumbed through to OpenAI SDK ---
  // On timeout or client disconnect, abort all in-flight LLM calls so we don't
  // burn tokens generating output that will never be read.
  const abortController = new AbortController();

  // Detect client disconnect via the request signal (Next.js wires this for us).
  req.signal.addEventListener("abort", () => abortController.abort(), { once: true });

  // --- 90s timeout guard ---
  // Eval Round 1 (2026-04-29) showed 8/30 timeouts at 60s ceiling — full pipeline
  // with cold cache + structured Pass-2 sometimes hits 70s+. Bump to 90s.
  const timeoutId = setTimeout(() => {
    abortController.abort();
    write("error", { code: "timeout", message: "Não mình hơi đờ. Thử lại nha." });
    close();
  }, 90_000);

  // Log message metadata — never log full content (PII).
  const msgPreview = message.slice(0, 20);
  log.info("chat.start", { len: message.length, preview: msgPreview, ownerKey: ownerKey.slice(0, 8) });

  const t0 = Date.now();

  // --- Fire-and-forget turn execution ---
  void runChatTurn({
    systemPrompt,
    history,
    userMessage: message,
    activeLocation,
    onEvent: write,
    abortSignal: abortController.signal,
  })
    .then(async (result) => {
      // Persist turn (best-effort).
      const { conversationId: savedConvId, assistantMessageId } = await persistTurn({
        ownerKey,
        conversationId: conversationId ?? null,
        activeLocation,
        userMessage: message,
        assistantMessage: result.assistantMessage,
        toolCalls: result.toolCalls,
        recommendations: result.recommendations
          .map((r, i) => {
            const place = result.filteredPlaces.find((p) => p.placeId === r.place_id);
            // place_id has already been validated against filteredPlaces in responses-runner;
            // guard is a belt-and-suspenders check.
            if (!place) return null;
            return {
              place_id: r.place_id,
              why_fits: r.why_fits,
              snapshot: place,
              rank: i + 1,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
        usage: result.usage,
      });

      log.info("chat.done", {
        conversationId: savedConvId,
        recs: result.recommendations.length,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
      });

      // Count tool calls by type for usage metrics.
      const placesCalls = result.toolCalls.filter(
        (tc) => (tc as { name: string }).name === "find_places",
      ).length;

      flushTurn({
        ownerKey,
        conversationId: savedConvId,
        model: process.env.OPENAI_MODEL,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        toolCallsCount: result.toolCalls.length,
        placesCalls,
        // cache_hits: tracked at places.ts level; MVP passes 0 here (no cross-boundary counter).
        cacheHits: 0,
        durationMs: Date.now() - t0,
      });

      write("done", { conversationId: savedConvId, assistantMessageId });
    })
    .catch((err: unknown) => {
      if (err instanceof RateLimitError) {
        write("error", {
          code: "upstream_rate_limit",
          message: "Đang quá tải, thử lại 1 phút nữa.",
        });
      } else if (err instanceof BudgetExceededError) {
        write("error", {
          code: "budget",
          message: "Hôm nay hết ngân sách tìm quán 😅 Thử lại mai nha.",
        });
      } else {
        log.error("chat.fail", { err: String(err) });
        captureException(err, { route: "api/chat" });
        flushTurn({
          ownerKey,
          conversationId: conversationId ?? null,
          durationMs: Date.now() - t0,
          errorCode: "internal",
        });
        write("error", { code: "internal", message: "Não mình hơi đờ. Thử lại nha." });
      }
    })
    .finally(() => {
      clearTimeout(timeoutId);
      close();
    });

  return new Response(readable, { headers: SSE_HEADERS });
}
