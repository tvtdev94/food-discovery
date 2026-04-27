"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { LoginForm } from "@/components/auth/login-form";

/**
 * /login — magic link + Google OAuth. Mobile-first centered card.
 * Soft gradient blobs phía sau tạo brand moment cho first-impression.
 */
export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Decorative backdrop blobs — warm on cream needs higher opacity. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-primary/25 blur-2xl" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-accent/20 blur-2xl" />
      </div>

      <Card className="flex w-full max-w-sm flex-col gap-6 rounded-3xl border-border/50 p-6 shadow-soft-lg animate-pop">
        <div className="text-center">
          <Link href="/" className="inline-block">
            <BrandWordmark sizeClass="text-3xl" />
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Đăng nhập để lưu lịch sử &amp; yêu thích
            <br />
            trên mọi thiết bị
          </p>
        </div>

        <LoginForm />

        <Button variant="ghost" size="sm" asChild className="w-full">
          <Link href="/">← Quay lại</Link>
        </Button>
      </Card>
    </main>
  );
}
