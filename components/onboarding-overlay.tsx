"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Soup, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "onboarded";

interface Step {
  heading: string;
  body: string;
  Icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  {
    heading: "Chào bạn!",
    body: "Mình là ĂnGì — food-buddy gợi ý quán gần bạn.",
    Icon: Sparkles,
  },
  {
    heading: "Cứ nói cảm xúc",
    body: "Hoặc thứ bạn thèm. VD: 'mưa lạnh muốn ăn nóng'",
    Icon: Soup,
  },
  {
    heading: "Mở Google Maps ngay",
    body: "Chọn quán xong, tap 'Mở Google Maps' để chỉ đường.",
    Icon: MapPin,
  },
];

/**
 * 3-step onboarding overlay — first-visit only.
 * - Icon tile gradient + title + body.
 * - Progress pill: active step stretches to w-6, others stay dots.
 * - Pop entrance animation + focus trap + ESC dismiss.
 * - localStorage persistence under "onboarded".
 */
export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage unavailable (private mode) — skip overlay silently.
    }
  }, []);

  useEffect(() => {
    if (visible) {
      primaryBtnRef.current?.focus();
    }
  }, [visible, step]);

  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (e.key !== "Tab") return;

      const el = overlayRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Non-fatal.
    }
    setVisible(false);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const CurrentIcon = current.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      aria-hidden="false"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-heading"
        aria-describedby="onboarding-body"
        className="flex w-full max-w-sm flex-col gap-5 rounded-3xl bg-card p-6 shadow-soft-lg animate-pop"
      >
        {/* Icon tile */}
        <div
          aria-hidden="true"
          className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15"
        >
          <CurrentIcon className="h-10 w-10 text-primary" />
        </div>

        {/* Content */}
        <div className="text-center">
          <h2
            id="onboarding-heading"
            className="font-display text-xl font-semibold text-foreground"
          >
            {current.heading}
          </h2>
          <p id="onboarding-body" className="mt-1.5 text-sm text-muted-foreground">
            {current.body}
          </p>
        </div>

        {/* Progress pills */}
        <div
          className="flex justify-center gap-1.5"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label="Tiến trình onboarding"
        >
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted",
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!isLast && (
            <Button variant="ghost" size="default" className="flex-1" onClick={dismiss}>
              Bỏ qua
            </Button>
          )}
          <Button
            ref={primaryBtnRef}
            size="default"
            className="flex-1 shadow-soft hover:shadow-soft-lg"
            onClick={handleNext}
          >
            {isLast ? "Bắt đầu" : "Tiếp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
