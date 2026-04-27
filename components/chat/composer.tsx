"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

export type ComposerDisabledReason = "no-location" | "streaming" | null;

interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled: boolean;
  /** Nguyên nhân disabled — quyết định helper hint hiển thị. */
  disabledReason?: ComposerDisabledReason;
  /**
   * "sticky" (default): bottom chat-bar layout với max-w + side padding outer wrapper.
   * "inline": plain pill, no outer padding — parent control spacing (dùng trong empty hero).
   */
  variant?: "sticky" | "inline";
  /** Override placeholder. Default "Hôm nay bạn muốn ăn gì?". */
  placeholder?: string;
}

/**
 * Pill-shape composer.
 * - Textarea auto-grow to max 200px, morph bên trong pill.
 * - Send button gradient FAB với active scale + haptic.
 * - Helper hint hiện khi disabled reason = "no-location".
 * - Enter submits; Shift+Enter → newline.
 */
export function Composer({
  onSubmit,
  disabled,
  disabledReason = null,
  variant = "sticky",
  placeholder = "Hôm nay bạn muốn ăn gì?",
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasValue, setHasValue] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });

  function handleSubmit() {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value || disabled) return;
    hapticLight();
    onSubmit(value);
    el.value = "";
    el.style.height = "auto";
    setHasValue(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    setHasValue(e.currentTarget.value.trim().length > 0);
  }

  const sendDisabled = disabled || !hasValue;
  const showLocationHint = disabledReason === "no-location";

  const pill = (
    <>
      {showLocationHint && (
        <p className="mb-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 text-primary" aria-hidden="true" />
          Cho mình biết bạn đang ở đâu nha
        </p>
      )}

      <div
        className={cn(
          "flex items-end gap-2 rounded-[28px] border border-border/60 bg-card p-1.5 shadow-soft",
          "transition-all duration-200",
          "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/30 focus-within:shadow-soft-lg",
        )}
      >
        <label htmlFor="composer-textarea" className="sr-only">
          Nhắn tin cho ĂnGì
        </label>
        <textarea
          id="composer-textarea"
          ref={textareaRef}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className={cn(
            "flex-1 resize-none bg-transparent px-3 py-2",
            "text-sm text-foreground placeholder:text-muted-foreground/70",
            "focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "min-h-[40px] max-h-[200px] overflow-y-auto",
          )}
          style={{ height: "40px" }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={sendDisabled}
          aria-label="Gửi tin nhắn"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground",
            "bg-gradient-to-br from-primary to-primary-glow shadow-soft",
            "transition-all duration-150",
            "hover:shadow-soft-lg active:scale-90",
            "disabled:from-muted-foreground/30 disabled:to-muted-foreground/30 disabled:shadow-none disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </>
  );

  if (variant === "inline") {
    return <div className="w-full">{pill}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-3 pt-2">
      {pill}
    </div>
  );
}
