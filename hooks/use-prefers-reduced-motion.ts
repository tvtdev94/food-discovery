"use client";

import { useEffect, useState } from "react";

/**
 * Reads `prefers-reduced-motion: reduce` from CSS media query.
 *
 * SSR-safe: returns `false` on first render (server + initial client paint),
 * updates to actual value sau khi mount qua useEffect. Subsequent toggles
 * (user changes OS setting) auto-propagate qua mediaQuery listener.
 *
 * Shared bởi LoadingCooking + RestaurantCardSkeleton — DRY.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduce;
}
