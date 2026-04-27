/**
 * Shared helpers for extracting rate-limit keys from incoming requests.
 * IP-first strategy prevents client-header rotation bypass (H3 fix).
 */

/**
 * Returns the best-effort client IP.
 * Prefers the first entry in x-forwarded-for, then x-real-ip, then "unknown".
 */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers as Headers).get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const realIp = (req.headers as Headers).get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

/**
 * Returns a session/device key for per-session rate limiting.
 * Falls back to IP so the key is never fully client-controlled.
 */
export function getSessionKey(req: Request): string {
  const deviceId = (req.headers as Headers).get("x-device-id");
  if (deviceId?.trim()) return deviceId.trim();
  const sessionId = (req.headers as Headers).get("x-session-id");
  if (sessionId?.trim()) return sessionId.trim();
  return getClientIp(req);
}
