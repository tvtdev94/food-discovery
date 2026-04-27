import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { publicEnv } from "@/lib/env-public";

/**
 * Refreshes Supabase auth session cookies on every request.
 * Must be called from Next.js root middleware.
 * Standard @supabase/ssr middleware pattern.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Rebuild response so Set-Cookie headers propagate to browser.
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Calling getUser() triggers token refresh if needed.
  // The result is intentionally unused here — middleware only refreshes cookies.
  await supabase.auth.getUser();

  return response;
}
