# ĂnGì — Eval Suite

Bộ công cụ đánh giá persona "food buddy" VI. 30 query cover 6 dimension.

## Cách chạy (VI)

1. **Khởi động dev server:**
   ```bash
   pnpm dev
   ```

2. **Chạy eval script** (cần Node 18+):
   ```bash
   node evals/run-evals.mjs --base=http://localhost:3000 --out=evals/results/20260421
   ```
   Kết quả lưu ở `evals/results/<date>/<id>.json`.

3. **Grade thủ công** — tạo file `evals/results/<date>.md` từ template bên dưới.

---

## How to run (EN)

1. Start dev server: `pnpm dev`
2. Run: `node evals/run-evals.mjs --base=http://localhost:3000`
   - Default output: `evals/results/<YYYYMMDD>/`
   - Override output dir: `--out=evals/results/my-run`
3. Manually grade using the template below.

---

## Scoring template

Create `evals/results/<date>.md` and fill in one row per query:

```markdown
# Eval Round — YYYY-MM-DD

## Grader: [your name]
## Model: [e.g. gpt-4o-mini]
## Prompt version: v1 / v2

| id | dimension | grounded | relevance (1-5) | tone (1-5) | notes |
|----|-----------|----------|-----------------|------------|-------|
| mood-01 | mood | Y | 4 | 5 | |
| mood-02 | mood | Y | 3 | 4 | Too generic |
| weather-01 | weather | Y | 5 | 4 | |
| ... | | | | | |

## Summary
- Grounded: X/30
- Relevance avg: X.X/5
- Tone avg: X.X/5
- Issues: [list dimension regressions]
- Next: [prompt changes for v2]
```

### Scoring rubric

**Grounded (Y/N)**
- Y = all recommended place_ids are from candidates list (no hallucinated names/ids)
- N = any fabricated venue name or id

**Relevance (1-5)**
- 5 = perfectly matches query dimension (dietary respected, budget correct, time appropriate, group size handled)
- 4 = mostly correct with minor gaps
- 3 = partially relevant, missed 1 key dimension
- 2 = barely relevant
- 1 = irrelevant or wrong language

**Tone (1-5)**
- 5 = vui tính, thân thiện, tự nhiên như bạn bè
- 4 = ok nhưng hơi cứng hoặc hơi dài
- 3 = đúng nghĩa nhưng flat, thiếu cá tính
- 2 = quá formal hoặc quá robot
- 1 = sai giọng, tiếng Anh chen, emoji quá nhiều

---

## Evaluation flow

```
Round 1 (v1 prompt) → grade manually → identify weak dimensions
→ write persona-prompt-v2.ts → Round 2 → confirm improvement
```

Target: ≥27/30 relevance ≥4/5, ≥27/30 tone ≥4/5, 30/30 grounded.

---

## Files

```
evals/
├── queries-vi.json      # 30 test queries (6 dimensions × 5)
├── run-evals.mjs        # Node script (plain ESM, no tsx needed)
├── README.md            # this file
└── results/
    ├── .gitkeep         # tracked; contents in .gitignore
    ├── 20260421/        # one folder per run date
    │   ├── _summary.json
    │   ├── mood-01.json
    │   └── ...
    └── 20260421.md      # manual grade notes
```
