import "server-only";
import { redis } from "@/lib/redis";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { UpstreamError, BudgetExceededError } from "@/lib/tools/errors";

// $0.02 per call (conservative ceiling over Google's $0.017 Text Search rate).
export const maxCallsForBudget = Math.floor(env.PLACES_DAILY_BUDGET_USD / 0.02);

function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `places:budget:${yyyy}${mm}${dd}`;
}

/**
 * Fire-and-forget: POST a Slack/Discord-compatible webhook alert.
 * Skips silently if url is falsy.
 */
function postBudgetAlert(url: string | undefined, count: number, max: number): void {
  if (!url) return;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `⚠️ Places budget 80% — ${count}/${max} today`,
    }),
  }).catch((err: unknown) => {
    // Alert failure must never surface to callers.
    log.warn("budget_alert.fail", { err: String(err) });
  });
}

/**
 * Atomically increments the daily Places API call counter.
 * Fires an 80%-threshold webhook alert on first crossing (fire-and-forget).
 * Throws BudgetExceededError when count > maxCallsForBudget.
 * Throws UpstreamError when Redis is unavailable (fail-closed).
 */
export async function checkAndIncrementBudget(): Promise<{ count: number; maxCalls: number }> {
  const budgetKey = getTodayKey();
  let count: number;

  try {
    count = await redis.incr(budgetKey);
    // Set 48-hour expiry on first increment of the day (idempotent after that).
    if (count === 1) {
      await redis.expire(budgetKey, 172_800);
    }
  } catch (err) {
    throw new UpstreamError("Redis unavailable — cannot verify budget, aborting call", err);
  }

  // Alert exactly at the first crossing of the 80% threshold.
  const threshold80 = Math.floor(maxCallsForBudget * 0.8);
  if (count === threshold80) {
    log.warn("places.budget_80pct", { count, maxCallsForBudget });
    postBudgetAlert(env.ALERT_WEBHOOK_URL, count, maxCallsForBudget);
  }

  if (count > maxCallsForBudget) {
    log.warn("places.budget_block", { count, maxCallsForBudget });
    throw new BudgetExceededError(
      `Daily Places API budget exceeded (${count}/${maxCallsForBudget} calls)`,
    );
  }

  return { count, maxCalls: maxCallsForBudget };
}
