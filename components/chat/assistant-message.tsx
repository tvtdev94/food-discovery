"use client";

import Image from "next/image";
import { RestaurantCard } from "@/components/chat/restaurant-card";
import { RestaurantCardSkeleton } from "@/components/chat/restaurant-card-skeleton";
import { LoadingChecklist } from "@/components/chat/loading-checklist";
import { ApiError } from "@/components/error-states/api-error";
import { RateLimited } from "@/components/error-states/rate-limited";
import { NetworkError } from "@/components/error-states/network-error";
import { extractSuggestions } from "@/lib/chat/extract-suggestions";
import { hapticLight } from "@/lib/haptics";
import type { ChatMessage, ErrorCode, MessagePhase } from "@/hooks/use-chat-stream";

interface ActiveLocationArg {
  lat: number;
  lng: number;
}

interface AssistantMessageProps {
  message: ChatMessage;
  activeLocation: ActiveLocationArg;
  onRetry?: () => void;
  errorCode?: ErrorCode | null;
  /** Click handler khi user tap suggestion tag (extracted từ message text). */
  onSuggestionClick?: (text: string) => void;
}

/**
 * Assistant turn — avatar + content column.
 *
 * Loading hierarchy (minimal):
 *  - PRIMARY: LoadingChecklist (2 steps Lùng quán → Chọn quán) với active
 *             dot pulse — đủ communicate progress, không cần pill text.
 *  - SECONDARY: cursor blink cuối text khi streaming thật.
 *  - ZONE: RestaurantCardSkeleton shimmer khi chờ recs.
 *
 * Bỏ ProgressPill (ticker rotate + Lottie) — checklist clearer + ít noise.
 */
export function AssistantMessage({
  message,
  activeLocation,
  onRetry,
  errorCode,
  onSuggestionClick,
}: AssistantMessageProps) {
  const { text, recommendations, status, phase } = message;

  const isStreaming = status === "streaming";
  const isError = status === "error";

  const hasRecs = Array.isArray(recommendations) && recommendations.length > 0;
  const allSkeletonRecs =
    hasRecs && recommendations!.every((r) => r.place_id === "" && r.why_fits === "");

  const showSkeletonCards = hasRecs && allSkeletonRecs;
  const showRealCards = hasRecs && !allSkeletonRecs;
  const activePhase: MessagePhase = phase ?? "thinking";
  // Checklist hiện trong suốt streaming, ẩn khi done/error.
  const showChecklist = isStreaming && activePhase !== "done";
  // Cursor blink ChatGPT-style: hiện khi text đang stream.
  const showStreamingCursor = isStreaming && text.length > 0;

  // Suggestion tags: extract từ khoá trong dấu nháy trong text (LLM gợi ý
  // alternative queries). Chỉ render khi message done + có handler — KHÔNG
  // render trong khi streaming (text dở dang dễ extract sai).
  const suggestions =
    !isStreaming && onSuggestionClick ? extractSuggestions(text) : [];
  const showSuggestions = suggestions.length > 0;

  return (
    <div className="flex gap-2 px-4 py-1.5 max-w-full animate-fade-up">
      {/* Avatar — mascot bowl-of-phở chibi. Static; Pill bên cạnh là loading anchor. */}
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden
                   rounded-full bg-gradient-to-br from-primary/10 to-accent/10
                   ring-1 ring-primary/15"
      >
        <Image
          src="/avatar-buddy.png"
          alt=""
          width={36}
          height={36}
          className="h-full w-full object-cover"
          priority
        />
      </span>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {showChecklist && <LoadingChecklist phase={activePhase} />}

        {text && !isError && (
          <div className="rounded-3xl rounded-tl-md border border-border/50 bg-card px-4 py-3 shadow-soft-sm">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {text}
              {showStreamingCursor && (
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-3.5 w-[2px] -mb-[2px] align-middle bg-primary animate-cursor-blink"
                />
              )}
            </p>

            {showSuggestions && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    onClick={() => {
                      hapticLight();
                      onSuggestionClick?.(s);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30
                               bg-primary/5 px-3 py-1 text-xs font-medium text-primary
                               transition-all duration-150 hover:bg-primary/10 hover:border-primary/50
                               active:scale-95
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span aria-hidden="true">🔎</span>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isError && errorCode === "rate_limited" && <RateLimited onRetry={onRetry} />}
        {isError && errorCode === "network" && <NetworkError onRetry={onRetry} />}
        {isError && (errorCode === "internal" || errorCode === "budget" || !errorCode) && (
          <ApiError onRetry={onRetry} />
        )}

        {showSkeletonCards && (
          <div className="mt-1 flex flex-col gap-2.5">
            {recommendations!.map((_, i) => (
              <div
                key={`skel-${i}`}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 80, 320)}ms` }}
              >
                <RestaurantCardSkeleton nameIndex={i} />
              </div>
            ))}
          </div>
        )}

        {showRealCards && (
          <div className="mt-1 flex flex-col gap-2.5">
            {recommendations!.map((rec, i) => (
              <div
                key={rec.place_id || i}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 100, 500)}ms` }}
              >
                <RestaurantCard rec={rec} activeLocation={activeLocation} index={i} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

