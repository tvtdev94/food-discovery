"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ConversationListItemProps {
  id: string;
  title: string;
  activeLocation?: { label?: string } | null;
  updatedAt: string;
  onClick: (id: string) => void;
}

/** Vietnamese relative time — "Vừa xong" / "3 phút trước" / "2 giờ trước" / … */
function relativeTimeVi(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Vừa xong";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} tháng trước`;
  return `${Math.floor(diffMonth / 12)} năm trước`;
}

/**
 * Single conversation row. Gradient accent strip bên trái tô màu brand —
 * pair với location pill và relative time trong body.
 */
export function ConversationListItem({
  id,
  title,
  activeLocation,
  updatedAt,
  onClick,
}: ConversationListItemProps) {
  const locationLabel =
    activeLocation && typeof activeLocation === "object"
      ? (activeLocation as { label?: string }).label
      : null;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-soft-sm transition-shadow hover:shadow-soft">
      <button
        type="button"
        onClick={() => onClick(id)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-3 text-left",
          "transition-colors active:bg-accent/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        {/* Accent strip */}
        <span
          aria-hidden="true"
          className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary to-primary-glow"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {locationLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-blue-900">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                <span className="max-w-[140px] truncate">{locationLabel}</span>
              </span>
            )}
            <span>{relativeTimeVi(updatedAt)}</span>
          </div>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </Card>
  );
}
