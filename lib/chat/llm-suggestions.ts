import "server-only";

import { callResponsesCreate } from "@/lib/chat/runner/runner-openai-client";
import { extractTextFromMessage } from "@/lib/chat/runner/runner-helpers";
import { log } from "@/lib/logger";
import type { Weather } from "@/lib/tools/types";
import type { HourBucket, WeatherKey } from "@/lib/chat/build-suggestions-context";

/**
 * LLM-generated quick chips.
 *
 * Calls gpt-4o-mini với strict JSON schema để sinh 6 prompt VI ngắn theo
 * context (location/hour/weather). Schema enum guard cho icon/tone → LLM
 * không hallucinate ngoài whitelist. Defense-in-depth: post-validate filter
 * thêm 1 lần khi parse output.
 *
 * Fallback: trả `[]` khi LLM fail (timeout, parse error, network) — caller
 * sẽ render skeleton briefly rồi disappear (silent UX, không show error).
 */

// ---------------------------------------------------------------------------
// Whitelists — strict enum cho schema + post-validate.
// ---------------------------------------------------------------------------

export const ICON_WHITELIST = [
  "CloudRain",
  "Leaf",
  "Moon",
  "Sun",
  "Users",
  "Wallet",
  "Coffee",
  "Pizza",
  "Sandwich",
  "Soup",
  "Flame",
  "Sparkles",
] as const;

export const TONE_WHITELIST = [
  "blue",
  "green",
  "purple",
  "amber",
  "rose",
  "pink",
] as const;

export type IconName = (typeof ICON_WHITELIST)[number];
export type Tone = (typeof TONE_WHITELIST)[number];

export interface ChipItem {
  prompt: string;
  iconName: IconName;
  tone: Tone;
}

const ICON_SET: ReadonlySet<string> = new Set(ICON_WHITELIST);
const TONE_SET: ReadonlySet<string> = new Set(TONE_WHITELIST);

// ---------------------------------------------------------------------------
// JSON schema (Responses API strict structured output).
// ---------------------------------------------------------------------------

const SUGGESTIONS_SCHEMA = {
  type: "object",
  properties: {
    chips: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "VI ≤6 từ, tone Gen-Z hài thân thiện, không generic.",
          },
          iconName: { type: "string", enum: ICON_WHITELIST as readonly string[] },
          tone: { type: "string", enum: TONE_WHITELIST as readonly string[] },
        },
        required: ["prompt", "iconName", "tone"],
        additionalProperties: false,
      },
    },
  },
  required: ["chips"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// LLM caller.
// ---------------------------------------------------------------------------

interface GenerateParams {
  lat: number;
  lng: number;
  hourBucket: HourBucket;
  weatherKey: WeatherKey;
  weather: Weather;
}

const SYSTEM_PROMPT = `Bạn là food-buddy AI. Sinh 6 PROMPT NGẮN tiếng Việt (≤6 từ mỗi cái) gợi ý cho user về món/quán phù hợp với context vị trí + giờ + thời tiết hiện tại. Tone Gen-Z hài thân thiện, KHÔNG generic kiểu "Quán ăn ngon". Đa dạng góc nhìn: mood, budget, cuisine, group, time, weather. Mỗi prompt kèm 1 icon name (whitelist 12) + 1 tone color (whitelist 6).

Ví dụ phong cách: "Mưa lạnh ăn gì nóng?", "Khuya đói quá", "Đi nhóm 4 người", "Ít tiền no bụng".

Trả JSON đúng schema, KHÔNG markdown, KHÔNG giải thích.`;

const LLM_TIMEOUT_MS = 8_000;

export async function generateSuggestions(params: GenerateParams): Promise<ChipItem[]> {
  const contextBlob = JSON.stringify({
    lat: Math.round(params.lat * 100) / 100,
    lng: Math.round(params.lng * 100) / 100,
    hour: params.hourBucket,
    weather: {
      tempC: params.weather.tempC,
      condition: params.weather.condition,
      rainProbPct: params.weather.rainProbPct,
      isDay: params.weather.isDay,
    },
    weatherMode: params.weatherKey,
  });

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);

  try {
    // Pin gpt-4o-mini: chips ngắn không cần model lớn, tiết kiệm ~5x cost
    // so với env.OPENAI_MODEL default (gpt-5-mini). Override = 3rd arg.
    const resp = await callResponsesCreate(
      {
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Context:\n${contextBlob}` },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "Suggestions",
            strict: true,
            schema: SUGGESTIONS_SCHEMA,
          },
        },
        max_output_tokens: 400,
      },
      { signal: ctrl.signal },
      "gpt-4o-mini",
    );

    const messageItem = resp.output.find(
      (o): o is { type: "message"; role: string; content: Array<{ type: string; text?: string }> } =>
        o.type === "message",
    );
    if (!messageItem) {
      log.warn("chips_llm.no_message", {});
      return [];
    }

    const text = extractTextFromMessage(messageItem);
    if (!text) {
      log.warn("chips_llm.empty_text", {});
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      log.warn("chips_llm.parse_error", { preview: text.slice(0, 80) });
      return [];
    }

    const chipsRaw =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { chips?: unknown }).chips)
        ? ((parsed as { chips: unknown[] }).chips)
        : [];

    // Defense-in-depth: filter chip có iconName/tone ngoài whitelist.
    const valid: ChipItem[] = [];
    for (const c of chipsRaw) {
      if (!c || typeof c !== "object") continue;
      const obj = c as { prompt?: unknown; iconName?: unknown; tone?: unknown };
      if (typeof obj.prompt !== "string" || obj.prompt.trim().length === 0) continue;
      if (typeof obj.iconName !== "string" || !ICON_SET.has(obj.iconName)) continue;
      if (typeof obj.tone !== "string" || !TONE_SET.has(obj.tone)) continue;
      valid.push({
        prompt: obj.prompt,
        iconName: obj.iconName as IconName,
        tone: obj.tone as Tone,
      });
    }

    return valid.slice(0, 6);
  } catch (err) {
    log.warn("chips_llm.failed", { err: String(err).slice(0, 120) });
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
