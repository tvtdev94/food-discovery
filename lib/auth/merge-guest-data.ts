import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/logger";

export interface MergeResult {
  conversations: number;
  messages: number;
  recommendations: number;
  favorites: number;
  preferences: number;
}

// The admin client has no DB type parameter, so query results type as `never`.
// Cast data through unknown to access fields — this is the established pattern
// in this codebase (see lib/chat/persist-turn.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRows = any[] | null;

/**
 * Transfers all rows owned by deviceId to userId.
 * Idempotent: running twice yields the same state (WHERE owner_key = deviceId
 * matches nothing the second time).
 *
 * Conflict handling:
 *  - favorites: UNIQUE(owner_key, place_id) — delete guest dupes before update.
 *  - preferences: PK owner_key — if user row exists, discard guest row; else update.
 */
export async function mergeGuestData(
  deviceId: string,
  userId: string,
): Promise<MergeResult> {
  const db = supabaseAdmin();
  const result: MergeResult = {
    conversations: 0,
    messages: 0,
    recommendations: 0,
    favorites: 0,
    preferences: 0,
  };

  try {
    // ------------------------------------------------------------------
    // 1. conversations
    // ------------------------------------------------------------------
    const { data: convRows, error: convErr } = await db
      .from("conversations")
      .update({ owner_key: userId } as never)
      .eq("owner_key", deviceId)
      .select("id");
    if (convErr) throw new Error(`conversations: ${convErr.message}`);
    result.conversations = (convRows as AnyRows)?.length ?? 0;

    // ------------------------------------------------------------------
    // 2. messages (owner_key is denormalized)
    // ------------------------------------------------------------------
    const { data: msgRows, error: msgErr } = await db
      .from("messages")
      .update({ owner_key: userId } as never)
      .eq("owner_key", deviceId)
      .select("id");
    if (msgErr) throw new Error(`messages: ${msgErr.message}`);
    result.messages = (msgRows as AnyRows)?.length ?? 0;

    // ------------------------------------------------------------------
    // 3. recommendations (owner_key denormalized)
    // ------------------------------------------------------------------
    const { data: recRows, error: recErr } = await db
      .from("recommendations")
      .update({ owner_key: userId } as never)
      .eq("owner_key", deviceId)
      .select("id");
    if (recErr) throw new Error(`recommendations: ${recErr.message}`);
    result.recommendations = (recRows as AnyRows)?.length ?? 0;

    // ------------------------------------------------------------------
    // 4. favorites — remove guest dupes that conflict with existing user rows.
    // ------------------------------------------------------------------
    const { data: userFavs, error: userFavsErr } = await db
      .from("favorites")
      .select("place_id")
      .eq("owner_key", userId);
    if (userFavsErr) throw new Error(`favorites-read: ${userFavsErr.message}`);

    const userPlaceIds = ((userFavs as AnyRows) ?? []).map(
      (r: { place_id: string }) => r.place_id,
    );

    if (userPlaceIds.length > 0) {
      const { error: delFavErr } = await db
        .from("favorites")
        .delete()
        .eq("owner_key", deviceId)
        .in("place_id", userPlaceIds);
      if (delFavErr) throw new Error(`favorites-dedup: ${delFavErr.message}`);
    }

    const { data: favRows, error: favErr } = await db
      .from("favorites")
      .update({ owner_key: userId } as never)
      .eq("owner_key", deviceId)
      .select("id");
    if (favErr) throw new Error(`favorites-update: ${favErr.message}`);
    result.favorites = (favRows as AnyRows)?.length ?? 0;

    // ------------------------------------------------------------------
    // 5. preferences — PK is owner_key; keep user row if it exists.
    // ------------------------------------------------------------------
    const { data: userPref, error: userPrefErr } = await db
      .from("preferences")
      .select("owner_key")
      .eq("owner_key", userId)
      .maybeSingle();
    if (userPrefErr) throw new Error(`preferences-read: ${userPrefErr.message}`);

    if (userPref) {
      const { error: delPrefErr } = await db
        .from("preferences")
        .delete()
        .eq("owner_key", deviceId);
      if (delPrefErr) throw new Error(`preferences-delete: ${delPrefErr.message}`);
      result.preferences = 0;
    } else {
      const { data: prefRows, error: prefErr } = await db
        .from("preferences")
        .update({ owner_key: userId } as never)
        .eq("owner_key", deviceId)
        .select("owner_key");
      if (prefErr) throw new Error(`preferences-update: ${prefErr.message}`);
      result.preferences = (prefRows as AnyRows)?.length ?? 0;
    }

    log.info("[merge-guest] completed", { deviceId, userId, ...result });
  } catch (err) {
    log.error("[merge-guest] failed", {
      deviceId,
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return result;
}
