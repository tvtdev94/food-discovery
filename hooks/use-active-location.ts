"use client";

import { create } from "zustand";
import type { ActiveLocation } from "@/lib/location/types";

const LS_LOCATION_KEY = "active_location";
const LS_DEVICE_ID_KEY = "device_id";
// Matches coord-only labels like "16.0826, 108.2217" — indicates a prior
// reverse-geocode failure; safe to retry on next hydrate.
const COORD_LABEL_RE = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;

// --- Device ID helper ---

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(LS_DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(LS_DEVICE_ID_KEY, id);
  return id;
}

// --- Store types ---

type LocationStatus = "idle" | "requesting" | "ready" | "error";

interface LocationState {
  location: ActiveLocation | null;
  status: LocationStatus;
  error?: string;
}

interface LocationActions {
  init: () => void;
  tryGeolocate: () => Promise<void>;
  fallbackIp: () => Promise<void>;
  setLocation: (loc: ActiveLocation) => void;
  requestPermissionFlow: () => Promise<void>;
}

type LocationStore = LocationState & LocationActions;

// --- Persist helper ---

function persistLocation(loc: ActiveLocation): void {
  try {
    localStorage.setItem(LS_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // Storage quota exceeded — non-fatal.
  }
}

// --- Fire-and-forget POST to /api/location/active ---

function syncToServer(loc: ActiveLocation): void {
  const deviceId = getOrCreateDeviceId();
  fetch("/api/location/active", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-device-id": deviceId },
    body: JSON.stringify({ location: loc }),
  }).catch(() => {
    // Best-effort — client already has the location in localStorage.
  });
}

// --- Re-run reverse geocode for a stale coord-only label ---

async function refreshLabel(
  current: ActiveLocation,
  set: (partial: Partial<LocationState>) => void,
): Promise<void> {
  const geo = await reverseGeocode(current.lat, current.lng);
  if (!geo?.label) return;
  const updated: ActiveLocation = {
    ...current,
    label: geo.label,
    city: geo.city,
    country: geo.country,
    updatedAt: Date.now(),
  };
  set({ location: updated });
  persistLocation(updated);
}

// --- Reverse geocode via API ---

async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; city?: string; country?: string } | null> {
  const deviceId = getOrCreateDeviceId();
  const res = await fetch(`/api/location/reverse?lat=${lat}&lng=${lng}`, {
    headers: { "x-device-id": deviceId },
  });
  if (!res.ok) return null;
  const data = await res.json() as { label?: string; city?: string; country?: string };
  return data.label ? { label: data.label, city: data.city, country: data.country } : null;
}

// --- GPS with timeout ---

function getCurrentPositionWithTimeout(
  timeoutMs: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Geolocation timeout"));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve(pos);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
      { enableHighAccuracy: false, timeout: timeoutMs },
    );
  });
}

// --- Zustand store ---

export const useActiveLocation = create<LocationStore>((set, get) => ({
  location: null,
  status: "idle",
  error: undefined,

  init() {
    try {
      const raw = localStorage.getItem(LS_LOCATION_KEY);
      if (!raw) return;
      const parsed: ActiveLocation = JSON.parse(raw) as ActiveLocation;
      if (parsed.lat && parsed.lng && parsed.label) {
        set({ location: parsed, status: "ready" });
        // If label is a coord fallback (e.g. "16.0826, 108.2217"), the previous
        // reverse-geocode failed. Retry now — BigDataCloud fallback may succeed.
        if (COORD_LABEL_RE.test(parsed.label)) {
          void refreshLabel(parsed, set);
        }
      }
    } catch {
      // Corrupted localStorage — ignore.
    }
  },

  async tryGeolocate() {
    if (!navigator.geolocation) {
      set({ status: "error", error: "Trình duyệt không hỗ trợ định vị GPS" });
      return;
    }

    set({ status: "requesting" });

    try {
      const pos = await getCurrentPositionWithTimeout(5000);
      const { latitude: lat, longitude: lng } = pos.coords;

      const geo = await reverseGeocode(lat, lng);
      const loc: ActiveLocation = {
        lat,
        lng,
        label: geo?.label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        source: "gps",
        updatedAt: Date.now(),
        city: geo?.city,
        country: geo?.country,
      };

      get().setLocation(loc);
    } catch {
      set({ status: "error", error: "Không thể lấy vị trí GPS" });
    }
  },

  async fallbackIp() {
    set({ status: "requesting" });
    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch("/api/location/ip", {
        headers: { "x-device-id": deviceId },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as {
        lat?: number;
        lng?: number;
        label?: string;
        city?: string;
        country?: string;
      };

      if (!data.lat || !data.lng || !data.label) {
        set({ status: "error", error: "Không xác định được vị trí qua IP" });
        return;
      }

      const loc: ActiveLocation = {
        lat: data.lat,
        lng: data.lng,
        label: data.label,
        source: "ip",
        updatedAt: Date.now(),
        city: data.city,
        country: data.country,
      };

      get().setLocation(loc);
    } catch {
      set({ status: "error", error: "Không thể lấy vị trí qua IP" });
    }
  },

  setLocation(loc: ActiveLocation) {
    set({ location: loc, status: "ready", error: undefined });
    persistLocation(loc);
    syncToServer(loc);
  },

  async requestPermissionFlow() {
    // 1. Try GPS
    await get().tryGeolocate();
    if (get().status === "ready") return;

    // 2. GPS denied/timed out → IP fallback
    await get().fallbackIp();
    // If still not ready, status stays "error" or "idle" — user can open picker manually.
  },
}));
