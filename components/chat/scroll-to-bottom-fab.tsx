"use client";

import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollToBottomFabProps {
  show: boolean;
  onClick: () => void;
}

/**
 * Floating-action button về cuối cuộc trò chuyện.
 * Ẩn khi user đang ở gần cuối (show=false) với fade-down transition.
 * Position fixed phía trên composer — bottom-24 chừa chỗ cho sticky footer.
 */
export function ScrollToBottomFab({ show, onClick }: ScrollToBottomFabProps) {
  return (
    <button
      type="button"
      aria-label="Về cuối cuộc trò chuyện"
      onClick={onClick}
      tabIndex={show ? 0 : -1}
      className={cn(
        "fixed bottom-24 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full",
        "border border-border/60 bg-card text-foreground shadow-soft-lg",
        "transition-all duration-200",
        "hover:bg-muted active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        show ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowDown className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
