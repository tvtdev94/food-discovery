# Phase 4 — Wave D: Share Link Feature

**Priority:** Medium-High | **Status:** pending | **Effort:** 2-3 ngày | **Depends:** Phase 1, Phase 2

## Context Links
- Brainstorm: `plans/reports/brainstorm-260428-2025-completion-roadmap.md` §3.D
- Existing migration pattern: `supabase/migrations/20260421000000_init.sql`
- Existing API route pattern: `app/api/favorites/route.ts`

## Overview
Thêm tính năng "Chia sẻ" cho assistant message có recommendations. Public read-only snapshot — link `/s/{shortId}` mở lên thấy 5 quán + lý do, không cần auth, không trigger Places API call.

## Key Insights
- Snapshot đóng băng: lưu sẵn JSON trong DB → render `/s/[shortId]` không cần gọi Places lại (tiết kiệm $$, ổn định)
- Short ID 8 char base62 → ~218 trillion combos, collision retry rất hiếm
- OG meta tags cần render server-side (Server Component) để FB/Zalo crawler nhặt được
- Rate limit /api/share = 5/h/owner (chống spam viral)

## Requirements

### Functional
- POST `/api/share` body `{message_id}` → trả `{shortId, url}`
- GET `/s/[shortId]` → render page với 5 quán + lý do + tên quán + maps link
- Nút "Chia sẻ" trên `assistant-message.tsx` chỉ hiện khi có recommendations
- Click nút → mở Sheet với link + nút "Copy"
- OG meta render đúng (title, description, image)

### Non-functional
- `/s/[shortId]` render <500ms (DB single SELECT, no external API)
- Rate limit 5 share/h/owner_key
- Snapshot vĩnh viễn (không TTL ở beta — defer khi scale)
- Share link không lộ owner_key

## Architecture

```
Client (assistant-message.tsx)
  → POST /api/share { message_id }
    → resolve owner_key from auth/device-id
    → SELECT message + recommendations from message_id
    → INSERT shared_recommendations { short_id, owner_key, message_id, snapshot }
    → return { shortId, url }
  → Sheet renders link + copy button

Crawler/User → GET /s/[shortId]
  → SELECT shared_recommendations WHERE short_id = ?
  → Server Component render snapshot (no client fetch)
```

## Related Files

**Create:**
- `supabase/migrations/20260428000000_shared_recommendations.sql` — table + RLS
- `app/api/share/route.ts` — POST handler
- `app/s/[shortId]/page.tsx` — public Server Component
- `app/s/[shortId]/not-found.tsx` — 404 page
- `lib/share/short-id.ts` — base62 generator + collision retry
- `lib/share/snapshot.ts` — build snapshot from message_id (DB query + format)
- `components/chat/share-sheet.tsx` — Sheet UI với link + copy button
- `tests/share/short-id.test.ts` — unit test base62 + retry
- `tests/share/snapshot.test.ts` — unit test snapshot builder
- `tests/api/share/route.test.ts` — integration test POST handler

**Modify:**
- `lib/redis.ts` — thêm `ratelimitShare` (5 req/h/owner)
- `components/chat/assistant-message.tsx` — thêm nút "Chia sẻ" + state mở Sheet
- `lib/env.ts` — thêm `NEXT_PUBLIC_APP_URL` (cho build full share URL)
- `lib/env-public.ts` — expose APP_URL

**Read for context:**
- `lib/supabase/admin.ts`
- `lib/auth/resolve-identity.ts`
- `app/api/favorites/route.ts` (pattern reference)
- `components/chat/assistant-message.tsx`
- `components/chat/restaurant-card.tsx`

## Implementation Steps

### Step 1 — DB Migration
File `supabase/migrations/20260428000000_shared_recommendations.sql`:
```sql
CREATE TABLE shared_recommendations (
  short_id text PRIMARY KEY,
  owner_key text NOT NULL,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX shared_recommendations_owner_key_idx ON shared_recommendations(owner_key);
CREATE INDEX shared_recommendations_created_at_idx ON shared_recommendations(created_at DESC);

ALTER TABLE shared_recommendations ENABLE ROW LEVEL SECURITY;
-- Deny all from anon/authenticated; service-role bypasses RLS
CREATE POLICY "deny_all_anon" ON shared_recommendations FOR ALL TO anon USING (false);
CREATE POLICY "deny_all_authenticated" ON shared_recommendations FOR ALL TO authenticated USING (false);
```

### Step 2 — Short ID generator
`lib/share/short-id.ts`:
- `generateShortId(): string` — random 8 chars from `0-9a-zA-Z`
- `createShortIdWithRetry(supabase, maxRetries=5): Promise<string>` — try generate, INSERT-test by SELECT, retry on collision
- ≤80 LOC

### Step 3 — Snapshot builder
`lib/share/snapshot.ts`:
- `buildSnapshot(supabase, messageId): Promise<Snapshot | null>` — fetch message + recommendations, format JSON
- Snapshot shape: `{ message_text, recommendations: [{ place_id, why_fits, snapshot: {name, rating, distance, ...} }], created_at }`
- Returns null nếu message không tồn tại
- ≤120 LOC

### Step 4 — POST /api/share route
`app/api/share/route.ts`:
- Body schema: `z.object({ message_id: z.string().uuid() })`
- Resolve identity (owner_key)
- Rate limit 5/h/owner_key (return 429 nếu exceed)
- Verify message_id thuộc owner (SELECT messages WHERE id = ? AND owner_key = ?)
- Build snapshot
- Insert shared_recommendations
- Return `{ shortId, url: "${APP_URL}/s/${shortId}" }`
- ≤150 LOC

### Step 5 — /s/[shortId] page
`app/s/[shortId]/page.tsx`:
- Server Component (default)
- `generateMetadata({ params })` — fetch snapshot, return OG title/description/image
- Page body: render fixed layout
  - Header: "Quán ngon được giới thiệu trên Food Discovery"
  - Message text (assistant intro)
  - 5 RestaurantCard (read-only — không favorite toggle)
  - Footer CTA: "Tự hỏi AI →" link về `/`
- ≤180 LOC

### Step 6 — UI Share button + Sheet
`components/chat/share-sheet.tsx`:
- shadcn Sheet
- Hiển thị URL + nút "Copy" (navigator.clipboard)
- Toast feedback "Đã copy link"
- ≤80 LOC

`components/chat/assistant-message.tsx` modify:
- Thêm Share icon button trong message footer (chỉ render khi `recommendations.length > 0`)
- onClick → fetch POST /api/share → open Sheet với URL trả về
- Loading state + error state

### Step 7 — Rate limit + env
`lib/redis.ts`:
```ts
export const ratelimitShare = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  analytics: true,
  prefix: "rl:share",
});
```

`lib/env.ts` + `lib/env-public.ts`:
- Add `NEXT_PUBLIC_APP_URL: z.string().url()` (default `http://localhost:3000` cho dev)

### Step 8 — Tests
- `tests/share/short-id.test.ts` (4 cases: shape, distribution, retry on collision, max retries throws)
- `tests/share/snapshot.test.ts` (4 cases: happy, missing message, message without recs, RLS deny)
- `tests/api/share/route.test.ts` (5 cases: happy, rate limit, ownership mismatch, invalid body, DB error)

### Step 9 — Manual smoke test
- `pnpm dev`
- Tạo conversation → AI suggests 5 quán
- Click "Chia sẻ" → Sheet mở → copy link
- Mở link tab incognito → render đúng
- Test FB share (nếu có domain public) → OG preview render

## Todo List
- [ ] Step 1: migration shared_recommendations.sql
- [ ] Step 2: lib/share/short-id.ts + tests
- [ ] Step 3: lib/share/snapshot.ts + tests
- [ ] Step 4: app/api/share/route.ts + tests
- [ ] Step 5: app/s/[shortId]/page.tsx + not-found
- [ ] Step 6: components/chat/share-sheet.tsx + assistant-message integration
- [ ] Step 7: ratelimitShare + APP_URL env
- [ ] Step 8: pnpm test all green
- [ ] Step 9: manual smoke test

## Success Criteria
- Migration apply clean (Supabase local + remote)
- POST /api/share → 200 với valid `{ shortId, url }`
- GET /s/{shortId} → 200 + 5 quán render
- OG meta tags render đúng (curl `<meta property="og:...`)
- Rate limit 5/h enforce (test query 6 lần thấy 429)
- Tất cả tests pass; ≥175 cases tổng (160 + ~13 mới)

## Risk Assessment
- **R1 — Snapshot bloat (snapshot too large):** mitigation = chỉ lưu fields cần render (name, rating, distance, why_fits, place_id, address, maps_link), bỏ raw Places blob
- **R2 — Spam share /s/* SEO:** mitigation = `robots.txt` disallow `/s/*` hoặc `noindex` meta tag
- **R3 — Short ID collision dù 8 char:** mitigation = retry up to 5 lần; nếu fail throw 500 (xác suất gần 0)
- **R4 — User share private location:** mitigation = không lưu lat/lng vào snapshot, chỉ lưu address chung
- **R5 — File >200 LOC ở page.tsx:** mitigation = split component con (SharedHeader, SharedRecCards) nếu cần

## Security Considerations
- Service-role only insert (RLS deny anon/authenticated)
- Public GET không expose owner_key (UI render không hiển thị)
- Body validation: Zod uuid
- CSRF: Next.js Server Actions/API route mặc định OK; check origin header nếu cần
- Snapshot không chứa user input nguyên văn (chỉ assistant message text)

## Next Steps
Sau Phase 4 → Phase 5 (Wave E Beta Deploy). Share link là feature mở khóa viral cho beta.
