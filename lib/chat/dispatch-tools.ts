import "server-only";
import { getWeather } from "@/lib/tools/weather";
import { findPlaces } from "@/lib/tools/places";
import { BudgetExceededError } from "@/lib/tools/errors";
import { log } from "@/lib/logger";
import { z } from "zod";

// --- Argument schemas for each tool ---

const GetWeatherArgs = z.object({
  lat: z.number(),
  lng: z.number(),
});

const FindPlacesArgs = z.object({
  query: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().int().min(300).max(5000).default(2000),
  open_now: z.boolean().optional(),
  max_price: z.number().int().min(1).max(4).optional(),
});

type ToolResult = Record<string, unknown>;

/**
 * Dispatches a single tool call by name with the provided raw arguments.
 * Returns a JSON-stringifiable result object.
 * BudgetExceededError is caught and returned as { error: "budget_exceeded" }
 * so the model can decide how to respond — never re-thrown.
 * All other errors propagate to the caller.
 */
export async function dispatchTool(
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const t0 = Date.now();

  // Parse args — treat rawArgs as a JSON string or already-parsed object.
  const parsed: unknown =
    typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;

  try {
    log.info("tool.start", { name });

    let result: ToolResult;

    if (name === "get_weather") {
      const args = GetWeatherArgs.parse(parsed);
      const weather = await getWeather(args.lat, args.lng);
      result = weather as unknown as ToolResult;
    } else if (name === "find_places") {
      const args = FindPlacesArgs.parse(parsed);
      const places = await findPlaces({
        query: args.query,
        lat: args.lat,
        lng: args.lng,
        radiusM: args.radius_m,
        openNow: args.open_now,
        maxPrice: args.max_price,
      });
      // Return array under a "places" key so model can index it.
      result = { places };
    } else {
      log.warn("tool.unknown", { name });
      result = { error: "unknown_tool", name };
    }

    const ms = Date.now() - t0;
    log.info("tool.end", { name, ms });
    return result;
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      const ms = Date.now() - t0;
      log.warn("tool.budget_exceeded", { name, ms });
      // Return soft error — let model decide how to handle.
      return { error: "budget_exceeded" };
    }
    // All other errors (UpstreamError, RateLimitError, ZodError) re-thrown.
    throw err;
  }
}
