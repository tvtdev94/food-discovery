import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redis } from "@/lib/redis";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const probes = await Promise.allSettled([probeSupabase(), probeRedis()]);
  const [supabaseResult, redisResult] = probes;

  const supabase = readProbe("supabase", supabaseResult);
  const redisProbe = readProbe("redis", redisResult);
  const ok = supabase === "ok" && redisProbe === "ok";

  return NextResponse.json(
    {
      ok,
      supabase,
      redis: redisProbe,
      duration_ms: Date.now() - started,
    },
    { status: ok ? 200 : 503 },
  );
}

async function probeSupabase() {
  const client = supabaseAdmin();
  const { error } = await client
    .from("conversations")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
}

async function probeRedis() {
  const key = `health:${Date.now()}`;
  const token = `ok-${Math.random().toString(36).slice(2, 8)}`;
  await redis.set(key, token, { ex: 10 });
  const got = await redis.get<string>(key);
  if (got !== token) throw new Error(`redis readback mismatch: got=${String(got)}`);
}

function readProbe(service: string, r: PromiseSettledResult<unknown>): "ok" | "error" {
  if (r.status === "fulfilled") return "ok";
  const reason = r.reason;
  // Log detail server-side only — never expose to caller.
  log.error("health.probe_fail", { service, err: String(reason).slice(0, 200) });
  return "error";
}
