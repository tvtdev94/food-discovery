import "server-only";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageRow {
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  places_calls: number | null;
  cache_hits: number | null;
  error_code: string | null;
}

interface StatsResponse {
  window: "24h";
  turns: number;
  avg_tokens: number;
  p50_ms: number;
  p95_ms: number;
  places_calls: number;
  cache_hits: number;
  cache_hit_rate: number;
  errors: {
    count: number;
    byCode: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the nth percentile of a pre-sorted numeric array (0-indexed). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  // --- Auth ---
  const adminKey = req.headers.get("x-admin-key");
  if (!adminKey || adminKey !== env.ADMIN_KEY) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // --- Query last 24 h from usage_log ---
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin()
    .from("usage_log")
    .select(
      "input_tokens, output_tokens, duration_ms, places_calls, cache_hits, error_code",
    )
    .gte("ts", since);

  if (error) {
    log.error("admin.stats.query_error", { err: error.message });
    return Response.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as UsageRow[];
  const turns = rows.length;

  // --- Aggregate in memory ---
  let totalTokens = 0;
  let totalPlacesCalls = 0;
  let totalCacheHits = 0;
  const durations: number[] = [];
  const errorCounts: Record<string, number> = {};

  for (const r of rows) {
    totalTokens += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
    totalPlacesCalls += r.places_calls ?? 0;
    totalCacheHits += r.cache_hits ?? 0;

    const ms = r.duration_ms ?? 0;
    if (ms > 0) durations.push(ms);

    if (r.error_code) {
      errorCounts[r.error_code] = (errorCounts[r.error_code] ?? 0) + 1;
    }
  }

  durations.sort((a, b) => a - b);
  const totalErrors = Object.values(errorCounts).reduce((s, n) => s + n, 0);
  const denominator = totalCacheHits + totalPlacesCalls;

  const stats: StatsResponse = {
    window: "24h",
    turns,
    avg_tokens: turns > 0 ? Math.round(totalTokens / turns) : 0,
    p50_ms: percentile(durations, 50),
    p95_ms: percentile(durations, 95),
    places_calls: totalPlacesCalls,
    cache_hits: totalCacheHits,
    cache_hit_rate: denominator > 0 ? totalCacheHits / denominator : 0,
    errors: {
      count: totalErrors,
      byCode: errorCounts,
    },
  };

  return Response.json(stats);
}
