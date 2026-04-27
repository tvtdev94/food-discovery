"use client";

import { create } from "zustand";
import { attachDeviceHeader, getOrCreateDeviceId } from "@/lib/auth/device-id";
import type { PlaceSnapshot } from "@/hooks/use-chat-stream";

export interface Favorite {
  place_id: string;
  snapshot: PlaceSnapshot;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

interface FavoritesState {
  favorites: Favorite[];
  isLoading: boolean;
  hasFetched: boolean;
}

interface FavoritesActions {
  /** Fetch from API once; subsequent calls are no-ops until `reset` is called. */
  fetchOnce: () => Promise<void>;
  toggle: (placeId: string, snapshot: PlaceSnapshot) => Promise<void>;
  remove: (placeId: string) => Promise<void>;
  isFavorite: (placeId: string) => boolean;
}

type FavoritesStore = FavoritesState & FavoritesActions;

// ---------------------------------------------------------------------------
// Zustand store — single fetch shared across all consumers
// ---------------------------------------------------------------------------

export const useFavorites = create<FavoritesStore>((set, get) => ({
  favorites: [],
  isLoading: false,
  hasFetched: false,

  async fetchOnce() {
    if (get().hasFetched) return;
    set({ isLoading: true });
    try {
      const res = await fetch("/api/favorites", attachDeviceHeader());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { favorites: Favorite[] };
      set({ favorites: data.favorites ?? [], isLoading: false, hasFetched: true });
    } catch {
      set({ isLoading: false, hasFetched: true });
    }
  },

  async toggle(placeId: string, snapshot: PlaceSnapshot) {
    const isFav = get().favorites.some((f) => f.place_id === placeId);

    if (isFav) {
      // Optimistic remove.
      set((s) => ({ favorites: s.favorites.filter((f) => f.place_id !== placeId) }));
      try {
        const deviceId = getOrCreateDeviceId();
        const res = await fetch(`/api/favorites?place_id=${encodeURIComponent(placeId)}`, {
          method: "DELETE",
          headers: { "x-device-id": deviceId },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Revert on failure.
        set((s) => ({
          favorites: [
            ...s.favorites,
            { place_id: placeId, snapshot, created_at: new Date().toISOString() },
          ],
        }));
      }
    } else {
      // Optimistic add.
      const newFav: Favorite = {
        place_id: placeId,
        snapshot,
        created_at: new Date().toISOString(),
      };
      set((s) => ({ favorites: [newFav, ...s.favorites] }));
      try {
        const res = await fetch("/api/favorites", {
          method: "POST",
          ...attachDeviceHeader({ headers: { "Content-Type": "application/json" } }),
          body: JSON.stringify({ place_id: placeId, snapshot }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Revert on failure.
        set((s) => ({ favorites: s.favorites.filter((f) => f.place_id !== placeId) }));
      }
    }
  },

  async remove(placeId: string) {
    await get().toggle(placeId, {} as PlaceSnapshot);
  },

  isFavorite(placeId: string): boolean {
    return get().favorites.some((f) => f.place_id === placeId);
  },
}));
