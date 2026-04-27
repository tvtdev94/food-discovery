import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Identity {
  ownerKey: string;
  userId: string | null;
  deviceId: string | null;
}

/**
 * Resolves caller identity from Supabase session cookie or x-device-id header.
 * ownerKey = userId (if logged in) ?? deviceId (guest).
 * Throws if neither is present.
 */
export async function resolveIdentity(req: Request): Promise<Identity> {
  // Try authenticated session first.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;

  // Fall back to device-id header for guest mode.
  const deviceId = req.headers.get("x-device-id")?.trim() || null;

  const ownerKey = userId ?? deviceId;
  if (!ownerKey) {
    throw new Error("Identity required: provide a valid session or x-device-id header.");
  }

  return { ownerKey, userId, deviceId };
}
