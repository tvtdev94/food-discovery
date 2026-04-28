import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ratelimitShare } from "@/lib/redis";
import { createShortIdWithRetry } from "@/lib/share/short-id";
import { buildSnapshot } from "@/lib/share/snapshot";
import { publicEnv } from "@/lib/env-public";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

const PostBodySchema = z.object({
  message_id: z.string().uuid("message_id must be a valid UUID"),
});

/** POST /api/share — create a public share link for a message with recommendations */
export async function POST(req: NextRequest): Promise<Response> {
  // 1. Resolve caller identity.
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  // 2. Rate limit: 5 share requests per hour per owner_key.
  const rl = await ratelimitShare.limit(identity.ownerKey);
  if (!rl.success) {
    return Response.json(
      { error: "rate_limited", retryAfter: Math.ceil((rl.reset - Date.now()) / 1000) },
      { status: 429 },
    );
  }

  // 3. Validate request body.
  let body: z.infer<typeof PostBodySchema>;
  try {
    const raw: unknown = await req.json();
    body = PostBodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.warn("[share POST] invalid body", err.issues);
    }
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = supabaseAdmin();

  // 4. Verify message belongs to this owner (ownership check prevents sharing others' messages).
  const { data: msg, error: msgErr } = await db
    .from("messages")
    .select("id, owner_key")
    .eq("id", body.message_id)
    .eq("owner_key", identity.ownerKey)
    .maybeSingle();

  if (msgErr) {
    console.error("[share POST] ownership check error:", msgErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }
  if (!msg) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // 5. Build public-safe snapshot (no lat/lng PII).
  const snapshot = await buildSnapshot(db, body.message_id);
  if (!snapshot) {
    return Response.json({ error: "no_recommendations" }, { status: 422 });
  }

  // 6. Generate collision-resistant short ID.
  let shortId: string;
  try {
    shortId = await createShortIdWithRetry(db);
  } catch (err) {
    console.error("[share POST] short_id generation failed:", err);
    return Response.json({ error: "id_generation_failed" }, { status: 500 });
  }

  // 7. Insert into shared_recommendations via service-role (bypasses RLS deny-all).
  const { error: insertErr } = await db
    .from("shared_recommendations")
    .insert({
      short_id: shortId,
      owner_key: identity.ownerKey,
      message_id: body.message_id,
      snapshot: snapshot as never,
    } as AnyRow);

  if (insertErr) {
    console.error("[share POST] insert error:", insertErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/s/${shortId}`;
  return Response.json({ shortId, url }, { status: 201 });
}
