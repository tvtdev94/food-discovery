"use client";

import { cn } from "@/lib/utils";

interface ChatShellProps {
  header: React.ReactNode;
  children: React.ReactNode;
  /** Sticky composer / bar. Pass null to skip entirely (e.g. empty state
   *  with inline composer trong hero). */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Full-viewport flex-column shell cho chat page.
 * - Sticky header + footer với glass backdrop-blur cho feel "nổi" trên chat area.
 * - Safari cũ không support backdrop-filter → fallback opaque background.
 * - Safe area padding cho iOS notch + home indicator.
 */
export function ChatShell({ header, children, footer, className }: ChatShellProps) {
  const glassBase =
    "bg-background/75 backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-background";

  return (
    <div className={cn("relative flex h-dvh flex-col overflow-hidden bg-background", className)}>
      {/* Sticky glass header */}
      <div
        className={cn(
          "sticky top-0 z-30 flex-none pt-safe border-b border-border/50",
          glassBase,
        )}
      >
        {header}
      </div>

      {/*
        Scroll is owned by children (MessageList). `main` itself doesn't scroll
        to avoid nested scroll regions — but EmptyHero (short) also renders here
        and needs overflow available for edge-case long content.
      */}
      <main className="flex-1 overflow-y-auto scroll-smooth">{children}</main>

      {/* Sticky glass composer footer — optional */}
      {footer && (
        <div
          className={cn(
            "sticky bottom-0 z-30 flex-none pb-safe border-t border-border/50",
            glassBase,
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
