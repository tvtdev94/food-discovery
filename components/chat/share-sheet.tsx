"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

/**
 * Bottom sheet that displays a share URL with a copy button.
 * Uses navigator.clipboard with fallback for older browsers.
 */
export function ShareSheet({ open, onOpenChange, url }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Đã copy link", description: url, duration: 3000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text for manual copy
      toast({ title: "Không thể copy", description: "Hãy copy link thủ công.", duration: 3000 });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Chia sẻ gợi ý
          </SheetTitle>
          <SheetDescription>
            Gửi link này cho bạn bè để chia sẻ danh sách quán ngon.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2">
          <p className="flex-1 truncate text-sm text-foreground/80 select-all">{url}</p>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Đã copy" : "Copy link"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-150 hover:opacity-90 active:scale-95"
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
