---
name: completion-roadmap
status: pending
created: 2026-04-28
updated: 2026-04-28
blockedBy: []
blocks: []
---

# Plan: Hoàn thiện Food Discovery sau MVP

**Source:** `plans/reports/brainstorm-260428-2025-completion-roadmap.md`
**Scope:** 5 wave, ~9 ngày work | **Scale target:** Beta 10-100 user

## Mục tiêu
Đưa Food Discovery từ trạng thái "MVP đã build xong, doc lệch thực tế" thành "production-ready beta" thông qua doc reconciliation, test coverage, AI eval, share link feature, và deploy prep.

## Bối cảnh quan trọng
- Tất cả critical bugs (C1-C5) và high-priority issues (H1-H7) **đã fix âm thầm** trong Phase 9a refactor
- `docs/development-roadmap.md` chưa update → gây hiểu lầm
- 4 module chưa có test (responses-runner orchestrator, persist-turn, load-history, resolve-identity, ip-geolocate)
- Eval Round 1 chưa chạy (đã unblock vì C1, C2 fixed)
- Share link là feature duy nhất user duyệt thêm cho beta

## Phase Overview

| # | Wave | File | Effort | Depends |
|---|---|---|---|---|
| 1 | A — Doc Reconciliation | [phase-01-wave-a-doc-reconciliation.md](phase-01-wave-a-doc-reconciliation.md) | 1-2h | — |
| 2 | B — Test Coverage | [phase-02-wave-b-test-coverage.md](phase-02-wave-b-test-coverage.md) | 2-3 ngày | — (parallel A) |
| 3 | C — Eval Round 1 | [phase-03-wave-c-eval-round-1.md](phase-03-wave-c-eval-round-1.md) | 1 ngày | B |
| 4 | D — Share Link | [phase-04-wave-d-share-link.md](phase-04-wave-d-share-link.md) | 2-3 ngày | A,B |
| 5 | E — Beta Deploy | [phase-05-wave-e-beta-deploy.md](phase-05-wave-e-beta-deploy.md) | 1 ngày | A,B,C,D |

## Critical Path
```
A (docs)  ─┐
           ├──→ C (eval) ──→ E (deploy)
B (tests) ─┘                ↑
           └──→ D (share) ──┘
```
A + B có thể chạy song song. D phụ thuộc B (test patterns). E là wave cuối cùng.

## Constraints
- **File size:** ≤200 LOC mỗi file
- **TypeScript strict:** 0 errors
- **ESLint:** 0 violations
- **Vitest:** ≥160 cases pass (149 baseline + ~15 mới)
- **Eval pass:** grounded 30/30, relevance avg ≥4.0/5, tone avg ≥4.0/5
- **Vercel build:** success
- **Beta scale:** 10-100 user (không cần load test)

## Out of Scope
- Map view (đã chốt bỏ — tốn API)
- Voice input (Phase 13 deferred)
- Reservations (Phase 11 deferred)
- Multi-city (Phase 14 deferred)
- Load testing >1k user
- File-size refactor `app/page.tsx`

## Dependencies
- Supabase project + service-role key (deploy)
- Upstash Redis (rate limit + cache)
- OpenAI Responses API gpt-5-mini
- Google Places API key + budget cap
- Vercel account + domain (Wave E)
- Sentry DSN (Wave E)

## Success Criteria
- [ ] Wave A: docs đồng bộ với code, changelog có Phase 9b complete entry
- [ ] Wave B: vitest ≥160 pass, coverage chat/auth ≥80%
- [ ] Wave C: 30 VI queries graded, pass criteria đạt hoặc Round 2 đạt
- [ ] Wave D: `/api/share` + `/s/[shortId]` working, OG meta render đúng
- [ ] Wave E: Vercel preview live, admin dashboard accessible, uptime monitor active
