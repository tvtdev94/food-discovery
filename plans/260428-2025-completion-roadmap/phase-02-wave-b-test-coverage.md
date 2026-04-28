# Phase 2 — Wave B: Test Coverage cho 5 module

**Priority:** High | **Status:** pending | **Effort:** 2-3 ngày

## Context Links
- Brainstorm: `plans/reports/brainstorm-260428-2025-completion-roadmap.md` §3.B
- Roadmap: `docs/development-roadmap.md` §9b.3
- Existing patterns: `tests/chat/dispatch-tools.test.ts`, `tests/chat/response-schema.test.ts`, `tests/api/chat/prewarm-route.test.ts`

## Overview
Bổ sung unit test cho 5 module hiện chưa cover. Target ≥160 vitest cases pass total (149 baseline + ~15 mới). Coverage chat pipeline + auth ≥80%.

## Key Insights
- `responses-runner.ts` đã split thành 6 module trong `lib/chat/runner/`; pass1-tool-loop, pass2-text-stream, pass2-recs-structured, runner-orchestrator đã có test → chỉ thiếu `runner.ts` orchestrator full-flow + speculative-fetch (đã có test 1 phần)
- Mock pattern: vi.mock cho `@/lib/supabase/admin` + `@/lib/redis` đã có sẵn trong `tests/chat/cache.test.ts`
- `persist-turn.ts` là fire-and-forget → test phải resolve Promise trước khi assert

## Requirements
- **Functional:** Mỗi module ≥3 test case (happy path, error path, edge case)
- **Non-functional:** Vitest run <3s; no flaky test; mock không leak giữa test
- **Coverage:** chat pipeline + auth modules ≥80% line coverage

## Architecture
- Mock layer: `vi.mock('@/lib/supabase/admin')`, `vi.mock('@/lib/redis')`, `vi.mock('@/lib/chat/runner/runner-openai-client')`
- Helper: `tests/__mocks__/supabase-mock.ts` (nếu cần factory chung)

## Related Files

**Create (test files):**
- `tests/chat/runner/runner.test.ts` — orchestrator end-to-end với mocked OpenAI + Places
- `tests/chat/persist-turn.test.ts` — conversation creation, message + recs insertion, fire-and-forget
- `tests/chat/load-history.test.ts` — message fetch with RLS check, pagination
- `tests/auth/resolve-identity.test.ts` — auth.uid OR device_id resolution, fallback chain
- `tests/location/ip-geolocate.test.ts` — IP lookup + cache hit/miss + AbortController

**Read for context:**
- `lib/chat/runner/runner.ts`
- `lib/chat/persist-turn.ts`
- `lib/chat/load-history.ts`
- `lib/auth/resolve-identity.ts`
- `lib/location/ip-geolocate.ts`
- Existing tests: `tests/chat/dispatch-tools.test.ts`, `tests/api/chat/prewarm-route.test.ts`

## Implementation Steps

### Step 1 — runner.test.ts (orchestrator)
Test cases:
- happy path: 1 user message → tool call → places filtered → recs_delta + message_delta + done events emitted in order
- error path: OpenAI throws → emits "error" event với code; persist không crash
- abort path: AbortSignal aborted mid-stream → no further events emitted
- empty places: filteredPlaces=[] → emits recs_delta with empty array, message_delta still works

### Step 2 — persist-turn.test.ts
Test cases:
- happy path: insert conversation + messages + recs, return inserted IDs
- existing conversation: update conversation.updated_at, append messages
- partial failure: messages OK but recs fail → log error, don't throw
- fire-and-forget: caller doesn't await; verify Promise resolves eventually

### Step 3 — load-history.test.ts
Test cases:
- happy path: load 1 conversation + 5 messages + 3 recs với owner_key match
- RLS deny: owner_key mismatch → return null
- empty conversation: 0 messages → return [] not error
- pagination: limit=10, return ≤10 messages

### Step 4 — resolve-identity.test.ts
Test cases:
- authenticated: auth.uid present → returns userId, isAuthenticated=true
- guest: x-device-id header → returns deviceId, isAuthenticated=false
- both present: prefer userId (auth wins)
- neither present: throws or returns null (per current behavior)

### Step 5 — ip-geolocate.test.ts
Test cases:
- happy path: ipapi.co success → returns lat, lng, label
- cache hit: 2nd call same IP → no fetch, return cached
- timeout: AbortController fires at 5s → throws IpGeolocateRateLimitError or returns null
- malformed response: missing lat → returns null

### Step 6 — Verify
- `pnpm test` → all green ≥160 cases
- `pnpm typecheck` → 0 errors
- `pnpm lint` → 0 violations
- Tests <3s wall clock

## Todo List
- [ ] Step 1: tests/chat/runner/runner.test.ts (4 cases)
- [ ] Step 2: tests/chat/persist-turn.test.ts (4 cases)
- [ ] Step 3: tests/chat/load-history.test.ts (4 cases)
- [ ] Step 4: tests/auth/resolve-identity.test.ts (4 cases)
- [ ] Step 5: tests/location/ip-geolocate.test.ts (4 cases)
- [ ] Step 6: pnpm test + typecheck + lint all pass

## Success Criteria
- ≥160 vitest cases pass (target 169 = 149 + 20 new)
- 0 type errors, 0 lint errors
- No flaky test (run 3x liên tiếp đều pass)

## Risk Assessment
- **R1 — Mock complexity Supabase chained calls:** mitigation = follow `dispatch-tools.test.ts` pattern, build `mockChain()` helper if needed
- **R2 — fire-and-forget timing flake:** mitigation = test exposes Promise reference, `await` it explicitly
- **R3 — file >200 LOC:** mitigation = split per scenario nếu vượt

## Security Considerations
- Mock không expose real keys
- Test data dùng UUID giả không trùng với prod IDs

## Next Steps
Sau Phase 2 → Phase 3 (Wave C eval) — eval sẽ chạy với code đã được test bao bọc
