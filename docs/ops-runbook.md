# Ops Runbook — food-discovery

Phiên bản: v1.1 Beta | Cập nhật: 2026-04-28

---

## 1. Places Budget Spike

**Triệu chứng:** Alert webhook "⚠️ Places budget 80%" kích hoạt sớm trong ngày;
`/api/admin/stats` → `places_calls` tăng bất thường.

**Kiểm tra:**
- Upstash console → key `places:budget:YYYYMMDD` → xem giá trị hiện tại.
- Sentry / logs → tìm `places.miss` burst từ một `owner_key` hay IP cụ thể.
- Xem liệu cache bị flush (Redis eviction hoặc TTL 10 min không đủ).

**Xử lý:**
1. Hạ `PLACES_DAILY_BUDGET_USD` tạm thời → redeploy → chặn thêm call.
2. Nếu do một user → block `owner_key` bằng cách thêm Redis deny-list (manual).
3. Sau 00:00 UTC counter reset tự động (TTL 48h).

---

## 2. OpenAI 5xx Burst

**Triệu chứng:** `chat.fail` errors tăng trong logs; Sentry `captureException` nhận nhiều
`UpstreamError`; users thấy "Não mình hơi đờ".

**Kiểm tra:**
- https://status.openai.com — xem incident hiện hành.
- Logs → `responses_runner.model_fallback` → model fallback có hoạt động không.
- `/api/admin/stats` → `errors.byCode.internal` tăng.

**Xử lý:**
1. Nếu model chính down → đặt `OPENAI_MODEL=gpt-4o-mini` → redeploy (fallback tự động đã có).
2. Nếu tất cả OpenAI down → không có workaround; thông báo user qua banner tĩnh.
3. Sau khi OpenAI phục hồi → revert `OPENAI_MODEL`.

---

## 3. Nominatim 429 Burst

**Triệu chứng:** `get_nominatim` / geocoding trả lỗi 429 trong logs; location search thất bại.

**Kiểm tra:**
- Log → `upstream_rate_limit` từ nominatim.
- Kiểm tra `NOMINATIM_USER_AGENT` có đúng format `app/version (email)` không (ToS yêu cầu).
- Xem có burst request nào từ client không (loop retry, spam click).

**Xử lý:**
1. Nominatim public có giới hạn 1 req/s — đảm bảo client debounce ≥ 500ms.
2. Nếu vẫn bị block → switch sang Photon API (tương thích Nominatim) hoặc Google Geocoding.
3. Thêm Redis cache cho geocode kết quả (TTL 1 ngày) để giảm calls.

---

## 4. Supabase Down

**Triệu chứng:** `persist_turn.unexpected_error` trong logs; usage_log không ghi được;
chat vẫn hoạt động (fire-and-forget) nhưng history mất.

**Kiểm tra:**
- https://status.supabase.com — xem incident.
- Supabase dashboard → project health → database connections.
- `/api/admin/stats` → trả `query_failed` (500).

**Xử lý:**
1. Chat vẫn hoạt động (persistence là best-effort) → không cần ngừng dịch vụ.
2. Nếu kéo dài → tắt `conversationId` flow (users bắt đầu conversation mới mỗi lần).
3. Sau khi Supabase phục hồi → không cần action; rows bị mất trong downtime không recover được.
4. Để phòng ngừa → bật Supabase Read Replicas (Pro plan) cho admin queries.

---

## 5. Sentry Alert Noise

**Triệu chứng:** Sentry inbox nhận hàng trăm event cùng loại; quota 5k/tháng gần hết.

**Kiểm tra:**
- Sentry → Issues → sort by "Events" → tìm issue chiếm nhiều nhất.
- Xem `tracesSampleRate` hiện tại (server: 0.1, client: 0.1).
- Kiểm tra có bug loop nào không (retry vô hạn, error trong error handler).

**Xử lý:**
1. Sentry UI → Issue → "Ignore" hoặc "Archive" issue đã biết + đang fix.
2. Nếu một loại lỗi spam → thêm `ignoreErrors` trong `Sentry.init` → redeploy.
3. Hạ `sampleRate` server xuống `0.1` tạm thời nếu quota sắp hết.
4. Đặt Sentry rate limit alert tại 80% quota (Settings → Alerts → Spike Protection).

---

## 5. Deploy Procedure

Xem chi tiết tại `docs/deployment-guide.md`. Quick reference:

```bash
# Preview
vercel deploy

# Smoke test preview URL: /, /api/health, /api/share, /admin/stats

# Promote
vercel deploy --prod
```

**Pre-deploy checklist:**
- [ ] `pnpm test` all pass (≥216 cases)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` no new violations
- [ ] DB migration applied (`supabase db push`)
- [ ] Env vars verified (`vercel env ls production`)

---

## 6. Rollback Procedure

Nếu deploy mới gây regression:

```bash
# Option A: CLI
vercel rollback https://<previous-deployment-url>

# Option B: Web dashboard
# Vercel → Deployments → [previous green deploy] → "Promote to Production"
```

**Khi nào rollback:**
- 5xx rate >5% trong 5 phút
- Sentry critical issue mới sau deploy
- /api/health red >2 lần trong 10 phút

**Sau rollback:**
1. Note rollback reason vào Sentry (tag deploy ID)
2. Tạo issue Github mô tả regression
3. Fix trên branch riêng + test trước khi re-deploy

---

## 7. Share Link Cleanup (Future)

Hiện chưa có TTL trên `shared_recommendations`. Khi DB approach 1M rows hoặc table size >1GB:

```sql
-- Clean shares >90 ngày
DELETE FROM shared_recommendations
WHERE created_at < NOW() - INTERVAL '90 days';
```

Setup pg_cron job sau khi scale lên 1k+ user. Beta scale OK không cleanup.
