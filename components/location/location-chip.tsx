"use client";

import { MapPin } from "lucide-react";
import { useActiveLocation } from "@/hooks/use-active-location";
import { cn } from "@/lib/utils";

interface LocationChipProps {
  onClick?: () => void;
  className?: string;
}

/**
 * Pill-shape location selector. Shows current location label or prompt.
 * States:
 *  - requesting: pulse ring quanh icon, text animate-pulse.
 *  - ready/empty: solid pill với icon primary, rõ tap target.
 */
export function LocationChip({ onClick, className }: LocationChipProps) {
  const { location, status } = useActiveLocation();

  const label =
    status === "requesting"
      ? "Đang định vị…"
      : location?.label ?? "Chọn địa điểm";

  const isRequesting = status === "requesting";
  const isEmpty = !location?.label && !isRequesting;

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={`Vị trí hiện tại: ${label}`}
      className={cn(
        // Touch target 44 min (inner 40 visual + pill)
        "group inline-flex min-h-[40px] items-center gap-2 rounded-full px-3 py-2",
        "text-sm font-medium transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-95",
        isEmpty
          ? "border border-dashed border-border bg-background text-muted-foreground hover:bg-muted"
          : "border border-primary/20 bg-primary/8 text-foreground hover:bg-primary/12 hover:border-primary/30",
        isRequesting && "animate-pulse",
        className,
      )}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <MapPin
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isEmpty ? "text-muted-foreground" : "text-primary",
          )}
          aria-hidden="true"
        />
        {isRequesting && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full ring-2 ring-primary/40 animate-ping"
          />
        )}
      </span>
      <span className="max-w-[180px] truncate sm:max-w-[260px]">{label}</span>
    </button>
  );
}
