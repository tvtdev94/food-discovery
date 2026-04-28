import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, MapPin, Sparkles, Utensils, ExternalLink } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import type { ShareSnapshot, RecommendationSnapshotItem } from "@/lib/share/snapshot";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

interface PageProps {
  params: Promise<{ shortId: string }>;
}

async function fetchSharedSnapshot(shortId: string): Promise<ShareSnapshot | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("shared_recommendations")
    .select("snapshot, created_at")
    .eq("short_id", shortId)
    .maybeSingle();

  if (error) {
    console.error("[/s/shortId] DB error:", error.message);
    return null;
  }
  if (!data) return null;
  return (data as AnyRow).snapshot as ShareSnapshot;
}

/** Allowlist scheme guard — accept https://, http://; reject javascript:, data:, etc. */
function safeMapsUri(uri: string | undefined | null): string | null {
  if (!uri) return null;
  return /^https?:\/\//i.test(uri) ? uri : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shortId } = await params;
  const snapshot = await fetchSharedSnapshot(shortId);
  if (!snapshot) {
    return { title: "Không tìm thấy — Food Discovery" };
  }

  const firstRec = snapshot.recommendations[0];
  const title = firstRec
    ? `${firstRec.snapshot.name} & ${snapshot.recommendations.length - 1} quán khác — Food Discovery`
    : "Gợi ý quán ăn — Food Discovery";
  const description =
    snapshot.message_text?.slice(0, 160) ||
    "Khám phá quán ngon được AI gợi ý trên Food Discovery.";

  return {
    title,
    description,
    robots: { index: false, follow: false }, // noindex: prevent SEO spam for /s/* pages
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Food Discovery",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

function priceLabel(level?: number | null): string {
  if (!level) return "";
  return "$".repeat(Math.min(level, 4));
}

function SharedRestaurantCard({
  item,
  index,
}: {
  item: RecommendationSnapshotItem;
  index: number;
}) {
  const { why_fits, snapshot: snap } = item;
  const name = snap.name;
  const rating = snap.rating;
  const price = priceLabel(snap.priceLevel);
  const address = snap.address;
  const mapsUri = snap.mapsUri;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-soft">
      {/* Gradient placeholder (no live photo fetch on share page) */}
      <div className="relative h-32 w-full bg-gradient-to-br from-primary/10 via-secondary to-accent/10 flex items-center justify-center">
        <Utensils className="h-8 w-8 text-primary/40" aria-hidden="true" />
        {index < 3 && (
          <span className="absolute left-3 top-3 inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-white/95 px-2 text-xs font-semibold text-primary shadow-soft">
            #{index + 1}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <h3 className="font-semibold text-base leading-snug text-foreground">{name}</h3>

        {(rating != null || price) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {rating != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                <span className="font-medium text-amber-900">{rating.toFixed(1)}</span>
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
          <p className="text-xs text-muted-foreground line-clamp-2">
            <MapPin className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
            {address}
          </p>
        )}

        {why_fits && (
          <div className="flex gap-2 rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-foreground/80">{why_fits}</p>
          </div>
        )}

        {safeMapsUri(mapsUri) && (
          <a
            href={safeMapsUri(mapsUri) as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            Xem trên Maps
          </a>
        )}
      </div>
    </Card>
  );
}

export default async function SharedPage({ params }: PageProps) {
  const { shortId } = await params;
  const snapshot = await fetchSharedSnapshot(shortId);
  if (!snapshot) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-8 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Food Discovery
        </p>
        <h1 className="text-xl font-bold leading-snug text-foreground">
          Quán ngon được AI gợi ý
        </h1>
      </header>

      {/* Assistant message text */}
      {snapshot.message_text && (
        <div className="rounded-3xl rounded-tl-md border border-border/50 bg-card px-4 py-3 shadow-soft-sm">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {snapshot.message_text}
          </p>
        </div>
      )}

      {/* Restaurant cards */}
      <section className="flex flex-col gap-3" aria-label="Danh sách quán gợi ý">
        {snapshot.recommendations.map((item, i) => (
          <SharedRestaurantCard key={item.place_id || i} item={item} index={i} />
        ))}
      </section>

      {/* Footer CTA */}
      <footer className="flex flex-col items-center gap-3 pt-2 border-t border-border/40">
        <p className="text-sm text-muted-foreground text-center">
          Muốn tìm quán ngon gần bạn?
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
        >
          Hỏi AI ngay →
        </Link>
      </footer>
    </main>
  );
}
