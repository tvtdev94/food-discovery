"use client";

import Image from "next/image";
import { useState } from "react";
import { Heart, Utensils, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { buildMapsLink } from "@/lib/maps-deep-link";
import type { Favorite } from "@/hooks/use-favorites";

interface FavoriteCardProps {
  favorite: Favorite;
  onRemove: (placeId: string) => void;
}

function priceLabel(level?: number): string {
  if (!level) return "";
  return "$".repeat(Math.min(level, 4));
}

function isRenderableUrl(u?: string): boolean {
  if (!u) return false;
  if (u.length < 8) return false;
  return /^https?:\/\//i.test(u) || u.startsWith("data:image/");
}

/**
 * Favorite place card — ảnh thumbnail tỉ lệ 4/3, heart-filled indicator,
 * X remove button (glass) hiện trên hover/focus. Tap body → Maps deep link.
 */
export function FavoriteCard({ favorite, onRemove }: FavoriteCardProps) {
  const { place_id, snapshot } = favorite;
  const [imgError, setImgError] = useState(false);

  const name = snapshot?.name ?? place_id;
  const cuisine = snapshot?.cuisine?.[0] ?? "";
  const rating = snapshot?.rating;
  const price = priceLabel(snapshot?.priceLevel);
  const rawThumb = snapshot?.thumbnail;
  const showThumbnail = isRenderableUrl(rawThumb) && !imgError;

  const mapsUrl = buildMapsLink({
    name,
    placeId: place_id,
    lat: snapshot?.lat ?? 0,
    lng: snapshot?.lng ?? 0,
  });

  function handleOpen() {
    hapticLight();
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    hapticLight();
    onRemove(place_id);
  }

  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/60 shadow-soft-sm transition-shadow hover:shadow-soft">
      {/* Photo / fallback */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Mở ${name} trên bản đồ`}
        className="relative block aspect-[4/3] w-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {showThumbnail ? (
          <Image
            src={rawThumb!}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 via-secondary to-accent/10">
            <Utensils className="h-8 w-8 text-primary/40" aria-hidden="true" />
          </div>
        )}

        {/* Favorite indicator */}
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white shadow-soft"
        >
          <Heart className="h-4 w-4 fill-current" />
        </span>
      </button>

      {/* Body */}
      <button
        type="button"
        onClick={handleOpen}
        aria-hidden="true"
        tabIndex={-1}
        className="block w-full px-3 py-2.5 text-left"
      >
        <h3 className="font-semibold text-sm leading-snug text-foreground line-clamp-2">
          {name}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {cuisine && <span className="truncate">{cuisine}</span>}
          {cuisine && rating != null && <span>·</span>}
          {rating != null && <span>★{rating.toFixed(1)}</span>}
          {price && <><span>·</span><span>{price}</span></>}
        </div>
      </button>

      {/* Remove button — hidden until hover/focus */}
      <button
        type="button"
        aria-label={`Bỏ yêu thích ${name}`}
        onClick={handleRemove}
        className={cn(
          "absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full",
          "bg-white/70 text-foreground shadow-soft-sm backdrop-blur-md",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
          "hover:text-destructive active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </Card>
  );
}
