import { NextRequest } from "next/server";
import { resolveIdentity } from "@/lib/auth/resolve-identity";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Admin client has no DB type generics — cast through any per established codebase pattern.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

/**
 * GET /api/conversations
 * Returns the 50 most recent conversations for the current owner.
 * Title falls back to the first user message snippet (≤40 chars) when null.
 */
export async function GET(req: NextRequest): Promise<Response> {
  let identity;
  try {
    identity = await resolveIdentity(req);
  } catch {
    return Response.json({ error: "identity_required" }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: convs, error: convErr } = await db
    .from("conversations")
    .select("id, title, active_location, created_at, updated_at")
    .eq("owner_key", identity.ownerKey)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (convErr) {
    console.error("[conversations GET]", convErr.message);
    return Response.json({ error: "db_error" }, { status: 500 });
  }

  const rows = (convs as AnyRow[]) ?? [];

  if (rows.length === 0) {
    return Response.json({ conversations: [] });
  }

  // For conversations with null title, fetch first user message snippet.
  const noTitleIds = rows
    .filter((c: AnyRow) => !c.title)
    .map((c: AnyRow) => c.id as string);

  const snippetMap: Record<string, string> = {};

  if (noTitleIds.length > 0) {
    const { data: firstMsgs, error: msgErr } = await db
      .from("messages")
      .select("conversation_id, content")
      .eq("role", "user")
      .in("conversation_id", noTitleIds)
      .order("created_at", { ascending: true });

    if (!msgErr && firstMsgs) {
      for (const msg of firstMsgs as AnyRow[]) {
        const cid = msg.conversation_id as string;
        if (!snippetMap[cid] && msg.content) {
          snippetMap[cid] = (msg.content as string).slice(0, 40);
        }
      }
    }
  }

  const conversations = rows.map((c: AnyRow) => ({
    id: c.id as string,
    title: (c.title as string | null) ?? snippetMap[c.id as string] ?? "Cuộc trò chuyện",
    active_location: c.active_location as Record<string, unknown> | null,
    created_at: c.created_at as string,
    updated_at: c.updated_at as string,
  }));

  return Response.json({ conversations });
}
