import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/chat/runner/runner-openai-client", () => ({
  callResponsesCreate: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { callResponsesCreate } from "@/lib/chat/runner/runner-openai-client";
import { generateSuggestions } from "@/lib/chat/llm-suggestions";
import type { Weather } from "@/lib/tools/types";

function mkWeather(): Weather {
  return {
    tempC: 28,
    condition: "clear",
    rainProbPct: 0,
    isDay: true,
    ts: Date.now(),
  };
}

function mkResponse(text: string) {
  return {
    id: "resp_x",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

const baseParams = {
  lat: 10.77,
  lng: 106.7,
  hourBucket: "lunch" as const,
  weatherKey: "mild" as const,
  weather: mkWeather(),
};

describe("generateSuggestions", () => {
  beforeEach(() => {
    vi.mocked(callResponsesCreate).mockReset();
  });

  it("returns 6 chips when LLM responds with valid schema", async () => {
    const validChips = Array.from({ length: 6 }, (_, i) => ({
      prompt: `Chip ${i + 1}`,
      iconName: "Sparkles",
      tone: "blue",
    }));
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse(JSON.stringify({ chips: validChips })),
    );

    const result = await generateSuggestions(baseParams);
    expect(result).toHaveLength(6);
    expect(result[0].prompt).toBe("Chip 1");
    expect(result[0].iconName).toBe("Sparkles");
    expect(result[0].tone).toBe("blue");
  });

  it("filters out chips with iconName outside whitelist (defense-in-depth)", async () => {
    const chips = [
      { prompt: "Valid 1", iconName: "Sun", tone: "amber" },
      { prompt: "Bad", iconName: "Banana", tone: "blue" },
      { prompt: "Valid 2", iconName: "Moon", tone: "purple" },
    ];
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse(JSON.stringify({ chips })),
    );

    const result = await generateSuggestions(baseParams);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.iconName)).toEqual(["Sun", "Moon"]);
  });

  it("filters out chips with tone outside whitelist", async () => {
    const chips = [
      { prompt: "Bad tone", iconName: "Coffee", tone: "neon" },
      { prompt: "OK", iconName: "Pizza", tone: "rose" },
    ];
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse(JSON.stringify({ chips })),
    );

    const result = await generateSuggestions(baseParams);
    expect(result).toHaveLength(1);
    expect(result[0].tone).toBe("rose");
  });

  it("returns [] when callResponsesCreate throws (silent fallback)", async () => {
    vi.mocked(callResponsesCreate).mockRejectedValueOnce(new Error("OpenAI down"));
    const result = await generateSuggestions(baseParams);
    expect(result).toEqual([]);
  });

  it("returns [] when output_text is malformed JSON", async () => {
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse("not-json{"),
    );
    const result = await generateSuggestions(baseParams);
    expect(result).toEqual([]);
  });

  it("slices to max 6 if LLM returns more (schema enforces 6, defense)", async () => {
    const chips = Array.from({ length: 8 }, (_, i) => ({
      prompt: `c${i}`,
      iconName: "Sparkles",
      tone: "blue",
    }));
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse(JSON.stringify({ chips })),
    );

    const result = await generateSuggestions(baseParams);
    expect(result).toHaveLength(6);
  });

  it("returns [] when chips field missing", async () => {
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(mkResponse("{}"));
    const result = await generateSuggestions(baseParams);
    expect(result).toEqual([]);
  });

  it("filters chips with empty prompt string", async () => {
    const chips = [
      { prompt: "", iconName: "Sun", tone: "amber" },
      { prompt: "  ", iconName: "Sun", tone: "amber" },
      { prompt: "OK", iconName: "Sun", tone: "amber" },
    ];
    vi.mocked(callResponsesCreate).mockResolvedValueOnce(
      mkResponse(JSON.stringify({ chips })),
    );
    const result = await generateSuggestions(baseParams);
    expect(result).toHaveLength(1);
    expect(result[0].prompt).toBe("OK");
  });
});
