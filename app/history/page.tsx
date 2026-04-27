"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationListItem } from "@/components/history/conversation-list-item";
import { EmptyHistory } from "@/components/empty-states/empty-history";
import { attachDeviceHeader } from "@/lib/auth/device-id";

interface Conversation {
  id: string;
  title: string;
  active_location: { label?: string } | null;
  updated_at: string;
}

/**
 * /history — danh sách cuộc trò chuyện đã lưu.
 * Tap để load lại trong chat page qua ?c=<id>.
 */
export default function HistoryPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations", attachDeviceHeader());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { conversations: Conversation[] };
      setConversations(data.conversations ?? []);
    } catch {
      setError("Không thể tải lịch sử. Thử lại sau nhé.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSelect(id: string) {
    router.push(`/?c=${id}`);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/75 backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-background pt-safe">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Quay lại trang chủ"
            className="active:scale-90 transition-transform"
            asChild
          >
            <Link href="/">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Lịch sử trò chuyện
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        {isLoading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
              <RefreshCcw className="h-3.5 w-3.5" />
              Thử lại
            </Button>
          </div>
        )}

        {!isLoading && !error && conversations.length === 0 && <EmptyHistory />}

        {!isLoading && !error && conversations.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {conversations.map((conv, i) => (
              <div
                key={conv.id}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
              >
                <ConversationListItem
                  id={conv.id}
                  title={conv.title}
                  activeLocation={conv.active_location}
                  updatedAt={conv.updated_at}
                  onClick={handleSelect}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
