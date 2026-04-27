"use client";

import { useEffect, useState } from "react";

interface RateLimitedProps {
  /** Seconds to count down. Defaults to 60. */
  cooldownSec?: number;
  onRetry?: () => void;
}

/**
 * Shown when the server returns a 429 / rate_limited error.
 * Optionally counts down before enabling the retry action.
 */
export function RateLimited({ cooldownSec = 60, onRetry }: RateLimitedProps) {
  const [remaining, setRemaining] = useState(cooldownSec);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const canRetry = remaining === 0;

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p className="text-sm text-muted-foreground">
        Bạn đang hỏi hơi nhanh 🐢. Nghỉ 1 phút rồi hỏi tiếp nha.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={canRetry ? onRetry : undefined}
          disabled={!canRetry}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          {canRetry ? "Thử lại" : `Thử lại sau ${remaining}s`}
        </button>
      )}
    </div>
  );
}
