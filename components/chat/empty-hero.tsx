"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Composer, type ComposerDisabledReason } from "@/components/chat/composer";
import { QuickChips } from "@/components/chat/quick-chips";
import {
  getTimeAwareGreeting,
  getRandomSubtitle,
  getRandomComposerPlaceholder,
  type Greeting,
} from "@/lib/greeting";

interface EmptyHeroProps {
  onSubmit: (text: string) => void;
  composerDisabled: boolean;
  composerDisabledReason?: ComposerDisabledReason;
}

// Default (deterministic) copy rendered on first paint to avoid hydration mismatch.
// Client-side useEffect then swaps in randomized variants.
const DEFAULT_GREETING: Greeting = { greeting: "Hôm nay bạn thèm gì?", emoji: "🍜" };
const DEFAULT_SUBTITLE = "Gõ thẳng, hoặc chọn một gợi ý bên dưới";
const DEFAULT_PLACEHOLDER = "Hôm nay bạn muốn ăn gì?";

/**
 * Empty state hero — input TOP để user tương tác ngay.
 * Layout: [bowl] → [greeting time-aware] → [composer inline] → [mood chips].
 * Greeting / subtitle / placeholder rotate randomly per mount (client-only).
 */
export function EmptyHero({ onSubmit, composerDisabled, composerDisabledReason }: EmptyHeroProps) {
  const [{ greeting, emoji }, setGreeting] = useState<Greeting>(DEFAULT_GREETING);
  const [subtitle, setSubtitle] = useState<string>(DEFAULT_SUBTITLE);
  const [placeholder, setPlaceholder] = useState<string>(DEFAULT_PLACEHOLDER);

  // Randomize after mount — avoids SSR/client hydration mismatch.
  useEffect(() => {
    setGreeting(getTimeAwareGreeting());
    setSubtitle(getRandomSubtitle());
    setPlaceholder(getRandomComposerPlaceholder());
  }, []);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex justify-center animate-fade-up">
        <SteamBowl />
      </div>

      <div className="text-center animate-fade-up" style={{ animationDelay: "60ms" }}>
        <p className="text-sm text-muted-foreground">
          {greeting} <span aria-hidden="true">{emoji}</span>
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">
          Hôm nay ăn gì?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <Composer
          onSubmit={onSubmit}
          disabled={composerDisabled}
          disabledReason={composerDisabledReason}
          variant="inline"
          placeholder={placeholder}
        />
      </div>

      <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
        <QuickChips onPick={onSubmit} />
      </div>
    </section>
  );
}

/**
 * Hero bowl — 3D-rendered phở bowl PNG với layered animations:
 *  - Glow halo radial gradient phía sau (animate-glow-pulse expand/fade)
 *  - Bowl float (animate-float bob lên-xuống + slight rotate)
 *  - Steam particles (3 dots breath stagger) phía trên
 *  - Drop-shadow soft tạo cảm giác lift khỏi bg
 *
 * Image priority cho LCP. Static asset 30KB compressed, không layout-shift.
 */
function SteamBowl() {
  return (
    <div className="relative h-32 w-32">
      {/* Glow halo phía sau bowl — radial gradient ấm, pulse expand */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-gradient-radial
                   from-primary/30 via-primary/10 to-transparent blur-xl
                   animate-glow-pulse"
        style={{
          background:
            "radial-gradient(circle at 50% 60%, hsl(var(--primary)/0.35) 0%, hsl(var(--primary)/0.12) 40%, transparent 70%)",
        }}
      />

      {/* Steam particles overlay — 3 dot breath stagger trên đầu bowl */}
      <span
        aria-hidden="true"
        className="absolute left-7 -top-1 h-2 w-2 rounded-full bg-primary/50 blur-[1px] animate-breath"
        style={{ animationDelay: "0ms" }}
      />
      <span
        aria-hidden="true"
        className="absolute left-14 -top-2 h-1.5 w-1.5 rounded-full bg-accent/60 blur-[1px] animate-breath"
        style={{ animationDelay: "500ms" }}
      />
      <span
        aria-hidden="true"
        className="absolute right-6 top-1 h-2 w-2 rounded-full bg-primary/40 blur-[1px] animate-breath"
        style={{ animationDelay: "1000ms" }}
      />

      {/* Bowl image — float + drop-shadow */}
      <Image
        src="/hero-bowl-3d.png"
        alt=""
        width={128}
        height={128}
        priority
        aria-hidden="true"
        className="relative h-full w-full object-contain animate-float
                   drop-shadow-[0_8px_16px_rgba(234,88,12,0.25)]"
      />
    </div>
  );
}
