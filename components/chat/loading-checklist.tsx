"use client";

import { cn } from "@/lib/utils";
import {
  CHECKLIST_STEPS,
  getChecklistState,
  type ChecklistStepState,
} from "@/lib/chat/loading-copy";
import type { MessagePhase } from "@/hooks/use-chat-stream";

/**
 * 3-step progressive checklist hiển thị dưới ProgressPill.
 *
 * State derive từ phase qua mapping cố định (loading-copy.ts).
 * - pending: emoji ⏳ + opacity-50
 * - active:  emoji theo step + dot pulse cuối dòng
 * - done:    emoji ✅ + opacity-70
 *
 * Smooth transition 200ms khi state đổi → user thấy progress "tích" dần.
 */
interface LoadingChecklistProps {
  phase: MessagePhase;
}

export function LoadingChecklist({ phase }: LoadingChecklistProps) {
  return (
    <ul
      aria-label="Tiến độ tìm quán"
      className="flex flex-col gap-1 self-start animate-fade-up"
    >
      {CHECKLIST_STEPS.map((step, i) => {
        const state = getChecklistState(phase, i);
        return <ChecklistRow key={step.key} step={step} state={state} />;
      })}
    </ul>
  );
}

interface ChecklistRowProps {
  step: (typeof CHECKLIST_STEPS)[number];
  state: ChecklistStepState;
}

function ChecklistRow({ step, state }: ChecklistRowProps) {
  const emoji =
    state === "done"
      ? step.emojiDone
      : state === "active"
        ? step.emojiActive
        : step.emojiPending;

  return (
    <li
      className={cn(
        "flex items-center gap-2 text-xs leading-tight transition-all duration-200",
        state === "pending" && "text-foreground/40",
        state === "active" && "text-foreground font-medium",
        state === "done" && "text-foreground/70",
      )}
    >
      <span aria-hidden="true" className="w-4 text-center text-sm leading-none">
        {emoji}
      </span>
      <span className={cn(state === "done" && "line-through decoration-foreground/30")}>
        {step.label}
      </span>
      {state === "active" && (
        <span
          aria-hidden="true"
          className="ml-1 inline-flex items-center gap-1"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      )}
    </li>
  );
}
