import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Admin client has no DB type generics — cast through any per established codebase pattern.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/conversations/[id]/messages
 * Returns messages + recommendations for a conversation.
 * Validates that the conversation belongs to the current owner.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  const rawParams = await params;
  const parsed = ParamsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }
  const { id } = parsed.data;

  const db = supabaseAdmin();

  // Verify ownership.
  const { data: conv, error: convErr } = await db
    .from("conversations")
    .select("id, owner_key")
    .eq("id", id)
    .maybeSingle();

  if (convErr) {
    console.error("[conv messages GET] conv lookup:", convErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const convRow = conv as AnyRow;
  if (!convRow) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if ((convRow.owner_key as string) !== identity.ownerKey) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Fetch messages.
  const { data: messages, error: msgErr } = await db
    .from("messages")
    .select("id, role, content, tool_calls, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    console.error("[conv messages GET] messages:", msgErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const messageRows = (messages as AnyRow[]) ?? [];
  const messageIds = messageRows.map((m: AnyRow) => m.id as string);
  let recommendations: AnyRow[] = [];

  if (messageIds.length > 0) {
    const { data: recs, error: recErr } = await db
      .from("recommendations")
      .select("id, message_id, rank, place_id, snapshot, why_fits, created_at")
      .in("message_id", messageIds)
      .order("rank", { ascending: true });

    if (!recErr) {
      recommendations = (recs as AnyRow[]) ?? [];
    }
  }

  return Response.json({ messages: messageRows, recommendations });
}
