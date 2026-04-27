import "server-only";

/**
 * Build danh sách query để pre-warm SearchApi cache theo giờ trong ngày VN.
 *
 * Mục tiêu: khi user mở app + location ready, server fire các query phổ biến
 * theo thời điểm hiện tại → cache hot. Khi user thực sự gửi câu hỏi và LLM
 * Pass-1 chọn 1 trong các query đó → dispatchTool hit cache instant
 * (tiết kiệm ~500-1500ms SearchApi roundtrip).
 *
 * Buckets phân theo nhịp ăn của VN (giờ VN, UTC+7, không DST):
 *  - 5h-10h:  bữa sáng
 *  - 10h-14h: bữa trưa
 *  - 14h-18h: chiều / vặt
 *  - 18h-23h: bữa tối
 *  - 23h-5h:  khuya
 *
 * Mỗi bucket + 1 evergreen "quán ăn ngon" (luôn applicable).
 *
 * Quan trọng: dùng `getVnHour` thay vì `Date.getHours()` để buckets ổn định
 * dù server deploy ở region nào (Vercel global edge, US, EU…).
 */

const EVERGREEN_QUERY = "quán ăn ngon";
const VN_OFFSET_HOURS = 7;

/** Pure helper — convert any Date to VN local hour (0-23). VN = UTC+7, no DST. */
export function getVnHour(now: Date): number {
  return (now.getUTCHours() + VN_OFFSET_HOURS) % 24;
}

export function getDefaultPrewarmQueries(now: Date): string[] {
  const h = getVnHour(now);
  let bucket: string[];
  if (h >= 5 && h < 10) bucket = ["quán phở", "cà phê sáng", "bún", "xôi"];
  else if (h >= 10 && h < 14) bucket = ["cơm trưa", "quán ăn", "phở", "bún"];
  else if (h >= 14 && h < 18) bucket = ["cà phê", "trà sữa", "ăn vặt", "bánh"];
  else if (h >= 18 && h < 23) bucket = ["quán ăn tối", "lẩu", "nướng", "phở"];
  else bucket = ["quán ăn khuya", "mì cay", "phở", "cháo"];
  // Set dedupe — evergreen có thể trùng với bucket trong tương lai.
  return Array.from(new Set([...bucket, EVERGREEN_QUERY]));
}
