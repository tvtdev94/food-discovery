"use client";

import { useEffect, useState } from "react";
import {
  CloudRain,
  Coffee,
  Flame,
  Leaf,
  Moon,
  Pizza,
  Sandwich,
  Soup,
  Sparkles,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import {
  useActiveLocation,
  getOrCreateDeviceId,
} from "@/hooks/use-active-location";
import { QuickChipsSkeleton } from "@/components/chat/quick-chips-skeleton";
import type { ChipItem, IconName, Tone } from "@/lib/chat/llm-suggestions";

interface QuickChipsProps {
  onPick: (text: string) => void;
}

// Static map LLM-returned `iconName` string → Lucide component. Hardcode 12
// imports — `lucide-react/dist/...` deep imports không stable, dynamic import
// thì over-engineering cho 12 icon nhỏ.
const ICON_MAP: Record<IconName, LucideIcon> = {
  CloudRain,
  Leaf,
  Moon,
  Sun,
  Users,
  Wallet,
  Coffee,
  Pizza,
  Sandwich,
  Soup,
  Flame,
  Sparkles,
};

// Static tone map — dynamic Tailwind class names bị purge nếu interpolated.
const TONE_CLASSES: Record<Tone, { iconBg: string; iconText: string }> = {
  blue: { iconBg: "bg-blue-100", iconText: "text-blue-600" },
  green: { iconBg: "bg-emerald-100", iconText: "text-emerald-600" },
  purple: { iconBg: "bg-purple-100", iconText: "text-purple-600" },
  amber: { iconBg: "bg-amber-100", iconText: "text-amber-600" },
  rose: { iconBg: "bg-rose-100", iconText: "text-rose-600" },
  pink: { iconBg: "bg-pink-100", iconText: "text-pink-600" },
};

interface FetchState {
  chips: ChipItem[];
  loading: boolean;
  failed: boolean;
}

const INITIAL_STATE: FetchState = { chips: [], loading: true, failed: false };

/**
 * LLM-generated mood picker chips.
 *
 * Lifecycle:
 *  - Mount → render skeleton (loading=true).
 *  - Khi `useActiveLocation.status === "ready"` → POST /api/chat/suggestions
 *    với {lat, lng}. Server cache 1h composite (location/hour/weather).
 *  - Response chips → swap real chips, fade-up stagger.
 *  - Lỗi / empty → render null (silent — composer + greeting vẫn dùng được).
 *
 * AbortController cleanup khi unmount hoặc location đổi.
 */
export function QuickChips({ onPick }: QuickChipsProps) {
  const location = useActiveLocation((s) => s.location);
  const status = useActiveLocation((s) => s.status);
  const [state, setState] = useState<FetchState>(INITIAL_STATE);

  useEffect(() => {
    if (status !== "ready" || !location) return;

    const ac = new AbortController();
    const deviceId = getOrCreateDeviceId();

    void (async () => {
      try {
        const res = await fetch("/api/chat/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-device-id": deviceId },
          body: JSON.stringify({ lat: location.lat, lng: location.lng }),
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { chips?: ChipItem[] };
        setState({
          chips: Array.isArray(data.chips) ? data.chips : [],
          loading: false,
          failed: false,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ chips: [], loading: false, failed: true });
      }
    })();

    return () => ac.abort();
    // Deps trên primitive lat/lng để label change (refresh reverse-geocode)
    // không trigger refetch — chips chỉ phụ thuộc tọa độ + status, không label.
  }, [status, location?.lat, location?.lng]);

  if (state.loading) return <QuickChipsSkeleton />;
  if (state.failed || state.chips.length === 0) return null;

  function handlePick(prompt: string) {
    hapticLight();
    onPick(prompt);
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {state.chips.map((chip, i) => {
        const Icon = ICON_MAP[chip.iconName] ?? Sparkles;
        const { iconBg, iconText } = TONE_CLASSES[chip.tone] ?? TONE_CLASSES.blue;
        return (
          <button
            key={`${chip.prompt}-${i}`}
            type="button"
            onClick={() => handlePick(chip.prompt)}
            className={cn(
              "group flex min-h-[56px] items-center gap-3 rounded-2xl",
              "border border-border/60 bg-card px-4 py-3 text-left",
              "shadow-soft-sm transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-soft hover:border-primary/20",
              "active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "animate-fade-up",
            )}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                iconBg,
              )}
            >
              <Icon className={cn("h-4 w-4", iconText)} aria-hidden="true" />
            </span>
            <span className="text-sm font-medium text-foreground">{chip.prompt}</span>
          </button>
        );
      })}
    </div>
  );
}
