# Phase 5 — Wave E: Beta Deploy Prep

**Priority:** Medium | **Status:** pending | **Effort:** 1 ngày | **Depends:** Phase 1-4

## Context Links
- Brainstorm: `plans/reports/brainstorm-260428-2025-completion-roadmap.md` §3.E
- Roadmap: `docs/development-roadmap.md` §9b.6 + Success Metrics
- Ops runbook: `docs/ops-runbook.md`

## Overview
Deploy lên Vercel với Fluid Compute, verify env + Sentry + admin dashboard, setup uptime monitor. Beta scale 10-100 user — không cần load test, không scaling architecture phức tạp.

## Key Insights
- Vercel CLI **chưa cài** (theo session hint) → `npm i -g vercel` trước
- Đã có `instrumentation.ts` cho OpenTelemetry + Sentry config files
- `/api/health` đã hardened (H2 fix) → sẵn sàng làm uptime probe target
- `/admin/stats` cần `x-admin-key` header → test với secret từ env
- **Dùng `vercel.ts`** (recommended từ knowledge update) thay vì `vercel.json` cho TS support

## Requirements

### Functional
- App deploy thành công Vercel
- Tất cả env vars production set
- `/api/health` return 200 với supabase=ok, redis=ok
- `/admin/stats` accessible với admin key
- Sentry nhận event test
- Uptime monitor ping `/api/health` mỗi 5 phút

### Non-functional
- Cold start <2s (Fluid Compute)
- HTTPS enforced
- Domain (custom hoặc `*.vercel.app`)

## Architecture
```
Vercel (Fluid Compute)
├── Web routes (RSC + Client)
├── API routes (Node 24 LTS)
│   ├── /api/chat — SSE stream
│   ├── /api/share — POST (Phase 4)
│   ├── /api/health — uptime probe
│   └── /api/admin/stats — admin secured
└── instrumentation.ts → Sentry + OpenTelemetry

External
├── Supabase (DB + Auth)
├── Upstash Redis (cache + ratelimit)
├── OpenAI (Responses API)
├── Google Places API
└── Sentry (error tracking)

Monitoring
├── Vercel Analytics (built-in)
├── Sentry (errors + traces)
└── UptimeRobot/Cronitor → /api/health (ext)
```

## Related Files

**Create:**
- `vercel.ts` — Vercel project config (TS) replace `vercel.json`
- `docs/deployment-guide.md` — step-by-step deploy guide

**Modify:**
- `.env.example` — đảm bảo có tất cả env vars production cần
- `docs/ops-runbook.md` — thêm section "Deploy procedure" + "Rollback procedure"
- `docs/development-roadmap.md` — thêm Phase 9b complete + Phase 10 (deployed) entry

**Read:**
- `instrumentation.ts`
- `sentry.client.config.ts`
- `next.config.ts`
- `.env.example`
- `docs/ops-runbook.md`

## Implementation Steps

### Step 1 — Install Vercel CLI
```bash
npm i -g vercel
vercel login
```

### Step 2 — Tạo `vercel.ts`
```ts
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  buildCommand: 'pnpm build',
  framework: 'nextjs',
  // No rewrites/redirects — middleware handles
};
```
- Cài `@vercel/config` (devDependency)
- Verify `pnpm build` works locally first

### Step 3 — Vercel project link
```bash
vercel link
# Choose project (or create new "food-discovery")
```

### Step 4 — Set env vars production
Mỗi var với `vercel env add <NAME> production`:
- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `ADMIN_KEY` (≥16 chars random — generate via `openssl rand -hex 24`)
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_APP_URL` (production URL)
- `IPAPI_KEY` (nếu có paid plan)

Verify: `vercel env ls production`

### Step 5 — Deploy preview + smoke test
```bash
vercel deploy
# → preview URL
```
Smoke test preview:
- Homepage load OK
- Chat 1 query → 5 quán render
- Share link Phase 4 — POST /api/share → /s/{id} render
- /api/health → 200 supabase ok, redis ok
- /admin/stats với header `x-admin-key: <ADMIN_KEY>` → 200

### Step 6 — Sentry verify
- Trigger 1 lỗi test (vd: gọi `/api/chat` với body sai)
- Vào Sentry dashboard → confirm event nhận được
- Check PII scrubbing đúng (không lộ user input)

### Step 7 — Promote production
```bash
vercel deploy --prod
```
Hoặc qua Vercel dashboard "Promote".

### Step 8 — Domain (optional)
- Nếu có custom domain: `vercel domains add <domain>`
- Set DNS A/CNAME theo hướng dẫn
- Verify HTTPS auto-enabled

### Step 9 — Uptime monitor
Setup UptimeRobot (free tier 50 monitors):
- Monitor type: HTTPS
- URL: `https://<production>/api/health`
- Interval: 5 phút
- Alert: email khi 2 fail liên tiếp

### Step 10 — Update docs
- `docs/deployment-guide.md` — full procedure (vercel link → env → deploy → verify)
- `docs/ops-runbook.md` — thêm "Deploy procedure", "Rollback (vercel rollback <prev-url>)", "Env var update procedure"
- `docs/development-roadmap.md` — đánh dấu Phase 9b ✅ + thêm note "Beta deployed YYYY-MM-DD"

## Todo List
- [ ] Step 1: npm i -g vercel + login
- [ ] Step 2: tạo vercel.ts + cài @vercel/config
- [ ] Step 3: vercel link
- [ ] Step 4: set env vars production (12 vars)
- [ ] Step 5: vercel deploy (preview) + smoke test
- [ ] Step 6: Sentry verify event nhận đúng
- [ ] Step 7: vercel deploy --prod
- [ ] Step 8: domain (nếu user cung cấp)
- [ ] Step 9: UptimeRobot setup
- [ ] Step 10: update 3 docs

## Success Criteria
- Production URL accessible HTTPS
- `/api/health` 200 supabase=ok redis=ok
- `/admin/stats` 200 với admin key
- 1 chat query → 5 quán hoạt động end-to-end
- 1 share link → render OG đúng
- Sentry receive ≥1 test event với PII scrubbed
- UptimeRobot monitor active (green)
- 3 docs updated

## Risk Assessment
- **R1 — Vercel CLI install fail:** mitigation = dùng web dashboard fallback
- **R2 — Env var missing in prod (Zod throw on startup):** mitigation = `lib/env.ts` validation rõ ràng → CI bắt sớm
- **R3 — Supabase RLS chặn service-role accidentally:** mitigation = test `/api/chat` end-to-end trên preview trước
- **R4 — Domain DNS propagation chậm:** mitigation = chấp nhận `*.vercel.app` cho beta nếu domain chưa sẵn
- **R5 — Sentry rate limit free tier (5k events/month):** mitigation = sample rate 0.1 đã set; monitor usage tuần đầu
- **R6 — Cold start spike khi 0 traffic:** mitigation = Fluid Compute reduces; OK cho beta
- **R7 — Budget overrun Places API:** mitigation = `budget-guard.ts` đã có cap $40/day; monitor 3 ngày đầu

## Security Considerations
- ADMIN_KEY ≥16 chars random; KHÔNG commit
- Sentry DSN public OK (client side); secret keys server-only
- HTTPS enforced (Vercel default)
- CORS check API routes (Next.js default OK)
- `robots.txt`: cho phép `/`, `/s/*`, `/login`; deny `/admin`, `/api/admin/*`

## Next Steps
- Beta invite 10 user → monitor Sentry + admin/stats 48h
- Iterate dựa trên feedback
- Plan Phase 10+ (map view, share, multi-city) khi user request rõ
