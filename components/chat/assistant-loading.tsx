"use client";

import { useEffect, useState } from "react";
import { TypingIndicator } from "@/components/chat/typing-indicator";

const STATUSES: readonly string[] = [
  "Đang tìm quán gần bạn…",
  "Đang đọc đánh giá & menu…",
  "Chọn quán hợp mood bạn…",
  "Kiểm tra khoảng cách & giờ mở…",
  "Gần xong rồi nè…",
];

const ROTATION_MS = 2200;

/**
 * Loading state cho assistant turn trước khi text bắt đầu stream.
 * Gồm: typing dots pill + rotating status text + indeterminate progress bar.
 * Mục đích: user thấy rõ "hệ thống đang làm gì" trong pha chờ dài (thường 30–60s).
 */
export function AssistantLoading() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setIdx((i) => (i + 1) % STATUSES.length),
      ROTATION_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-2 self-start">
      <div className="flex items-center gap-2">
        <TypingIndicator />
        {/* Rotating status — key buộc remount để trigger fade-in mỗi lần đổi */}
        <span
          key={idx}
          className="text-xs text-muted-foreground animate-fade-up"
          aria-live="polite"
        >
          {STATUSES[idx]}
        </span>
      </div>

      {/* Indeterminate progress bar — chiều rộng giới hạn để không tràn
          trong flex-col parent. */}
      <div className="relative h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 animate-indeterminate" />
      </div>
    </div>
  );
}
