import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Base62 alphabet: 0-9 a-z A-Z (62 chars, 8 chars → 62^8 ≈ 218 trillion combos)
const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHORT_ID_LENGTH = 8;

/**
 * Generates a random 8-character base62 string.
 * Cryptographically random via Web Crypto API (available in Node ≥19 + Edge).
 */
export function generateShortId(): string {
  const bytes = new Uint8Array(SHORT_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => BASE62[b % BASE62.length])
    .join("");
}

/**
 * Attempts to generate a unique short_id by checking for collisions in DB.
 * Retries up to maxRetries times before throwing.
 *
 * Uses a SELECT EXISTS approach: if the row already exists, generate a new ID.
 * Insertion atomicity is handled by the PK constraint in the caller's INSERT.
 */
export async function createShortIdWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  maxRetries = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const candidate = generateShortId();

    const { data, error } = await supabase
      .from("shared_recommendations")
      .select("short_id")
      .eq("short_id", candidate)
      .maybeSingle();

    if (error) {
      // DB error querying — propagate immediately, don't retry silently.
      throw new Error(`[createShortIdWithRetry] DB error: ${error.message}`);
    }

    // No existing row → candidate is available.
    if (!data) {
      return candidate;
    }
    // Collision (extremely rare) → try next candidate.
  }

  throw new Error(
    `[createShortIdWithRetry] Failed to generate unique short_id after ${maxRetries} attempts.`,
  );
}
