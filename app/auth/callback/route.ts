import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

export const runtime = "nodejs";

/**
 * GET /auth/callback
 * Supabase PKCE callback handler.
 * Exchanges the one-time code for a session, then redirects to the
 * merge-guest route which transfers guest data to the authenticated user.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    // No code — redirect home with error indicator.
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error.message);
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  // Read device_id from a cookie the client sets before redirecting to /login.
  // The cookie name matches the localStorage key used by getOrCreateDeviceId.
  const deviceId = request.cookies.get("device_id")?.value ?? null;

  if (deviceId) {
    // Redirect through merge-guest. device_id is carried via cookie (C4 fix);
    // do NOT include it in the URL to prevent caller-supplied id attacks.
    const mergeUrl = new URL(`${origin}/api/auth/merge-guest`);
    mergeUrl.searchParams.set("next", next);
    return NextResponse.redirect(mergeUrl.toString());
  }

  return NextResponse.redirect(`${origin}${next}`);
}
