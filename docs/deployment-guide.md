# Deployment Guide — Food Discovery (Beta)

**Target:** Vercel (Fluid Compute, Node.js 24 LTS) | **Last updated:** 2026-04-28
**Scale:** 10-100 beta users

## 1. Prerequisites

- Vercel account (free tier OK cho beta)
- Supabase project — production tier recommended (free tier 500k rows / 500MB OK ban đầu)
- Upstash Redis — free tier 10k req/day OK ban đầu
- OpenAI API key với gpt-4o-mini access + billing setup
- Google Places API key + Places API (New) enabled
- Sentry project (free tier 5k events/month)
- (optional) Custom domain

## 2. Install Vercel CLI

```bash
npm i -g vercel
vercel --version    # >=39
vercel login
```

## 3. Apply DB Migration

```bash
# Local dev
supabase db push

# Production (once linked)
supabase db push --db-url "postgres://..."
```

Verify:
```bash
psql "$DATABASE_URL" -c "\dt" | grep shared_recommendations
```

## 4. Link Vercel Project

```bash
cd D:/WORKSPACES/food-discovery
vercel link
# Choose: Create new project "food-discovery" or link existing
```

## 5. Set Production Env Vars

Run từng cái:
```bash
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_MODEL production            # gpt-4o-mini
vercel env add GOOGLE_PLACES_API_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add NOMINATIM_USER_AGENT production    # food-discovery/1.0 (admin@yourdomain)
vercel env add PLACES_DAILY_BUDGET_USD production # 5
vercel env add ADMIN_KEY production               # generate: openssl rand -hex 24
vercel env add SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add NEXT_PUBLIC_APP_URL production     # https://fooddiscovery.vercel.app
vercel env add ALERT_WEBHOOK_URL production       # optional Slack webhook
```

Verify:
```bash
vercel env ls production
```

## 6. Preview Deploy + Smoke Test

```bash
vercel deploy
# Output: https://food-discovery-xxxxx.vercel.app
```

Smoke test checklist (preview URL):
- [ ] Homepage loads, shows greeting + chips
- [ ] Chat 1 query "ăn gì giờ" → 5 quán render
- [ ] Click "Chia sẻ" → Sheet → copy link → mở incognito → render đúng
- [ ] `/api/health` → `{ ok: true, supabase: "ok", redis: "ok" }`
- [ ] `/admin/stats` với `x-admin-key: <ADMIN_KEY>` → 200 JSON
- [ ] OG preview: dùng https://www.opengraph.xyz/url/<share-url> kiểm tra

## 7. Sentry Verification

Trigger 1 lỗi cố tình:
```bash
curl -X POST https://<preview>/api/chat -H 'Content-Type: application/json' -d '{}'
# → 400/500 expected
```

Vào Sentry dashboard → Issues → confirm event xuất hiện trong vòng 30s. Check:
- PII scrubbed (no user input in body, no user email)
- Stack trace visible
- Tags: `env=production`, `runtime=nodejs`

## 8. Promote to Production

```bash
vercel deploy --prod
# Hoặc Vercel Dashboard → Deployments → Promote
```

## 9. Custom Domain (Optional)

```bash
vercel domains add fooddiscovery.app
# Follow DNS instructions
```

Update `NEXT_PUBLIC_APP_URL` env var với domain mới.

## 10. Uptime Monitor

Dùng UptimeRobot (free 50 monitors):
1. https://uptimerobot.com → Add monitor
2. Type: HTTPS
3. URL: `https://<production>/api/health`
4. Interval: 5 phút
5. Alert: Email khi 2 lần fail liên tiếp

## 11. Post-Deploy Checks (48h)

- Sentry no critical issues
- Places API budget < $1/day (per `budget-guard.ts`)
- Cache hit rate ≥50% (qua `/admin/stats`)
- /api/health uptime ≥99%
- No 5xx > 1% trong 24h

---

## Rollback

Nếu issue critical sau deploy:

```bash
# List deployments
vercel ls

# Rollback to previous via web dashboard
# Vercel Dashboard → Deployments → [previous] → Promote to Production

# Hoặc CLI
vercel rollback https://<previous-deployment-url>
```

---

## Env Var Update (post-deploy)

```bash
# Remove old
vercel env rm OPENAI_API_KEY production

# Add new
vercel env add OPENAI_API_KEY production

# Re-deploy to apply (env vars chỉ apply sau next deploy)
vercel deploy --prod
```

---

## Troubleshooting

| Issue | Check |
|---|---|
| 503 ở /api/health | Check Supabase dashboard + Upstash quota |
| Chat trả về error 503 | OpenAI quota? Sentry log? |
| OG preview không render | curl page check `<meta property="og:`; FB Debugger https://developers.facebook.com/tools/debug |
| Share link 404 | Migration `shared_recommendations` đã apply chưa? |
| Cold start >5s | Vercel function logs; consider Fluid Compute pricing tier |
