import "server-only";
import { findPlaces } from "@/lib/tools/places";
import { ruleFilter, filterByDistance } from "@/lib/tools/rule-filter";
import { log } from "@/lib/logger";
import type { Place } from "@/lib/tools/types";

interface ToolCallLog {
  name: string;
  arguments: string;
  result: unknown;
}

interface ExpandSearchParams {
  toolCalls: ToolCallLog[];
  userLat: number;
  userLng: number;
  onEvent: (event: string, data: unknown) => void;
}

interface ExpandSearchResult {
  places: Place[];
  /** true khi đã tăng bán kính / nới ngưỡng — UX có thể nhấn mạnh lý do. */
  wasExpanded: boolean;
}

const RELAXED_OPTS = { minRating: 3.0, minReviews: 1 };
const STAGE_1_MAX_KM = 25; // relax filter + relax distance ~thành phố nhỏ
const STAGE_2_MAX_KM = 50; // re-fetch radius 5km, allow up to 50km tỉnh lân cận
const MAX_RADIUS_M = 5000;

/**
 * Cứu vớt khi Pass 1 + ruleFilter (distance-strict 10km) ra 0 quán.
 *
 * Bậc 1 (free): relax rating + reviews + nới distance lên 25km (thành phố nhỏ).
 *   Không tốn API call.
 * Bậc 2 (1 API call): re-fetch find_places radius 5km (max của Places API),
 *   filter relaxed + distance ≤ 50km (tỉnh lân cận).
 *
 * Trả `wasExpanded=true` khi cứu vớt thành công → caller (runner) plumb xuống
 * text-stream để LLM báo user "mình tìm xa hơn xíu...".
 */
export async function expandSearch(params: ExpandSearchParams): Promise<ExpandSearchResult> {
  const { toolCalls, userLat, userLng, onEvent } = params;

  const lastCall = [...toolCalls].reverse().find((tc) => tc.name === "find_places");
  if (!lastCall) return { places: [], wasExpanded: false };

  let args: { query: string; lat: number; lng: number; radius_m?: number };
  try {
    args = JSON.parse(lastCall.arguments) as typeof args;
  } catch {
    return { places: [], wasExpanded: false };
  }

  // Stage 1: relax filter + nới distance trên data đã có.
  const rawFromResult = (lastCall.result as { places?: Place[] }).places ?? [];
  const relaxed = ruleFilter(rawFromResult, RELAXED_OPTS);
  const nearStage1 = filterByDistance(relaxed, userLat, userLng, STAGE_1_MAX_KM);
  if (nearStage1.length > 0) {
    log.info("expand.stage1_relax_ok", { count: nearStage1.length, max_km: STAGE_1_MAX_KM });
    onEvent("search_expanded", { stage: "relaxed", maxKm: STAGE_1_MAX_KM });
    return { places: nearStage1, wasExpanded: true };
  }

  // Stage 2: re-search với radius lớn hơn (nếu chưa max).
  const currentRadius = args.radius_m ?? 2000;
  if (currentRadius >= MAX_RADIUS_M) {
    log.info("expand.stage2_skip_max", { radius_m: currentRadius });
    return { places: [], wasExpanded: false };
  }

  log.info("expand.stage2_searching", {
    query: args.query,
    from_radius_m: currentRadius,
    to_radius_m: MAX_RADIUS_M,
  });
  onEvent("search_expanded", { stage: "wider", radius_m: MAX_RADIUS_M, maxKm: STAGE_2_MAX_KM });

  try {
    const wider = await findPlaces({
      query: args.query,
      lat: args.lat,
      lng: args.lng,
      radiusM: MAX_RADIUS_M,
    });
    const widerFiltered = ruleFilter(wider, RELAXED_OPTS);
    const nearStage2 = filterByDistance(widerFiltered, userLat, userLng, STAGE_2_MAX_KM);
    log.info("expand.stage2_done", {
      raw: wider.length,
      filtered: widerFiltered.length,
      near: nearStage2.length,
    });
    return { places: nearStage2, wasExpanded: nearStage2.length > 0 };
  } catch (err) {
    log.warn("expand.stage2_failed", { err: String(err) });
    return { places: [], wasExpanded: false };
  }
}
