# Code Review — Phase 4 Wave D: Share Link Feature

**Date:** 2026-04-28 | **Reviewer:** code-reviewer | **Scope:** 10 created + 5 modified

## Summary

| Field | Value |
|-------|-------|
| Status | APPROVED_WITH_CONCERNS |
| Score | 8.5/10 |
| Critical (BLOCKER) | 0 |
| Security concerns | 2 (low-severity) |
| Suggestions | 5 |

Vitest 216/216 pass, typecheck clean. Implementation hits the 9 critical checks well — RLS deny-all, no PII leak (lat/lng stripped), ownership verified before snapshot, rate limit keyed on `owner_key`, retry-then-throw collision logic, React text rendering (no `dangerouslySetInnerHTML`), `noindex` meta. All files ≤200 LOC.

## Critical checks — verdict

| # | Check | Status | Note |
|---|-------|--------|------|
| 1 | RLS deny anon+authenticated | PASS | `migrations/20260428000000:24-38` — both policies deny `using/with check (false)` |
| 2 | No PII (lat/lng/owner_key/user input) in snapshot | PASS | `snapshot.ts:84-86` strips lat/lng explicitly; only assistant message_text + place metadata |
| 3 | Ownership verified before insert | PASS | `route.ts:53-66` — `messages.owner_key = identity.ownerKey` before snapshot+insert |
| 4 | Rate limit by `owner_key` | PASS | `route.ts:30` — `ratelimitShare.limit(identity.ownerKey)`, NOT IP |
| 5 | Short ID retry → error after maxRetries | PASS | `short-id.ts:53-55` throws clean error; `route.ts:78-81` catches → 500 |
| 6 | XSS via React text rendering | PASS | All user-influenced fields rendered as text children (no `dangerouslySetInnerHTML`); `mapsUri` is anchor `href` only |
| 7 | noindex meta | PASS | `page.tsx:46` — `robots: { index: false, follow: false }` |
| 8 | File size ≤200 LOC | PASS | Largest is page.tsx 188; assistant-message.tsx 238 (modified, not new — was already large) |
| 9 | Strict TS (no exported `any`) | PARTIAL | Several `any` casts internal — see Suggestion S5 |

## Security concerns (low-severity, non-blocking)

### SEC-1 — `mapsUri` rendered as `href` without scheme allowlist (page.tsx:127)

**Risk:** If a poisoned snapshot somehow contained `javascript:alert(1)` as `mapsUri`, browsers would execute it on click. The snapshot is built from trusted Places API data via service-role insert path, so attack surface is small — but data poisoning of `recommendations.snapshot.mapsUri` upstream would propagate here.

**Mitigation (suggested, not blocker):** Validate scheme in `SharedRestaurantCard`:
```tsx
const safeMapsUri = mapsUri && /^https?:\/\//i.test(mapsUri) ? mapsUri : null;
```

### SEC-2 — `message_text` length not capped in snapshot (snapshot.ts:53)

**Risk:** A malicious assistant message (or DB-poisoned `messages.content`) could be arbitrarily large; whole text stored in snapshot JSON and rendered on `/s/*`. No XSS (React escapes), but DoS (huge payload, large OG description).

**Note:** OG description is sliced to 160 chars at `page.tsx:40-41`. Body renders the full text. Cap at e.g. 4 KB during snapshot build to avoid unbounded jsonb rows.

## Suggestions (non-blocking)

### S1 — Race window between `createShortIdWithRetry` SELECT and INSERT
`short-id.ts` does a SELECT-then-return; the actual INSERT happens later in `route.ts:84`. Two concurrent requests could both see "no row" for the same candidate (extremely unlikely with 62^8 space, but possible). The PK constraint will reject the second INSERT but the route returns 500 `db_error` — opaque. Consider: catch unique-violation `23505` from INSERT and retry the whole flow, or move the INSERT into the retry loop.

**File:** `app/api/share/route.ts:93-96`

### S2 — `app_url` returned by API is constructed from `publicEnv` server-side
`route.ts:98` uses `publicEnv.NEXT_PUBLIC_APP_URL`. If `NEXT_PUBLIC_APP_URL` env is unset, default is `http://localhost:3000` — could leak through to production response if env not configured during deploy. Consider failing hard at startup (require env in prod): in `lib/env.ts:25` the `.default("http://localhost:3000")` masks misconfiguration. Add guard or different default per `NODE_ENV`.

### S3 — Page does not handle DB error path explicitly
`page.tsx:24` collapses `error || !data` → `null` → `notFound()`. A real DB error (e.g. Supabase outage) will show user "404 not found" instead of a transient error UI — user may share link believing it's broken. Add error logging at minimum (`console.error` like `snapshot.ts:48` does) so ops can detect.

### S4 — `robots.txt` not seen
The plan §D R2 mentions either `robots.txt` disallow `/s/*` OR `noindex` meta. Implementation chose `noindex` (correct, more granular). However `robots.txt` for the rest of the site was not checked — verify a future `app/robots.ts` doesn't conflict. Non-blocker because `noindex` meta is authoritative for Googlebot.

### S5 — Pervasive `any` casts
Files use `// eslint-disable-next-line @typescript-eslint/no-explicit-any` + `type AnyRow = any` in: `route.ts:13`, `snapshot.ts:27`, `short-id.ts:29`, `page.tsx:10`. Working around generic `SupabaseClient<any>`. Consider generating Supabase types via `supabase gen types typescript` and tightening (deferred-OK for beta).

## Positive observations

- Migration `drop policy if exists` makes idempotent re-runs safe
- `route.ts:43-47` does NOT echo Zod issue messages back to client — only logs server-side. Good practice (no schema leak).
- `short-id.ts:43` propagates DB error immediately rather than silently retrying — avoids masking infra issues
- `not-found.tsx` is minimal (19 LOC), uses Next.js `notFound()` properly, no info leak
- `share-sheet.tsx:33-36` clipboard fallback toast — graceful degradation
- Test coverage: 13 cases across 3 files; covers happy + ownership mismatch + rate limit + invalid body + DB error + RLS deny path + retry-exhausted
- `page.tsx:35-41` OG title falls back gracefully when no recommendations; description capped at 160 chars
- `assistant-message.tsx:205` only shows Share button when `!isStreaming` AND `showRealCards` — correct gating, no premature share of in-flight messages

## Files reviewed

- `D:/WORKSPACES/food-discovery/supabase/migrations/20260428000000_shared_recommendations.sql` (38 LOC)
- `D:/WORKSPACES/food-discovery/lib/share/short-id.ts` (56 LOC)
- `D:/WORKSPACES/food-discovery/lib/share/snapshot.ts` (96 LOC)
- `D:/WORKSPACES/food-discovery/app/api/share/route.ts` (100 LOC)
- `D:/WORKSPACES/food-discovery/app/s/[shortId]/page.tsx` (188 LOC)
- `D:/WORKSPACES/food-discovery/app/s/[shortId]/not-found.tsx` (19 LOC)
- `D:/WORKSPACES/food-discovery/components/chat/share-sheet.tsx` (70 LOC)
- `D:/WORKSPACES/food-discovery/lib/redis.ts` (81 LOC, +ratelimitShare)
- `D:/WORKSPACES/food-discovery/lib/env.ts` (47 LOC, +NEXT_PUBLIC_APP_URL)
- `D:/WORKSPACES/food-discovery/lib/env-public.ts` (23 LOC)
- `D:/WORKSPACES/food-discovery/components/chat/assistant-message.tsx` (238 LOC, +Share button & state)
- 3 test files (244 LOC total)

## Unresolved questions

1. **S2** — Should `NEXT_PUBLIC_APP_URL` default in `lib/env.ts` be removed in prod builds, or is the deploy pipeline guaranteed to set it?
2. **S1** — Acceptable to leave the race-window unique-violation un-retried given 62^8 space? Probability is ~0 at current scale; fine to defer.
3. **SEC-2** — Cap snapshot.message_text at N chars now (preventive) or wait for incident?
