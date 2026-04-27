import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mergeGuestData } from "@/lib/auth/merge-guest-data";
import { safeNext } from "@/lib/auth/safe-next";

export const runtime = "nodejs";

const QuerySchema = z.object({
  next: z.string().optional(),
});

const BodySchema = z.object({
  device_id: z.string().min(1).max(128).optional(),
});

/**
 * GET  /api/auth/merge-guest?next=/
 *   — called by auth/callback redirect; merges then 302 to `next`.
 *   device_id is read exclusively from the `device_id` cookie (C4 fix).
 *
 * POST /api/auth/merge-guest  { device_id? }
 *   — programmatic call; returns { ok, mergedCounts }.
 *   device_id in body must match cookie if both provided.
 *
 * Both require an authenticated session.
 */

async function resolveUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/** Reads device_id from cookie; optionally validates it matches a caller-supplied value. */
async function resolveDeviceId(
  callerSupplied?: string | null,
): Promise<{ deviceId: string } | NextResponse> {
  const cookieStore = await cookies();
  const cookieDeviceId = cookieStore.get("device_id")?.value;

  if (!cookieDeviceId) {
    return NextResponse.json({ error: "missing_device_id" }, { status: 400 });
  }
  // If caller also supplied a value it MUST match the cookie (prevents URL-injection).
  if (callerSupplied && callerSupplied !== cookieDeviceId) {
    return NextResponse.json({ error: "device_id_mismatch" }, { status: 403 });
  }
  return { deviceId: cookieDeviceId };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);

  const parsed = QuerySchema.safeParse({
    next: searchParams.get("next") ?? "/",
  });
  if (!parsed.success) {
    return NextResponse.redirect(`${origin}/?auth_error=invalid_params`);
  }

  const redirectTarget = `${origin}${safeNext(parsed.data.next)}`;

  const user = await resolveUser();
  if (!user) {
    // Not authenticated — skip merge and redirect home.
    return NextResponse.redirect(redirectTarget);
  }

  const deviceResult = await resolveDeviceId();
  if (deviceResult instanceof NextResponse) {
    // Missing cookie — skip merge gracefully; user is already authenticated.
    return NextResponse.redirect(redirectTarget);
  }
  const { deviceId } = deviceResult;

  try {
    await mergeGuestData(deviceId, user.id);
  } catch (err) {
    // Merge failure is non-fatal — log and continue; user is already authenticated.
    console.error("[merge-guest] merge failed, continuing:", err);
  }

  return NextResponse.redirect(redirectTarget);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await resolveUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw: unknown = await request.json();
    body = BodySchema.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // device_id from body (if present) must match cookie.
  const deviceResult = await resolveDeviceId(body.device_id);
  if (deviceResult instanceof NextResponse) {
    return deviceResult;
  }
  const { deviceId } = deviceResult;

  try {
    const mergedCounts = await mergeGuestData(deviceId, user.id);
    return NextResponse.json({ ok: true, mergedCounts });
  } catch (err) {
    console.error("[merge-guest] POST failed:", err);
    return NextResponse.json({ error: "merge_failed" }, { status: 500 });
  }
}
