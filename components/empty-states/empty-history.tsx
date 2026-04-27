"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Empty state cho /history — chưa có cuộc trò chuyện nào.
 */
export function EmptyHistory() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center animate-fade-up">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/15 to-primary/15">
        <MessageCircle className="h-9 w-9 text-accent" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Chưa có lịch sử
        </h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Thử hỏi xem hôm nay ăn gì nha
        </p>
      </div>
      <Button asChild>
        <Link href="/">Trò chuyện mới</Link>
      </Button>
    </div>
  );
}
