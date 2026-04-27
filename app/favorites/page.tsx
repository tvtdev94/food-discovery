"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FavoriteCard } from "@/components/favorites/favorite-card";
import { EmptyFavorites } from "@/components/empty-states/empty-favorites";
import { useFavorites } from "@/hooks/use-favorites";

/**
 * /favorites — grid các quán đã lưu.
 * 2-col mobile, 3-col ≥768px. Sticky glass header với back + title.
 */
export default function FavoritesPage() {
  const { favorites, isLoading, remove, fetchOnce } = useFavorites();

  useEffect(() => {
    void fetchOnce();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/75 backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-background pt-safe">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Quay lại trang chủ"
            className="active:scale-90 transition-transform"
            asChild
          >
            <Link href="/">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="font-display text-xl font-semibold text-foreground">Yêu thích</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        {isLoading && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-2xl" />
            ))}
          </div>
        )}

        {!isLoading && favorites.length === 0 && <EmptyFavorites />}

        {!isLoading && favorites.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {favorites.map((fav, i) => (
              <div
                key={fav.place_id}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
              >
                <FavoriteCard favorite={fav} onRemove={(placeId) => void remove(placeId)} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
