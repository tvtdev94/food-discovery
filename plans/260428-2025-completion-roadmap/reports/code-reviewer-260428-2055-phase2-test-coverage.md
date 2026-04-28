# Code Review — Phase 2 Wave B Test Coverage

**Status:** APPROVED_WITH_CONCERNS
**Score:** 7.5/10

## Scope
- 5 test files, 1219 LOC total. 200/200 vitest pass, typecheck clean.
- Focus: assertion correctness, mock fidelity vs `lib/` impls, edge case coverage, flakiness, DRY, file size.

## Mock Fidelity vs Implementation
Verified against `lib/chat/runner/runner.ts`, `lib/chat/persist-turn.ts`, `lib/chat/load-history.ts`, `lib/auth/resolve-identity.ts`, `lib/location/ip-geolocate.ts`. All chainable Supabase mocks correctly mirror real call signatures (`.insert().select().single()`, `.update().eq().eq()`, `.select().eq().order().limit()`, `.select().eq().eq().maybeSingle()`). Pass1/Pass2 mock return shapes match `Pass1Result` / `Pass2*Result` types. No signature drift.

## Critical Issues
None blocking.

## Suggestions (non-blocking)

### File size violations (CLAUDE.md rule: ≤200 LOC)
- `tests/chat/runner/runner.test.ts` — 258 LOC
- `tests/chat/persist-turn.test.ts` — 334 LOC
- `tests/chat/load-history.test.ts` — 251 LOC
- `tests/location/ip-geolocate.test.ts` — 256 LOC

Suggested fix: extract Supabase mock factories into `tests/chat/__helpers__/mock-supabase.ts` (DRY both runner+persist+load-history). Each test file should drop ~40-60 LOC.

### DRY: dead code in persist-turn.test.ts
- `tests/chat/persist-turn.test.ts:25-69` — `createMockSupabaseClient` defined but **never called**. Each test inlines its own mock graph. Either delete the helper or refactor all 4 tests to use it.

### Tautological / weak assertions
- `tests/chat/persist-turn.test.ts:209` "handles recs insert error gracefully" — only asserts `result.conversationId === "conv-partial"`. Same value would return without error path. Suggested fix: verify `log.warn` called with `persist_turn.recs_error` key (`vi.mocked(log.warn).toHaveBeenCalledWith("persist_turn.recs_error", expect.anything())`).
- `tests/chat/persist-turn.test.ts:272` "fire-and-forget" — title implies caller-doesn't-await semantics, but test merely asserts `promise instanceof Promise` and awaits result. Not a fire-and-forget test. Either rename to "promise resolves successfully" or actually start the call without awaiting and verify caller can return early.

### Missing edge case coverage
- `tests/location/ip-geolocate.test.ts` — imports `UpstreamError` (line 16) but never tests the network-failure path (impl `lib/location/ip-geolocate.ts:45-49` throws `UpstreamError` on fetch reject). Suggested: add test where `global.fetch` rejects → expect `UpstreamError`.
- `tests/location/ip-geolocate.test.ts:21` describe says "AbortController" but no abort path is tested. Either remove "AbortController" from title or add a test asserting `fetch` receives an `AbortSignal`.
- `tests/chat/runner/runner.test.ts` — no test for `expandSearch` fallback (`filteredPlaces.length === 0` → impl runner.ts:70-83). Currently `expandSearch` mock returns `{ places: [], wasExpanded: false }` but the empty-places test (line 215) skips this branch because Pass1 returns 0 places and the mock doesn't expand. Worth one test where expand actually returns places.
- `tests/chat/runner/runner.test.ts` — no test for recs branch failure (impl runner.ts:126-129). Symmetric to the text-fail test would be nice.

### Misleading test names / metadata
- `tests/auth/resolve-identity.test.ts:41` — test name mentions "isAuthenticated fallback check" but `Identity` interface has no `isAuthenticated` field. Drop that phrase.
- `tests/chat/load-history.test.ts:131` — "RLS deny" is technically inaccurate: `supabaseAdmin()` uses service-role and bypasses RLS. Real check is the manual `owner_key` filter in conversations query (`load-history.ts:46`). Rename to "owner_key mismatch: conv lookup returns null → empty history".

### Minor: unused mock
- `tests/location/ip-geolocate.test.ts:12` — `vi.mock("@/lib/logger", () => ({}))` but impl uses `console.info` directly, not `log` from logger. Mock is harmless but confusing; can be removed.

### Fake timers without advancement
- `tests/location/ip-geolocate.test.ts:24` — `vi.useFakeTimers()` set but never advanced. The impl's 5s abort timeout never fires because mocked fetch resolves synchronously. Fine today, but if a future test resolves fetch slowly, the abort path would silently never trigger. Consider either removing fake timers (current tests don't need them) or adding one test that advances timers to verify the 5s abort guard.

## Positive Observations
- AbortSignal pass-through verified at `runner.test.ts:204-209` (real signal-identity check, not just truthy).
- Reverse-chronological → chronological ordering verified end-to-end at `load-history.test.ts:226-228`.
- Whitespace-trim edge cases for both `device-id` (`resolve-identity.test.ts:91`) and IP (`ip-geolocate.test.ts:186`).
- `Promise.allSettled` failure isolation for Pass-2 text branch correctly tested (`runner.test.ts:121-163`).
- `vi.clearAllMocks()` in every `beforeEach` — no cross-test state leakage.

## Flakiness Risk
Low. All async paths use mocked promises; no real network/timer/fs dependencies. `setImmediate` in `persist-turn.test.ts:326` is bounded.

## Metrics
- Mock fidelity: high (5/5 impls verified)
- Edge case coverage: 80% — gaps in UpstreamError, expandSearch, recs-branch failure
- File size compliance: 1/5 within 200 LOC limit
- DRY: 1 dead helper, 0 cross-file duplication

## Unresolved Questions
- Should test files be exempt from the 200-LOC rule? CLAUDE.md is silent. If yes, drop file-size suggestions.
- Is `createMockSupabaseClient` in `persist-turn.test.ts` intended to be reused across the 3 chat test files? If yes, lift to `tests/chat/__helpers__/`.

**Status:** DONE_WITH_CONCERNS
**Summary:** Tests pass, mocks faithful to impls. 4/5 files exceed 200 LOC; persist-turn has dead helper + 2 weak assertions; ip-geolocate missing UpstreamError coverage. None blocking, all addressable in <30 min.
