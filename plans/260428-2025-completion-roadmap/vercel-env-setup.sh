#!/usr/bin/env bash
# Phase 5 — Vercel production env vars setup
# Usage: After `vercel link`, run each `vercel env add` interactively.
#
# Generated ADMIN_KEY (48-char hex, cryptographic):
#   194e7bb45c4f49c5418333b0112807897b000c6af160c3ac
# (regenerate with: openssl rand -hex 24)
#
# IMPORTANT: copy values from your local .env / Supabase / Upstash dashboards.

set -e

echo "Adding 14 production env vars to Vercel..."
echo "Vercel will prompt for each value."
echo ""

vercel env add OPENAI_API_KEY production
vercel env add OPENAI_MODEL production            # gpt-4o-mini
vercel env add SEARCHAPI_API_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add NOMINATIM_USER_AGENT production    # food-discovery/1.0 (admin@yourdomain)
vercel env add PLACES_DAILY_BUDGET_USD production # 5
vercel env add ADMIN_KEY production               # use the 48-char hex above
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add NEXT_PUBLIC_APP_URL production     # https://<project>.vercel.app

# Optional
vercel env add ALERT_WEBHOOK_URL production       # leave empty to skip alerts

echo ""
echo "Verify with: vercel env ls production"
