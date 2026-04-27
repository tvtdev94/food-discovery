import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/supabase-middleware";

/**
 * Next.js root middleware — refreshes Supabase session cookies on every request.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
