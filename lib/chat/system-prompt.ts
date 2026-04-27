import "server-only";
import type { Weather } from "@/lib/tools/types";

interface SystemPromptCtx {
  activeLocation: { lat: number; lng: number; label: string };
  weather: Weather;
  userContext: Record<string, unknown>;
  nowIso: string;
}

function summariseWeather(w: Weather): string {
  const parts: string[] = [];
  parts.push(`${Math.round(w.tempC)}°C`);
  const condMap: Record<string, string> = {
    clear: "trời quang",
    cloudy: "nhiều mây",
    fog: "có sương mù",
    drizzle: "mưa phùn",
    rain: "đang mưa",
    "rain-showers": "mưa rào",
    snow: "có tuyết",
    thunderstorm: "giông bão",
    unknown: "không rõ",
  };
  parts.push(condMap[w.condition] ?? w.condition);
  if (w.rainProbPct > 0) parts.push(`xác suất mưa ${w.rainProbPct}%`);
  parts.push(w.isDay ? "ban ngày" : "ban đêm/khuya");
  return parts.join(", ");
}

function buildWeatherRules(w: Weather, localHour: number): string {
  const rules: string[] = [];

  if (w.rainProbPct > 60 || w.condition === "rain" || w.condition === "drizzle" || w.condition === "rain-showers") {
    rules.push("Trời mưa → ưu tiên món nóng, ấm lòng: phở, bún bò, lẩu, cháo, hủ tiếu. Ưu tiên quán có mái che/trong nhà.");
  }
  if (w.tempC >= 32) {
    rules.push("Nắng nóng > 32°C → ưu tiên món mát: chè, bún cá, gỏi, sinh tố, kem, cơm hến.");
  }
  if (w.condition === "thunderstorm") {
    rules.push("Giông bão → khuyên quán gần, trong nhà. Tránh xa hàng vỉa hè.");
  }
  if (localHour >= 21 || localHour < 5) {
    rules.push("Buổi khuya (21h–5h) → ưu tiên quán đang mở (open_now=true). Gợi ý thêm quán nhậu, bánh mì đêm, cháo khuya.");
  }

  if (rules.length === 0) {
    rules.push("Thời tiết ổn, không có ưu tiên đặc biệt — theo sở thích user.");
  }

  return rules.map((r) => `- ${r}`).join("\n");
}

function buildUserContextBlob(ctx: Record<string, unknown>): string {
  if (Object.keys(ctx).length === 0) return "";

  const lines: string[] = ["Sở thích & yêu cầu user:"];
  if (Array.isArray(ctx.dietary) && ctx.dietary.length > 0) {
    lines.push(`- Chế độ ăn: ${(ctx.dietary as string[]).join(", ")}`);
  }
  if (Array.isArray(ctx.dislikes) && ctx.dislikes.length > 0) {
    lines.push(`- Không thích/dị ứng: ${(ctx.dislikes as string[]).join(", ")} — TUYỆT ĐỐI không recommend.`);
  }
  if (ctx.budget_hint) {
    lines.push(`- Ngân sách: ${String(ctx.budget_hint)}`);
  }
  if (ctx.mood) {
    lines.push(`- Tâm trạng: ${String(ctx.mood)}`);
  }
  if (ctx.group_size) {
    lines.push(`- Nhóm: ${String(ctx.group_size)} người`);
  }
  return lines.join("\n");
}

/**
 * Builds the Vietnamese food-buddy "ĂnGì" system prompt.
 * Injects live weather, time, location, weather rules, and user context.
 */
export function buildSystemPrompt(ctx: SystemPromptCtx): string {
  const { activeLocation, weather, userContext, nowIso } = ctx;

  // Parse local hour from ISO string (server passes local time ISO).
  const localHour = new Date(nowIso).getHours();

  const weatherSummary = summariseWeather(weather);
  const weatherRules = buildWeatherRules(weather, localHour);
  const userCtxBlob = buildUserContextBlob(userContext);

  return `Bạn là ĂnGì — food buddy vui tính, thân thiện của người Việt. Bạn hiểu ẩm thực VN từ Bắc vào Nam, biết đọc thời tiết và đề xuất món hợp tâm trạng.

## Thông tin hiện tại
- Vị trí: ${activeLocation.label} (${activeLocation.lat.toFixed(4)}, ${activeLocation.lng.toFixed(4)})
- Thời gian: ${nowIso}
- Thời tiết: ${weatherSummary}

## Quy tắc thời tiết (soft — user preference luôn thắng)
${weatherRules}

## Format trả lời
- Ngắn gọn: ≤4 câu cho assistant_message
- Emoji tiết chế: ≤2 emoji mỗi tin
- Không dùng markdown heading (##, **)
- Ngôn ngữ: tiếng Việt là mặc định, mirror theo ngôn ngữ user nếu họ dùng EN
- Không joke/trêu về sức khoẻ, dị ứng, ăn kiêng — đây là vấn đề nghiêm túc
- Không tiết lộ cơ chế nội bộ (tools, model, API)

## Guardrails quan trọng
- CHỈ recommend quán từ danh sách candidates tôi cung cấp ở pass 2 — không bịa tên quán
- Nếu danh sách trống → xin lỗi nhẹ nhàng + gợi đổi bán kính hoặc từ khoá
- Không recommend quán khi thiếu thông tin địa chỉ rõ ràng

${userCtxBlob ? userCtxBlob + "\n" : ""}Dùng tools khi cần dữ liệu thời tiết/quán ăn mới.`.trim();
}
