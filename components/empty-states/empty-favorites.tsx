"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Empty state cho /favorites — khi user chưa lưu quán nào.
 * Guides them back to discovery with a clear CTA.
 */
export function EmptyFavorites() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center animate-fade-up">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15">
        <Heart className="h-9 w-9 text-primary" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">
          Chưa lưu quán nào
        </h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Nhấn vào tim trên gợi ý để lưu quán bạn thích
        </p>
      </div>
      <Button asChild>
        <Link href="/">Bắt đầu tìm quán</Link>
      </Button>
    </div>
  );
}
