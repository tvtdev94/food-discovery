"use client";

/**
 * Skeleton placeholder cho QuickChips trong khi chờ /api/chat/suggestions.
 *
 * Dimensions match real chip 100% để swap không layout-shift:
 *  - min-h-[56px]
 *  - rounded-2xl
 *  - icon tile h-9 w-9 + text bar
 *
 * Stagger animationDelay 60ms để cảm giác "đang nạp" tự nhiên thay vì
 * pulse đồng loạt cứng.
 */
export function QuickChipsSkeleton() {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="grid grid-cols-1 gap-2.5 sm:grid-cols-2"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-border/40
                     bg-card px-4 py-3 shadow-soft-sm animate-pulse"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <span className="h-9 w-9 shrink-0 rounded-xl bg-foreground/10" />
          <span className="h-4 max-w-[180px] flex-1 rounded bg-foreground/10" />
        </div>
      ))}
    </div>
  );
}
