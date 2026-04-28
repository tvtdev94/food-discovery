# Phase 1 — Wave A: Doc Reconciliation

**Priority:** High | **Status:** pending | **Effort:** 1-2h

## Context Links
- Brainstorm: `plans/reports/brainstorm-260428-2025-completion-roadmap.md`
- Source: `docs/development-roadmap.md`, `docs/project-changelog.md`, `docs/codebase-summary.md`

## Overview
Cập nhật 3 docs để phản ánh trạng thái thực tế của codebase. C1-C5 và H1-H7 đã fix nhưng chưa được ghi nhận. `responses-runner.ts` đã split thành 6 module nhưng codebase-summary còn ghi monolith.

## Key Insights
- Bug status tổng hợp xác nhận trong brainstorm report §2
- Phase 9a, 9c, 9d, 9e đã include các fix dạng phụ
- Không có code change ở phase này — chỉ doc

## Requirements
- Functional: docs đồng bộ với code
- Non-functional: rõ ràng, dễ tra cứu, link nội bộ valid

## Architecture
N/A — pure doc update

## Related Files
**Modify:**
- `docs/development-roadmap.md` — đánh dấu C1-C5, H1-H6 (H7 đã ghi) là DONE; thêm Phase 9b completion entry
- `docs/project-changelog.md` — thêm entry "Phase 9b Bug Fixes" + "Phase 9b Hardening"
- `docs/codebase-summary.md` — refactor mục `lib/chat/` để phản ánh `lib/chat/runner/` 6 module mới

**Read:**
- `lib/chat/runner/runner.ts`
- `lib/chat/runner/pass1-tool-loop.ts`
- `lib/chat/runner/pass2-recs-structured.ts`
- `lib/chat/runner/pass2-text-stream.ts`
- `lib/chat/runner/runner-helpers.ts`
- `lib/chat/runner/runner-openai-client.ts`
- `lib/chat/runner/runner-types.ts`
- `lib/chat/runner/speculative-fetch.ts`
- `lib/chat/runner/expand-search.ts`

## Implementation Steps

### Step 1 — Update development-roadmap.md
Trong section "Phase 9b: Post-MVP Hardening & Fixes":
- Thêm header: "**Status: ✅ Complete** (verified 2026-04-28 — fixes shipped during Phase 9a/9c refactor cycle)"
- Mỗi entry C1-C5: thêm "✅ FIXED" + file path + commit/phase reference
- Mỗi entry H1-H6: thêm "✅ FIXED" + file path
- H7 đã có "✅ FIXED" — giữ nguyên

### Step 2 — Append to project-changelog.md
Tạo entry mới date 2026-04-28:
```
## 2026-04-28 — Phase 9b Hardening Verification
- Verified C1 (recs_delta encoding) fixed in pass2-recs-structured.ts:116
- Verified C2 (Pass-2 API shape) — text:{format} pattern in callResponsesCreate
- Verified C3 (open redirect) — safeNext applied in app/auth/callback/route.ts
- Verified C4 (device_id hijack) — cookie-only with mismatch validation
- Verified C5 (ADMIN_KEY default) — required .min(16), no default
- Verified H1-H6 — see development-roadmap.md
- Doc sync only; no code changes.
```

### Step 3 — Refactor codebase-summary.md
Thay section `### Chat Pipeline`:
- XÓA: `responses-runner.ts (390 LOC) — orchestrates 2-pass LLM`
- THÊM section mới `### Chat Runner (lib/chat/runner/)`:
  ```
  - runner.ts — orchestrator; kicks Promise.allSettled(pass2-text-stream, pass2-recs-structured)
  - pass1-tool-loop.ts — tool dispatch loop (find_places, get_weather, get_geocode)
  - pass2-recs-structured.ts — structured JSON output with place_id enum guard
  - pass2-text-stream.ts — VI text streaming (parallel with recs)
  - runner-openai-client.ts — Responses API client wrapper
  - runner-helpers.ts — extractTextFromMessage, etc.
  - runner-types.ts — shared TS interfaces
  - speculative-fetch.ts — heuristic-based parallel findPlaces (Wave 2D)
  - expand-search.ts — fallback when filtered results <3
  ```
- Update Tech Debt section: xóa `responses-runner.ts (390 LOC)` violation entry
- Update Total Stats: `Lib modules` count

### Step 4 — Verify
- Đọc lại 3 docs đảm bảo internal links + section heading đồng nhất
- Grep `responses-runner.ts` còn xuất hiện ngoài note "split history" không

## Todo List
- [ ] Step 1: development-roadmap.md — mark C1-C5, H1-H6 as ✅ FIXED
- [ ] Step 2: project-changelog.md — append 2026-04-28 entry
- [ ] Step 3: codebase-summary.md — replace responses-runner section với runner/ split
- [ ] Step 4: verify links + grep check

## Success Criteria
- 3 docs updated, không còn nhắc bugs là pending
- `grep -r "responses-runner.ts" docs/` chỉ ra mention historical/migration
- Markdown render OK (no broken links)

## Risk Assessment
- **R1 — Outdated info bị bỏ sót:** mitigation = grep check trên `Phase 9b`, `C1`-`C5`, `H1`-`H7` ở 3 docs

## Security Considerations
N/A

## Next Steps
Sau Phase 1 → Phase 2 (Wave B test coverage), có thể parallel
