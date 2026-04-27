"use client";

/**
 * Three-dot "food-buddy đang soạn tin" indicator.
 * - self-start + w-fit đảm bảo pill ôm sát content, không stretch full-width
 *   khi nằm trong flex-col parent.
 * - Bounce keyframe (pulse-dot trong tailwind.config) cho feel "sống động".
 */
export function TypingIndicator() {
  return (
    <div
      className="inline-flex w-fit items-center gap-1 self-start rounded-full bg-secondary px-2.5 py-1.5"
      role="status"
      aria-label="Đang soạn tin..."
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
        style={{ animationDelay: "180ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
        style={{ animationDelay: "360ms" }}
      />
    </div>
  );
}
