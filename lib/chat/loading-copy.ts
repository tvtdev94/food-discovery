/**
 * Pool VI strings + helpers cho UI loading storytelling.
 *
 * Pure module — không I/O, không React. Tests cover deterministic indexing
 * + diacritic sanity. Re-used bởi:
 *  - ProgressPill (ticker rotate)
 *  - LoadingChecklist (step state mapping)
 *  - RestaurantCardSkeleton (fake quán name flicker)
 */

import type { MessagePhase } from "@/hooks/use-chat-stream";

// ---------------------------------------------------------------------------
// Ticker pools — Gen-Z VN tone, hài thân thiện. Rotate mỗi 1.8s trong pill.
// ---------------------------------------------------------------------------

type TickerPhase = Exclude<MessagePhase, "done">;

export const TICKER_POOLS: Readonly<Record<TickerPhase, readonly string[]>> = {
  thinking: [
    "💭 Để mình suy nghĩ chút...",
    "🤔 Đang nhẩm tâm trạng bạn...",
    "✨ Não đang chạy 100km/h...",
  ],
  searching: [
    "🔍 Đang lùng quán quanh đây...",
    "👀 Ngó từng góc hẻm...",
    "📍 Soi map xem chỗ nào ngon...",
    "🍜 Đếm review xem quán nào hot...",
  ],
  composing: [
    "✨ Đang chốt quán hợp gu...",
    "🎯 Match vibe cho bạn...",
    "💖 Chọn vài viên ngọc...",
  ],
};

/**
 * Pick 1 phrase từ pool theo phase + index. Index wraps modulo pool length.
 * Trả empty string khi phase = "done" (caller should hide pill before reaching).
 */
export function pickTickerPhrase(phase: MessagePhase, index: number): string {
  if (phase === "done") return "";
  const pool = TICKER_POOLS[phase];
  if (pool.length === 0) return "";
  const safeIndex = ((index % pool.length) + pool.length) % pool.length;
  return pool[safeIndex];
}

// ---------------------------------------------------------------------------
// Checklist — 3 step indicators dưới pill, derive state từ phase.
// ---------------------------------------------------------------------------

export type ChecklistStepState = "pending" | "active" | "done";

export interface ChecklistStep {
  readonly key: string;
  readonly label: string;
  readonly emojiPending: string;
  readonly emojiActive: string;
  readonly emojiDone: string;
}

export const CHECKLIST_STEPS: ReadonlyArray<ChecklistStep> = [
  {
    key: "search",
    label: "Quét quán quanh khu",
    emojiPending: "⏳",
    emojiActive: "🗺️",
    emojiDone: "✅",
  },
  {
    key: "compose",
    label: "Chấm điểm theo gu bạn",
    emojiPending: "⏳",
    emojiActive: "🎯",
    emojiDone: "✅",
  },
];

/**
 * Mapping phase → state cho 2-step checklist.
 *
 * Bỏ step "Tìm vị trí" — user đã cấp location trước khi gửi (composer disable
 * khi `!locationArg`), nên step đó luôn đã done sẵn → noise/misleading.
 *
 * - thinking + searching: step 0 (Lùng quán) active
 * - composing:            step 0 done, step 1 (Chọn quán) active
 * - done:                 cả 2 done (caller hides checklist trước đó thường)
 */
export function getChecklistState(
  phase: MessagePhase,
  stepIndex: number,
): ChecklistStepState {
  if (stepIndex < 0 || stepIndex > 1) return "pending";
  switch (phase) {
    case "thinking":
    case "searching":
      return stepIndex === 0 ? "active" : "pending";
    case "composing":
      return stepIndex === 0 ? "done" : "active";
    case "done":
      return "done";
  }
}

// ---------------------------------------------------------------------------
// Fake quán names — placeholder text trong skeleton card (atmospheric).
// ---------------------------------------------------------------------------

export const FAKE_QUAN_NAMES: readonly string[] = [
  "Quán Cô Ba",
  "Phở Hùng Vương",
  "Bánh Mì Sài Gòn",
  "Cà Phê Cô Bảy",
  "Bún Đậu Hà Nội",
  "Cơm Tấm Sườn Bì",
];

/** Pick 1 fake name. Index wraps modulo pool length. */
export function pickFakeQuanName(index: number): string {
  const len = FAKE_QUAN_NAMES.length;
  if (len === 0) return "";
  const safeIndex = ((index % len) + len) % len;
  return FAKE_QUAN_NAMES[safeIndex];
}
