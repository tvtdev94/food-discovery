import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Admin client has no DB type generics — cast through any per established codebase pattern.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

// Nullish numerics: upstream places may return null for rating/priceLevel/reviews
// when Google doesn't surface them; .optional() rejects null, so use .nullish().
const SnapshotSchema = z.object({
  name: z.string().min(1).max(200),
  cuisine: z.array(z.string()).optional(),
  rating: z.number().nullish(),
  reviews: z.number().nullish(),
  priceLevel: z.number().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  address: z.string().nullish(),
  mapsUri: z.string().nullish(),
}).passthrough();

const PostBodySchema = z.object({
  place_id: z.string().min(1).max(300),
  snapshot: SnapshotSchema,
});

const DeleteQuerySchema = z.object({
  place_id: z.string().min(1).max(300),
});

/** GET /api/favorites — list favorites for current owner */
export async function GET(req: NextRequest): Promise<Response> {
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("favorites")
    .select("place_id, snapshot, created_at")
    .eq("owner_key", identity.ownerKey)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[favorites GET]", error.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  return Response.json({ favorites: (data as AnyRow[]) ?? [] });
}

/** POST /api/favorites — add a favorite (upsert, on conflict do nothing) */
export async function POST(req: NextRequest): Promise<Response> {
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  let body: z.infer<typeof PostBodySchema>;
  try {
    const raw: unknown = await req.json();
    body = PostBodySchema.parse(raw);
  } catch (err) {
    // Log the zod issue so snapshot-shape regressions surface in server logs
    // instead of silently 400-ing the heart button.
    if (err instanceof z.ZodError) {
      console.warn("[favorites POST] invalid body", err.issues);
    }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("favorites")
    .upsert(
      { owner_key: identity.ownerKey, place_id: body.place_id, snapshot: body.snapshot } as never,
      { onConflict: "owner_key,place_id", ignoreDuplicates: true },
    )
    .select("place_id, snapshot, created_at")
    .maybeSingle();

  if (error) {
    console.error("[favorites POST]", error.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  return Response.json({ favorite: data as AnyRow }, { status: 201 });
}

/** DELETE /api/favorites?place_id=... — remove a favorite */
export async function DELETE(req: NextRequest): Promise<Response> {
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  const parsed = DeleteQuerySchema.safeParse({
    place_id: new URL(req.url).searchParams.get("place_id"),
  });
  if (!parsed.success) {
    return Response.json({ error: "invalid_place_id" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { error } = await db
    .from("favorites")
    .delete()
    .eq("owner_key", identity.ownerKey)
    .eq("place_id", parsed.data.place_id);

  if (error) {
    console.error("[favorites DELETE]", error.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
