# Eval Round 1 Results — 2026-04-29

**Status:** ⚠️ INFRASTRUCTURE ISSUES FOUND — quality grading partial
**Test set:** 30 VI queries × 6 dimensions
**Provider:** SearchAPI.io (key mới sau quota reset)
**Location:** Hà Nội (lat 21.0285, lng 105.8542)

---

## Tổng quan kết quả

| Metric | Count | % |
|---|---|---|
| Total queries | 30 | 100% |
| ✅ OK with recs | 6 | 20% |
| ⚠️ OK empty (fallback message) | 16 | 53% |
| ❌ Errors | 8 | 27% |
| **All errors** | **timeout** | 100% |

**Avg latency:**
- All: 43.5s
- OK with recs: 51.8s (max — full pipeline)
- OK empty: 32s (skip pass-2 recs)

---

## Phân tích

### ✅ 6 queries có recs đầy đủ (chất lượng tốt)
`budget-02, group-04, mood-02, mood-03, mood-04, weather-04`

Sample (mood-03 — "cần an ủi sau ngày dài mệt mỏi"):
- 5 quán thật, đa dạng (Lẩu Cháo, Lẩu bò, NOM, Chả Cá, Phở bưng)
- why_fits có lý do cụ thể, tone warm VI
- Message text: "Tuyệt — mấy quán này chung vibe ấm áp..."

→ Khi pipeline work end-to-end, chất lượng AI cao.

### ⚠️ 16 queries OK-empty (fallback message)
Pattern: text stream completed nhưng `recommendations=[]`. Message thường:
> "Xin lỗi nhé, mình chưa tìm được quán phù hợp với tiêu chí hiện tại. Bạn thử đổi từ khóa sang..."

**Root cause hypothesis (chọn 1 hoặc cả 2):**
- Pass-2 structured output timeout/empty → recs=[] returned
- Rule-filter loại bỏ tất cả Places results (distance/rating/reviews threshold quá strict)

### ❌ 8 queries timeout
`budget-01, dietary-02, group-01, group-02, group-05, time-02, time-04, time-05`

Sample (budget-01): text message FULL nhưng `errorPayload.code=timeout`. Pass-2 text stream OK + Pass-2 recs structured TIMEOUT.

**Root cause:** Promise.allSettled timeout trên gpt-5-mini structured call. gpt-5-mini có thể chậm hơn gpt-4o cho structured output.

---

## Pass criteria check

| Criteria | Target | Actual | Verdict |
|---|---|---|---|
| Grounded | 30/30 (no hallucinated place_id) | 6/6 with-recs grounded | ✅ |
| Relevance avg ≥4.0/5 | ≥27/30 score 4+ | Cannot grade (24 queries empty/error) | ❌ Insufficient data |
| Tone avg ≥4.0/5 | ≥27/30 score 4+ | 6/6 with-recs tone OK; 16 ok-empty fallback message tone OK; errors có message OK | ⚠️ Partial — 22/30 message tone tốt |

**Verdict:** **FAIL** — không đủ data để grade quality. Infrastructure issue (timeout + rule-filter empty) chặn 80% queries.

---

## Recommendations

### Quick fixes (Phase 9b backlog)

1. **Tăng timeout pass-2 structured call** — hiện chắc 30s, nâng 60s
   - File: `lib/chat/runner/pass2-recs-structured.ts`
   - Test: re-run eval xem error rate giảm không

2. **Loosen rule-filter threshold tạm thời** — cho beta để có thêm signal
   - File: `lib/tools/rule-filter.ts`
   - Hiện: distance ≤10km, rating ≥3.5, reviews ≥10
   - Đề xuất: distance ≤15km, rating ≥3.0, reviews ≥5 cho fallback round

3. **Switch model** — fallback gpt-5-mini → gpt-4o-mini cho structured
   - File: `lib/env.ts` `OPENAI_MODEL` default
   - Trade-off: tone slightly worse, latency tốt hơn

### Long-term

4. **Round 2 eval** sau fix → re-grade 30 queries → manual rubric

5. **Spread query timing** — eval delay 30s/query để tránh load spike

---

## Snapshot 6 queries có recs (manual quality check)

| ID | Query | Recs | Tone | Notes |
|---|---|---|---|---|
| mood-02 | "vui vui đi ăn gì cho vui thêm" | 4 | ✅ | Celebratory tone |
| mood-03 | "cần an ủi sau ngày dài mệt mỏi" | 5 | ✅ | Empathetic, warm |
| mood-04 | "ăn gì chill xem phim tối nay" | 3 | ✅ | Casual evening |
| weather-04 | "mưa nhỏ ngại đi xa muốn ăn gần nhà" | 4 | ✅ | Local nearby |
| budget-02 | "muốn sang một chút hôm nay" | 2 | ✅ | Slightly upscale |
| group-04 | "gia đình có trẻ con đi ăn nhà hàng" | 4 | ✅ | Family-friendly |

→ Quality signal cao khi pipeline complete. Chất lượng prompt + persona OK.

---

## Unresolved Questions

1. Có nên tune timeout/threshold ngay trong session này không, hay defer Phase 9b?
2. Cần Round 2 eval sau fix không, hay chấp nhận "quality verified on 6/30 sample" cho beta?
3. Switch model sang gpt-4o-mini có làm tone xấu đi đáng kể không (cần A/B compare prompt)?
