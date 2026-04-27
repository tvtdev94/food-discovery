import "server-only";
import { findPlaces } from "@/lib/tools/places";
import { getDefaultPrewarmQueries } from "@/lib/chat/prewarm-cache";
import { log } from "@/lib/logger";

/**
 * Speculative parallel SearchApi fetch.
 *
 * Khi vào `runChatTurn`, kick `findPlaces` song song với Pass-1 LLM call.
 * Khi LLM ra args và Pass-1 dispatchTool gọi `find_places`, cache key trùng
 * → hit instant (~10ms thay vì 500-1500ms).
 *
 * Cache key match: phải pin `radiusM=2000` (matches `FindPlacesArgs.radius_m
 * .default(2000)` trong dispatch-tools.ts), không truyền openNow/maxPrice
 * (LLM mặc định cũng không truyền) → cache key match LLM call mặc định.
 *
 * Worst case: LLM ra query khác heuristic → cache miss như cũ. Speculative
 * vẫn warm cho future turn. KHÔNG bao giờ tệ hơn baseline.
 */

const CUISINE_KEYWORDS = [
  "phở",
  "bún",
  "cơm",
  "mì",
  "cháo",
  "xôi",
  "bánh mì",
  "bánh",
  "lẩu",
  "nướng",
  "hủ tiếu",
  "cà phê",
  "trà sữa",
  "kem",
  "gỏi",
  "chè",
];

const SPEC_RADIUS_M = 2000;

/** Pure heuristic — no I/O. Build 1 best-guess query from user msg + time-of-day. */
export function heuristicQuery(userMessage: string, now: Date): string {
  const m = userMessage.toLowerCase();
  for (const kw of CUISINE_KEYWORDS) {
    if (m.includes(kw)) return kw;
  }
  // No cuisine keyword hit → use first time-bucket query (highest-rank).
  return getDefaultPrewarmQueries(now)[0];
}

interface SpecParams {
  userMessage: string;
  lat: number;
  lng: number;
  now?: Date;
}

/**
 * Fires findPlaces in parallel with Pass-1 LLM, warming cacheThrough so that
 * if the LLM picks the same query, dispatchTool finds it cached instantly.
 *
 * Errors are swallowed — never blocks main flow. Returns void.
 */
export async function speculativeFindPlaces(p: SpecParams): Promise<void> {
  const query = heuristicQuery(p.userMessage, p.now ?? new Date());
  try {
    await findPlaces({ query, lat: p.lat, lng: p.lng, radiusM: SPEC_RADIUS_M });
    log.info("spec.warmed", { query });
  } catch (err) {
    log.warn("spec.failed", { err: String(err).slice(0, 120) });
  }
}
