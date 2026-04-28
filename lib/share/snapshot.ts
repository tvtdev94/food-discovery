import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Snapshot shape stored in shared_recommendations.snapshot (no PII lat/lng).
export interface RecommendationSnapshotItem {
  place_id: string;
  why_fits: string;
  snapshot: {
    name: string;
    rating?: number | null;
    reviews?: number | null;
    priceLevel?: number | null;
    address?: string | null;
    mapsUri?: string | null;
    /** Distance string pre-computed at share time, e.g. "1.2 km". May be null for shared links. */
    distance?: string | null;
  };
}

export interface ShareSnapshot {
  message_text: string;
  recommendations: RecommendationSnapshotItem[];
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

/**
 * Builds a public-safe snapshot for a given message_id.
 * - Fetches message row + linked recommendations.
 * - Strips lat/lng to prevent PII exposure.
 * - Returns null if message doesn't exist or has no content.
 */
export async function buildSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  messageId: string,
): Promise<ShareSnapshot | null> {
  // Fetch message row.
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("id, content, owner_key, created_at")
    .eq("id", messageId)
    .maybeSingle();

  if (msgErr) {
    console.error("[buildSnapshot] message fetch error:", msgErr.message);
    return null;
  }
  if (!msg) return null;

  // Cap to 4 KB to bound jsonb size + page payload (DoS guard).
  const rawText: string = (msg as AnyRow).content ?? "";
  const messageText: string = rawText.slice(0, 4096);

  // Fetch recommendations for this message ordered by rank.
  const { data: recs, error: recsErr } = await supabase
    .from("recommendations")
    .select("place_id, why_fits, snapshot, rank")
    .eq("message_id", messageId)
    .order("rank", { ascending: true });

  if (recsErr) {
    console.error("[buildSnapshot] recommendations fetch error:", recsErr.message);
    return null;
  }

  const rows = (recs as AnyRow[]) ?? [];

  // No recommendations → not shareable (no content to display).
  if (rows.length === 0) return null;

  const recommendations: RecommendationSnapshotItem[] = rows.map((row) => {
    const snap = (row.snapshot as AnyRow) ?? {};
    return {
      place_id: row.place_id ?? "",
      why_fits: row.why_fits ?? "",
      snapshot: {
        name: snap.name ?? `Quán #${row.rank ?? 1}`,
        rating: snap.rating ?? null,
        reviews: snap.reviews ?? null,
        priceLevel: snap.priceLevel ?? null,
        address: snap.address ?? null,
        mapsUri: snap.mapsUri ?? null,
        // Intentionally omit lat/lng (PII: user location context).
        // distance field not available at share time without user coords.
        distance: null,
      },
    };
  });

  return {
    message_text: messageText,
    recommendations,
    created_at: (msg as AnyRow).created_at ?? new Date().toISOString(),
  };
}
