"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Heart, MapPin, Phone, Sparkles, Star, Utensils } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { buildMapsLink } from "@/lib/maps-deep-link";
import { useFavorites } from "@/hooks/use-favorites";
import type { Recommendation } from "@/hooks/use-chat-stream";

function isRenderableUrl(u?: string): boolean {
  if (!u) return false;
  if (u.length < 8) return false;
  return /^https?:\/\//i.test(u) || u.startsWith("data:image/");
}

interface ActiveLocationArg {
  lat: number;
  lng: number;
}

interface RestaurantCardProps {
  rec: Recommendation;
  activeLocation: ActiveLocationArg;
  index: number;
}

/** Haversine distance in km between two lat/lng pairs. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Numeric price level (1-4) → "$$" string. */
function priceLabel(level?: number): string {
  if (!level) return "";
  return "$".repeat(Math.min(level, 4));
}

/**
 * Rich restaurant card v3.
 * Layout: hero photo với rank badge top-left + glass heart top-right + glass
 * Maps icon bottom-right (primary action affordance). Body: tên + meta pills
 * + address + phone + why_fits quote. KHÔNG còn CTA button — cả card clickable.
 */
export function RestaurantCard({ rec, activeLocation, index }: RestaurantCardProps) {
  const { place_id, why_fits, snapshot } = rec;
  const { isFavorite, toggle, fetchOnce } = useFavorites();

  useEffect(() => {
    void fetchOnce();
  }, [fetchOnce]);

  const [imgError, setImgError] = useState(false);

  const name = snapshot?.name ?? `Quán #${index + 1}`;
  const rating = snapshot?.rating;
  const reviews = snapshot?.reviews;
  const price = priceLabel(snapshot?.priceLevel);
  const address = snapshot?.address;
  const phone = snapshot?.phone;
  const rawThumb = snapshot?.thumbnail;
  const showThumbnail = isRenderableUrl(rawThumb) && !imgError;
  const hasSnapshot = Boolean(snapshot);

  const distance =
    hasSnapshot && snapshot?.lat != null && snapshot?.lng != null
      ? haversineKm(activeLocation.lat, activeLocation.lng, snapshot.lat, snapshot.lng).toFixed(1)
      : null;

  const mapsUrl = buildMapsLink({
    name,
    placeId: place_id,
    lat: snapshot?.lat ?? activeLocation.lat,
    lng: snapshot?.lng ?? activeLocation.lng,
  });

  const ariaLabel = `${name}${why_fits ? ` — ${why_fits}` : ""}`;
  const favorited = place_id ? isFavorite(place_id) : false;

  function open() {
    hapticLight();
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }

  function handleHeartClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!place_id || !snapshot) return;
    hapticLight();
    void toggle(place_id, snapshot);
  }

  function handleMapClick(e: React.MouseEvent) {
    e.stopPropagation();
    open();
  }

  function handlePhoneClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-soft transition-all duration-200 hover:shadow-soft-lg">
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        onClick={open}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full flex-col text-left cursor-pointer",
          "transition-transform duration-150 active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {/* Hero image / gradient placeholder */}
        <div className="relative h-44 w-full bg-muted">
          {showThumbnail ? (
            <Image
              src={rawThumb!}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
              unoptimized
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 via-secondary to-accent/10">
              <Utensils className="h-10 w-10 text-primary/40" aria-hidden="true" />
            </div>
          )}

          {/* Subtle top gradient for badge/heart legibility */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/20 to-transparent"
          />

          {/* Rank badge (top-3 only) */}
          {index < 3 && (
            <span
              aria-hidden="true"
              className="absolute left-3 top-3 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-white/95 px-2 text-xs font-semibold text-primary shadow-soft"
            >
              #{index + 1}
            </span>
          )}

          {/* Floating heart — top-right */}
          {place_id && snapshot && (
            <button
              type="button"
              aria-label={favorited ? "Bỏ yêu thích" : "Thêm vào yêu thích"}
              aria-pressed={favorited}
              onClick={handleHeartClick}
              className={cn(
                "absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full",
                "shadow-soft ring-1 backdrop-blur-md transition-all duration-200 active:scale-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                favorited
                  ? "bg-rose-500 text-white ring-white/30"
                  : "bg-white/70 text-foreground ring-white/60 hover:bg-white/90",
              )}
            >
              <Heart className={cn("h-5 w-5", favorited && "fill-current")} aria-hidden="true" />
            </button>
          )}

          {/* Floating Maps open button — bottom-right (primary action affordance) */}
          <button
            type="button"
            aria-label="Mở trên Google Maps"
            onClick={handleMapClick}
            className={cn(
              "absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-soft ring-1 ring-white/30",
              "transition-all duration-200 active:scale-90 hover:bg-primary/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-2.5 px-4 py-3.5">
          <h3 className="font-semibold text-base leading-snug text-foreground line-clamp-2">
            {name}
          </h3>

          {hasSnapshot && (rating != null || distance || price) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {rating != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                  <span className="font-medium text-amber-900">{rating.toFixed(1)}</span>
                  {reviews != null && <span className="text-amber-700/80">({reviews})</span>}
                </span>
              )}
              {distance && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-900">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {distance} km
                </span>
              )}
              {price && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                  {price}
                </span>
              )}
            </div>
          )}

          {address && (
            <p className="text-xs text-muted-foreground line-clamp-2">{address}</p>
          )}

          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={handlePhoneClick}
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
            >
              <Phone className="h-3 w-3" aria-hidden="true" />
              Gọi {phone}
            </a>
          )}

          {why_fits && (
            <div className="flex gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-foreground/80">{why_fits}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
