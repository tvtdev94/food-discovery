"use client";

import { useEffect, useState } from "react";
import { pickFakeQuanName } from "@/lib/chat/loading-copy";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/**
 * Shimmer placeholder cho RestaurantCard.
 *
 * Hiển thị từ event `places_filtered` đến khi `recs_delta` thật sự về.
 * Heights khớp real card (h-44 hero + ~84px body) → không layout-shift khi swap.
 *
 * Layer 4 storytelling: title bar overlay rotate fake quán names mỗi 1.2s
 * → cảm giác "đang sàng lọc danh sách". Caller pass `nameIndex` offset (vd `i`)
 * để cards stagger, không đồng bộ.
 *
 * Reduced-motion: 1 name static, không rotate.
 */
interface RestaurantCardSkeletonProps {
  /** Offset starting index để stagger giữa cards. Default 0. */
  nameIndex?: number;
}

export function RestaurantCardSkeleton({ nameIndex = 0 }: RestaurantCardSkeletonProps) {
  const reduce = usePrefersReducedMotion();
  const [index, setIndex] = useState(nameIndex);

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setIndex((i) => i + 1), 1200);
    return () => clearInterval(id);
  }, [reduce]);

  const fakeName = pickFakeQuanName(index);

  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft"
    >
      {/* Hero image placeholder */}
      <div className="h-44 w-full bg-foreground/10" />

      {/* Body */}
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {/* Title row — pulse bg + name overlay flicker */}
        <div className="relative h-4 w-3/4 overflow-hidden rounded bg-foreground/15">
          <span
            key={fakeName}
            className="absolute inset-0 flex items-center px-1.5 text-[11px] leading-none
                       text-foreground/55 animate-fade-up"
          >
            {fakeName}
          </span>
        </div>
        {/* Pills row */}
        <div className="flex gap-1.5">
          <div className="h-5 w-12 rounded-full bg-foreground/15" />
          <div className="h-5 w-14 rounded-full bg-foreground/15" />
        </div>
        {/* Address line */}
        <div className="h-3 w-2/3 rounded bg-foreground/10" />
        {/* why_fits box */}
        <div className="h-10 w-full rounded-2xl bg-foreground/10" />
      </div>

      {/* Shimmer sweep — softer + slower (calm thay vì hối hả) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full
                   bg-gradient-to-r from-transparent via-white/25 to-transparent
                   animate-shimmer"
        style={{ animationDuration: "2.4s" }}
      />
    </div>
  );
}
