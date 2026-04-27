"use client";

import { Suspense, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Menu, PlusSquare, Clock, Heart, LogIn, LogOut } from "lucide-react";
import { ChatShell } from "@/components/chat/chat-shell";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { EmptyHero } from "@/components/chat/empty-hero";
import { LocationHeader } from "@/components/location/location-header";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useActiveLocation, getOrCreateDeviceId } from "@/hooks/use-active-location";
import { useSession } from "@/hooks/use-session";
import { toast } from "@/hooks/use-toast";
import { attachDeviceHeader } from "@/lib/auth/device-id";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import type { ChatMessage, Recommendation } from "@/hooks/use-chat-stream";

/**
 * Root chat page.
 * - Reads ?c=<id> to load an existing conversation.
 * - Nav drawer: New chat / History / Favorites / Login or Logout.
 *
 * Wrapped in Suspense (bottom of file) vì useSearchParams cần boundary
 * để Next.js 15 không fail static export.
 */
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages, isStreaming, error, errorCode, sendMessage, loadConversation, clear, conversationId } = useChatStream();
  const { location: activeLocation } = useActiveLocation();
  const { user, isLoading: sessionLoading, signOut } = useSession();

  // Surface stream errors as destructive toasts.
  useEffect(() => {
    if (!error) return;
    toast({
      title: "Ôi 🙈",
      description: "Vũ trụ trục trặc, thử lại nha.",
      variant: "destructive",
    });
  }, [error]);

  // Pre-warm SearchApi cache khi location ready (1 lần / mount).
  // Server fire-and-forget các query phổ biến theo giờ → khi user thực sự
  // gửi câu hỏi, Pass-1 dispatchTool có khả năng cao hit cache (~10ms thay
  // vì 500-1500ms). Backed by 5min/device debounce ở server.
  const prewarmFiredRef = useRef(false);
  useEffect(() => {
    if (!activeLocation || prewarmFiredRef.current) return;
    prewarmFiredRef.current = true;
    const deviceId = getOrCreateDeviceId();
    void fetch("/api/chat/prewarm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-id": deviceId },
      body: JSON.stringify({ lat: activeLocation.lat, lng: activeLocation.lng }),
    }).catch(() => {
      /* fire-and-forget — silent on network error */
    });
  }, [activeLocation]);

  // Load conversation from ?c= param on mount or param change.
  const cParam = searchParams.get("c");
  useEffect(() => {
    if (!cParam) return;
    // If already loaded this conversation, skip.
    if (conversationId === cParam) return;

    void (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${cParam}/messages`,
          attachDeviceHeader(),
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          messages: Array<{
            id: string;
            role: string;
            content: string | null;
            created_at: string;
          }>;
          recommendations: Array<{
            message_id: string;
            rank: number;
            place_id: string;
            snapshot: Recommendation["snapshot"];
            why_fits: string;
          }>;
        };

        // Build a recommendations map keyed by message_id.
        const recsByMsg: Record<string, Recommendation[]> = {};
        for (const r of data.recommendations ?? []) {
          if (!recsByMsg[r.message_id]) recsByMsg[r.message_id] = [];
          recsByMsg[r.message_id].push({
            place_id: r.place_id,
            why_fits: r.why_fits,
            snapshot: r.snapshot,
          });
        }

        // Map DB messages to ChatMessage shape.
        const chatMessages: ChatMessage[] = data.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            text: m.content ?? "",
            status: "done" as const,
            recommendations: recsByMsg[m.id],
          }));

        await loadConversation(cParam, chatMessages);
      } catch {
        toast({
          title: "Không thể tải cuộc trò chuyện",
          description: "Kiểm tra kết nối và thử lại nhé.",
          variant: "destructive",
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cParam]);

  const isEmpty = messages.length === 0 && !isStreaming;

  const locationArg = activeLocation
    ? { lat: activeLocation.lat, lng: activeLocation.lng, label: activeLocation.label }
    : null;

  function handleSend(text: string) {
    if (!locationArg) return;
    void sendMessage(text, locationArg);
  }

  const handleNewChat = useCallback(() => {
    clear();
    router.replace("/");
  }, [clear, router]);

  async function handleSignOut() {
    await signOut();
    toast({ title: "Đã đăng xuất", description: "Hẹn gặp lại!" });
  }

  const composerDisabled = isStreaming || !locationArg;

  return (
    <>
    <OnboardingOverlay />
    <ChatShell
      header={
        <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-2 gap-2">
          {/* Nav drawer trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Mở menu"
                className="shrink-0 active:scale-90 transition-transform"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col gap-6 pt-10">
              <SheetHeader>
                {/* sr-only DialogTitle — Radix yêu cầu title accessible. Wordmark
                    là branding visual, render riêng để tránh ambiguity với asChild. */}
                <SheetTitle className="sr-only">ĂnGì — menu</SheetTitle>
                <BrandWordmark sizeClass="text-2xl" />
              </SheetHeader>

              <nav className="flex flex-col gap-1">
                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-11"
                    onClick={handleNewChat}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <PlusSquare className="h-4 w-4 text-primary" />
                    </span>
                    Trò chuyện mới
                  </Button>
                </SheetClose>

                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-11"
                    onClick={() => router.push("/history")}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                      <Clock className="h-4 w-4 text-accent" />
                    </span>
                    Lịch sử
                  </Button>
                </SheetClose>

                <SheetClose asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 h-11"
                    onClick={() => router.push("/favorites")}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100">
                      <Heart className="h-4 w-4 text-rose-600" />
                    </span>
                    Yêu thích
                  </Button>
                </SheetClose>
              </nav>

              <div className="mt-auto rounded-2xl bg-muted p-3">
                {!sessionLoading && !user && (
                  <SheetClose asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 bg-card"
                      onClick={() => router.push("/login")}
                    >
                      <LogIn className="h-4 w-4 text-primary" />
                      Đăng nhập
                    </Button>
                  </SheetClose>
                )}
                {!sessionLoading && user && (
                  <>
                    <p className="mb-2 px-1 text-xs text-muted-foreground truncate">
                      {user.email ?? "Đã đăng nhập"}
                    </p>
                    <SheetClose asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-3 bg-card"
                        onClick={() => void handleSignOut()}
                      >
                        <LogOut className="h-4 w-4" />
                        Đăng xuất
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <BrandWordmark sizeClass="text-xl" onClick={handleNewChat} className="mr-auto" />
          <LocationHeader />
        </div>
      }
      footer={
        isEmpty ? null : (
          <Composer
            onSubmit={handleSend}
            disabled={composerDisabled}
            disabledReason={
              !locationArg ? "no-location" : isStreaming ? "streaming" : null
            }
          />
        )
      }
    >
      {isEmpty ? (
        <EmptyHero
          onSubmit={handleSend}
          composerDisabled={composerDisabled}
          composerDisabledReason={
            !locationArg ? "no-location" : isStreaming ? "streaming" : null
          }
        />
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          activeLocation={locationArg ?? { lat: 0, lng: 0 }}
          errorCode={errorCode}
          onRetry={() => {
            if (locationArg) void sendMessage(messages[messages.length - 2]?.text ?? "", locationArg);
          }}
          onSuggestionClick={handleSend}
        />
      )}
    </ChatShell>
    </>
  );
}
