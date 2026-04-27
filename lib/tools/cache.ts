import "server-only";
import { redis } from "@/lib/redis";
import { UpstreamError } from "@/lib/tools/errors";

/**
 * Generic cache-through helper backed by Upstash Redis.
 * Returns { value, cached } so callers can log cache hits/misses.
 * If Redis is down on read, swallows the error and treats it as a miss.
 * If Redis is down on write after a successful produce(), rethrows as UpstreamError
 * so callers know the state is inconsistent.
 */
export async function cacheThrough<T>(
  key: string,
  ttlSec: number,
  produce: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  // --- Cache read ---
  let raw: unknown;
  try {
    raw = await redis.get(key);
  } catch {
    // Redis unavailable — treat as miss, proceed to produce
    raw = null;
  }

  if (raw !== null && raw !== undefined) {
    // Upstash REST client automatically JSON-parses object values.
    // Primitive strings come back as strings; objects come back parsed.
    // We accept whatever is stored as-is; callers are responsible for type safety.
    return { value: raw as T, cached: true };
  }

  // --- Cache miss: produce value ---
  const value = await produce();

  // --- Cache write (best-effort, but throw if Redis is down to avoid silent budget leaks) ---
  // Cast through unknown to satisfy Upstash's overloaded set() signature; value is
  // always JSON-serialisable since it came from produce() which returns T (user-controlled).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await redis.set(key, value as any, { ex: ttlSec });
  } catch (err) {
    throw new UpstreamError("Redis write failed after cache miss", err);
  }

  return { value, cached: false };
}
