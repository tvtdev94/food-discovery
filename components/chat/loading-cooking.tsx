"use client";

import dynamic from "next/dynamic";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Lazy Lottie wrapper — cooking-pot stirrer spinner ở cuối ProgressPill.
 *
 * Lazy-loaded qua next/dynamic + ssr:false. Idle users (chat empty) KHÔNG pay
 * bundle cost — chunk fetch chỉ khi <LoadingCooking> mount lần đầu (streaming).
 *
 * Reduced-motion: render 🍜 emoji static thay Lottie (không load chunk).
 */

// next/dynamic + named export pattern — chunk tách khỏi initial bundle.
const DotLottieReact = dynamic(
  () => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact),
  {
    ssr: false,
    // Loading fallback giữ kích thước (h-5 w-5) để không layout-shift khi
    // chunk về. Render 1 dot pulse subtle.
    loading: () => (
      <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
      </span>
    ),
  },
);

interface LoadingCookingProps {
  size?: number;
  className?: string;
}

export function LoadingCooking({ size = 20, className }: LoadingCookingProps) {
  const reduce = usePrefersReducedMotion();

  // Reduced-motion: render nothing (no emoji fallback). Ticker text + checklist
  // bên ngoài đã đủ communicate loading; thêm icon static lại distracting.
  if (reduce) return null;

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, display: "inline-block" }}
    >
      <DotLottieReact
        src="/loading-cooking.lottie"
        loop
        autoplay
        style={{ width: size, height: size }}
      />
    </span>
  );
}
