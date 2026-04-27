/**
 * Validates a `next` redirect target to prevent open-redirect attacks.
 * Accepts only same-origin relative paths (single leading slash, no // or /\).
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  // Must start with single slash AND not // (protocol-relative) or /\ (IE quirk).
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
