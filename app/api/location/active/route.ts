import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(1),
  source: z.enum(["gps", "ip", "manual"]),
  updatedAt: z.number().int().positive(),
  city: z.string().optional(),
  country: z.string().optional(),
});

const bodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  location: activeLocationSchema,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { conversationId, location } = parsed.data;

  // Resolve owner_key: prefer authenticated session, fall back to device-id header.
  let ownerKey: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) ownerKey = data.user.id;
  } catch {
    // Not authenticated via session — continue to device-id fallback.
  }

  if (!ownerKey) {
    ownerKey = req.headers.get("x-device-id");
  }

  if (!ownerKey) {
    return NextResponse.json({ error: "No identity (session or device-id) provided" }, { status: 401 });
  }

  // If no conversationId, client persists locally — nothing to do server-side.
  if (!conversationId) {
    return NextResponse.json({ ok: true });
  }

  // Verify ownership before updating, using admin client (RLS bypass).
  const admin = supabaseAdmin();
  const { data: conv, error: fetchErr } = await admin
    .from("conversations")
    .select("owner_key")
    .eq("id", conversationId)
    .single();

  if (fetchErr || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (conv.owner_key !== ownerKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await admin
    .from("conversations")
    .update({ active_location: location })
    .eq("id", conversationId);

  if (updateErr) {
    console.error(JSON.stringify({ evt: "location:active:update_error", error: updateErr.message }));
    return NextResponse.json({ error: "Failed to persist location" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
