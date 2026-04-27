"use client";

/**
 * Client-safe device ID helpers.
 * Single source of truth: getOrCreateDeviceId re-exported from use-active-location.
 */
export { getOrCreateDeviceId } from "@/hooks/use-active-location";

const LS_DEVICE_ID_KEY = "device_id";

/**
 * Reads device_id from localStorage without creating one.
 * Returns null if absent or in SSR context.
 */
export function getDeviceIdSync(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Merges x-device-id header into a fetch RequestInit.
 * Safe to call in browser only (uses getDeviceIdSync — no create side-effect).
 */
export function attachDeviceHeader(init?: RequestInit): RequestInit {
  const deviceId = getDeviceIdSync();
  if (!deviceId) return init ?? {};
  const existing = (init?.headers as Record<string, string>) ?? {};
  return {
    ...init,
    headers: { ...existing, "x-device-id": deviceId },
  };
}
