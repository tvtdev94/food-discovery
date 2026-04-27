"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";
import { toast } from "@/hooks/use-toast";

// Set a readable (non-HttpOnly) cookie so /auth/callback can read it.
function writeDeviceIdCookie() {
  if (typeof document === "undefined") return;
  const id = getOrCreateDeviceId();
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `device_id=${encodeURIComponent(id)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

interface LoginFormProps {
  onSuccess?: () => void;
}

/**
 * Login form — magic link (email OTP) + Google OAuth.
 * Displays a branded success block once the magic link is sent.
 */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [loadingOtp, setLoadingOtp] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const supabase = createSupabaseBrowserClient();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoadingOtp(true);
    writeDeviceIdCookie();
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) throw error;
      setOtpSent(true);
      toast({
        title: "Kiểm tra email nha!",
        description: "Mình đã gửi magic link về hộp thư của bạn.",
      });
      onSuccess?.();
    } catch (err) {
      toast({
        title: "Lỗi gửi email",
        description: err instanceof Error ? err.message : "Thử lại sau nhé.",
        variant: "destructive",
      });
    } finally {
      setLoadingOtp(false);
    }
  }

  async function handleGoogle() {
    setLoadingGoogle(true);
    writeDeviceIdCookie();
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (error) throw error;
      // Browser redirects — no further action needed.
    } catch (err) {
      toast({
        title: "Lỗi đăng nhập Google",
        description: err instanceof Error ? err.message : "Thử lại sau nhé.",
        variant: "destructive",
      });
      setLoadingGoogle(false);
    }
  }

  if (otpSent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <MailCheck className="h-6 w-6 text-emerald-600" aria-hidden="true" />
        </span>
        <p className="text-sm text-emerald-900">
          Magic link đã gửi tới <strong className="font-semibold">{email}</strong>.
          <br />
          Mở email và nhấn link nhé!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loadingOtp}
          autoComplete="email"
          inputMode="email"
          className="h-11"
        />
        <Button
          type="submit"
          disabled={loadingOtp || !email.trim()}
          className="h-11 w-full shadow-soft hover:shadow-soft-lg disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
        >
          {loadingOtp ? "Đang gửi..." : "Gửi magic link"}
        </Button>
      </form>

      <div className="relative flex items-center gap-2">
        <div className="flex-1 border-t border-border" />
        <span className="text-xs text-muted-foreground">hoặc</span>
        <div className="flex-1 border-t border-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2"
        onClick={handleGoogle}
        disabled={loadingGoogle}
      >
        <GoogleIcon className="h-4 w-4" />
        {loadingGoogle ? "Đang chuyển hướng..." : "Đăng nhập bằng Google"}
      </Button>
    </div>
  );
}

/** Google brand mark — official 4-color "G". */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
