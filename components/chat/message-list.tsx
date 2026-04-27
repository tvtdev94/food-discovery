"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { AssistantMessage } from "@/components/chat/assistant-message";
import { ScrollToBottomFab } from "@/components/chat/scroll-to-bottom-fab";
import type { ChatMessage, ErrorCode } from "@/hooks/use-chat-stream";

interface ActiveLocationArg {
  lat: number;
  lng: number;
}

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeLocation: ActiveLocationArg;
  /** Last assistant message gets this for error-state rendering. */
  errorCode?: ErrorCode | null;
  onRetry?: () => void;
  /** Click handler khi user tap vào suggestion tag trong assistant text. */
  onSuggestionClick?: (text: string) => void;
}

const AUTO_SCROLL_THRESHOLD_PX = 120;
const FAB_VISIBILITY_THRESHOLD_PX = 300;

/** Walk ancestors until we hit an element with vertical overflow scroll/auto. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Scrollable message list. Scroll container is the nearest scrollable ancestor
 * (ChatShell's <main>) — tracked dynamically via ref + findScrollParent.
 * - Auto-scrolls tới bottom khi user ở gần cuối (<= AUTO_SCROLL_THRESHOLD_PX).
 * - Hiện scroll-to-bottom FAB khi xa cuối > FAB_VISIBILITY_THRESHOLD_PX.
 */
export function MessageList({
  messages,
  isStreaming,
  activeLocation,
  errorCode,
  onRetry,
  onSuggestionClick,
}: MessageListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [showFab, setShowFab] = useState(false);

  const lastMessageId = messages[messages.length - 1]?.id;
  const lastMessageText = messages[messages.length - 1]?.text;
  const lastRecsLength = messages[messages.length - 1]?.recommendations?.length ?? 0;

  // Resolve scroll container once mounted.
  useEffect(() => {
    scrollerRef.current = findScrollParent(sentinelRef.current);
  }, []);

  // Auto-scroll when near bottom.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distFromBottom <= AUTO_SCROLL_THRESHOLD_PX) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    }
  }, [lastMessageId, lastMessageText, lastRecsLength, isStreaming]);

  // Track FAB visibility.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function updateFab() {
      const s = scrollerRef.current;
      if (!s) return;
      const distFromBottom = s.scrollHeight - s.scrollTop - s.clientHeight;
      setShowFab(distFromBottom > FAB_VISIBILITY_THRESHOLD_PX);
    }

    updateFab();
    scroller.addEventListener("scroll", updateFab, { passive: true });
    return () => scroller.removeEventListener("scroll", updateFab);
  }, []);

  function scrollToBottom() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }

  return (
    <>
      <div
        ref={sentinelRef}
        className="flex flex-col gap-2 pt-4 pb-6"
        aria-live="polite"
        aria-label="Cuộc trò chuyện"
      >
        <div className="mx-auto w-full max-w-2xl">
          {messages.map((msg, idx) =>
            msg.role === "user" ? (
              <MessageBubble key={msg.id} text={msg.text} />
            ) : (
              <AssistantMessage
                key={msg.id}
                message={msg}
                activeLocation={activeLocation}
                errorCode={idx === messages.length - 1 ? errorCode : null}
                onRetry={idx === messages.length - 1 ? onRetry : undefined}
                onSuggestionClick={onSuggestionClick}
              />
            ),
          )}
        </div>
      </div>

      <ScrollToBottomFab show={showFab} onClick={scrollToBottom} />
    </>
  );
}
