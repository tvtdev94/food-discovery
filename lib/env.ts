import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY required"),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  SEARCHAPI_API_KEY: z.string().min(1, "SEARCHAPI_API_KEY required (https://www.searchapi.io)"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY required"),
  UPSTASH_REDIS_REST_URL: z.string().url("UPSTASH_REDIS_REST_URL must be URL"),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN required"),
  NOMINATIM_USER_AGENT: z
    .string()
    .min(10, "Nominatim ToS requires UA with contact email")
    .default("food-discovery/0.1 (contact@example.com)"),
  PLACES_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
  ADMIN_KEY: z.string().min(16, "ADMIN_KEY must be ≥16 chars"),
  ALERT_WEBHOOK_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY required"),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a URL").default("http://localhost:3000"),
});

function parse() {
  const server = serverSchema.safeParse(process.env);
  const pub = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!server.success || !pub.success) {
    const issues = [
      ...(server.success ? [] : server.error.issues),
      ...(pub.success ? [] : pub.error.issues),
    ];
    const msg = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${msg}`);
  }
  return { ...server.data, ...pub.data };
}

export const env = parse();
