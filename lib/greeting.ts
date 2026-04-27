/**
 * Time-aware greeting + subtitle + placeholder rotation.
 * Mỗi khung giờ có 3 câu, pick ngẫu nhiên lúc mount (client-only, tránh
 * hydration mismatch — gọi sau useEffect).
 */

export interface Greeting {
  greeting: string;
  emoji: string;
}

const MORNING: Greeting[] = [
  { greeting: "Chào buổi sáng",            emoji: "☕" },
  { greeting: "Sáng rồi, khỏe không?",     emoji: "🌞" },
  { greeting: "Dậy rồi đó hả",             emoji: "🥐" },
];
const NOON: Greeting[] = [
  { greeting: "Trưa rồi bạn ơi",           emoji: "🍜" },
  { greeting: "Đến giờ ăn trưa",           emoji: "🍱" },
  { greeting: "Bụng kêu rồi hả?",          emoji: "🥢" },
];
const AFTERNOON: Greeting[] = [
  { greeting: "Chiều nay thèm gì?",        emoji: "🧋" },
  { greeting: "Xế chiều, đói nhẹ?",        emoji: "🍩" },
  { greeting: "Làm chút gì cho đỡ lạt?",   emoji: "🍰" },
];
const EVENING: Greeting[] = [
  { greeting: "Tối rồi, đói chưa?",        emoji: "🍲" },
  { greeting: "Ăn tối thôi!",              emoji: "🍜" },
  { greeting: "Tối nay làm gì đây?",       emoji: "🍻" },
];
const LATE_NIGHT: Greeting[] = [
  { greeting: "Khuya mà vẫn thức?",        emoji: "🌙" },
  { greeting: "Đói khuya rồi phải không?", emoji: "🍳" },
  { greeting: "Mất ngủ vì đói hả?",        emoji: "🍢" },
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Returns a random greeting matching current hour. Boundaries: 5/11/14/18/23. */
export function getTimeAwareGreeting(now: Date = new Date()): Greeting {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return pickRandom(MORNING);
  if (hour >= 11 && hour < 14) return pickRandom(NOON);
  if (hour >= 14 && hour < 18) return pickRandom(AFTERNOON);
  if (hour >= 18 && hour < 23) return pickRandom(EVENING);
  return pickRandom(LATE_NIGHT);
}

/** Subtitle hint hiển thị dưới heading "Hôm nay ăn gì?" — soft + humorous. */
const SUBTITLES = [
  "Mưa, nắng, vui, buồn — mình hiểu hết",
  "Cứ kể mood, mình lo phần còn lại",
  "Nói 1 câu, mình gợi 5 quán gần bạn",
  "Thèm gì, hay đang ở mood nào? Kể đi",
  "Đói đến mức nào rồi? Kể mình nghe",
  "Gõ thẳng, hoặc chọn một gợi ý bên dưới",
  "Nghĩ gì cũng gõ — kể cả \"chả biết ăn gì\"",
  "Một dòng thôi, mình lo bản đồ + mood luôn",
] as const;

export function getRandomSubtitle(): string {
  return pickRandom(SUBTITLES);
}

/** Placeholder cho composer — variant mỗi lần mount cho đỡ nhàm. */
const COMPOSER_PLACEHOLDERS = [
  "Hôm nay bạn muốn ăn gì?",
  "Thèm gì, cứ kể…",
  "Đang ở mood nào vậy?",
  "Mô tả ngắn cũng được",
  "Món nào đang hấp dẫn bạn?",
] as const;

export function getRandomComposerPlaceholder(): string {
  return pickRandom(COMPOSER_PLACEHOLDERS);
}
