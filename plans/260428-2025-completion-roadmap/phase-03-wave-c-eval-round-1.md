# Phase 3 — Wave C: Eval Round 1

**Priority:** High | **Status:** pending | **Effort:** 1 ngày | **Depends:** Phase 2

## Context Links
- Brainstorm: `plans/reports/brainstorm-260428-2025-completion-roadmap.md` §3.C
- Roadmap: `docs/development-roadmap.md` §9b.4
- Eval suite: `evals/queries-vi.json`, `evals/run-evals.mjs`, `evals/README.md`

## Overview
Chạy 30 VI test query qua `/api/chat`, manual grade 3 chiều (grounded, relevance, tone). Pass criteria: 30/30 grounded, ≥4.0/5 avg relevance + tone. Nếu fail → tinh chỉnh `persona-prompt-v2.ts` + Round 2.

## Key Insights
- Eval đã unblock vì C1, C2 đã fix trong Phase 9a → output JSON parseable, recommendations đúng schema
- 30 query covers 6 dimensions × 5 variants (mood, weather, dietary, budget, time, group)
- Manual grading do user (review viên VI fluent) — agent chỉ orchestrate run + tổng hợp report

## Requirements
- **Functional:** chạy 30 query, lưu JSON results, sinh markdown grading sheet
- **Non-functional:** reproducible (same query → same hash → cache check), no flaky failure
- **Pass criteria:**
  - Grounded: 30/30 (100% — không hallucinate place_id)
  - Relevance avg: ≥4.0/5 (≥27/30 score 4+)
  - Tone avg: ≥4.0/5 (≥27/30 score 4+)

## Architecture
- `evals/run-evals.mjs` đã có sẵn — kiểm tra signature
- Output dir: `evals/results/20260429/`
- Grading sheet: `evals/results/20260429/grading.md` (tự sinh từ template)

## Related Files

**Read:**
- `evals/run-evals.mjs`
- `evals/queries-vi.json`
- `evals/README.md`
- `lib/chat/persona-prompt-v2.ts`
- `lib/chat/system-prompt.ts`

**Modify (chỉ khi fail):**
- `lib/chat/persona-prompt-v2.ts` — tune tone/relevance
- `lib/chat/system-prompt.ts` — tune system instructions

**Create:**
- `evals/results/20260429/run-1/*.json` (per-query response)
- `evals/results/20260429/grading.md` (manual grading template)
- `evals/results/20260429/summary.md` (final pass/fail report)

## Implementation Steps

### Step 1 — Pre-flight check
- `pnpm dev` start server localhost:3000
- Smoke test 1 query manually trong browser → verify SSE works
- Check `.env.local` có OPENAI_API_KEY, GOOGLE_PLACES_API_KEY, SUPABASE_*, UPSTASH_*

### Step 2 — Run eval
```
node evals/run-evals.mjs --base=http://localhost:3000 --out=evals/results/20260429/run-1
```
- Watch console: 30 queries, expected ~2-5 phút (cache cold)
- Verify output: 30 JSON files, mỗi file có `recs[]` + `message`

### Step 3 — Sinh grading template
Tạo `evals/results/20260429/grading.md`:
```markdown
# Eval Round 1 — 2026-04-29

| # | Query | Grounded (Y/N) | Relevance (1-5) | Tone (1-5) | Notes |
|---|---|---|---|---|---|
| 1 | "Đói quá, gần Bách Khoa, dưới 50k" | | | | |
| 2 | ... | | | | |
...
```
Auto-fill cột Query từ `queries-vi.json`. User fill 3 cột còn lại.

### Step 4 — Manual grading (USER)
User mở từng JSON, đối chiếu với query, fill grading sheet.
- Grounded: place_id có thực trong filteredPlaces (không hallucinate)?
- Relevance: 5 quán có khớp mood/budget/time/dietary của query?
- Tone: VI có warm, idiomatic, không robot?

### Step 5 — Tổng hợp summary
Sinh `evals/results/20260429/summary.md`:
- Tổng query: 30
- Grounded count: X/30
- Relevance avg: X.X/5 (Y queries score ≥4)
- Tone avg: X.X/5 (Y queries score ≥4)
- Pass/Fail: dựa pass criteria

### Step 6 — Iterate (nếu fail)
Nếu Round 1 fail:
- Phân tích queries score thấp → identify pattern (tone too formal? relevance miss budget?)
- Tinh chỉnh `persona-prompt-v2.ts` + `system-prompt.ts`
- Run Round 2 → `evals/results/20260429/run-2/`
- Re-grade → summary
- Max 1 iterate (nếu Round 2 vẫn fail → escalate user, không loop)

## Todo List
- [ ] Step 1: pnpm dev + smoke test
- [ ] Step 2: run-evals.mjs --out=run-1
- [ ] Step 3: sinh grading.md template
- [ ] Step 4: USER manual grading (HUMAN-IN-LOOP)
- [ ] Step 5: summary.md
- [ ] Step 6: iterate persona prompt + Round 2 (chỉ khi fail)

## Success Criteria
- 30 JSON results đầy đủ
- grading.md fill complete
- summary.md show PASS criteria đạt
- Nếu Round 2 cần: persona prompt commit có message rõ ràng (eval-driven tune)

## Risk Assessment
- **R1 — Server local instability:** mitigation = restart dev server giữa runs nếu cache hỏng
- **R2 — Manual grading subjective:** mitigation = grading rubric trong `evals/README.md`; 1 reviewer thay vì 2 cho beta
- **R3 — Persona tune over-fitting:** mitigation = max 1 round, không tune đến khi pass
- **R4 — Places API quota cạn:** mitigation = check `budget-guard` trước, dừng nếu >50%

## Security Considerations
- Kết quả eval không chứa PII của user thật
- JSON results commit OK (không secret)

## Next Steps
Sau Phase 3 → Phase 4 (Wave D Share Link). Eval thành công xác nhận AI quality cho beta.
