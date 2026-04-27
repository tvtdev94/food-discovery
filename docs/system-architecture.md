# System Architecture — Food Discovery MVP

**Version:** 1.0 | **Last Updated:** 2026-04-21

---

## High-Level Sequence

```
User types in composer
          ↓
POST /api/chat { messages, location, context }
          ↓
resolve-identity (auth.uid OR device_id)
          ↓
Pass 1: dispatch-tools (SSE streaming)
  - emit tool_start → send request
  - invoke find_places: Google Places Text Search
    → apply rule-filter (distance ≤10km, rating ≥3.5, reviews ≥10)
    → emit places_filtered event
  - invoke get_weather: Open-Meteo current weather
  - invoke get_geocode: Nominatim location name
  - emit tool_end
          ↓
Pass 2: responses-runner
  - build response-schema (place_id enum from filtered list)
  - call OpenAI Responses API with structured output
  - parse JSON response: { assistant_message, recommendations[] }
  - emit recs_delta (recommendations) + message_delta (assistant text)
          ↓
persist-turn (async fire-and-forget)
  - insert conversation (if new)
  - insert messages + recommendations into Supabase
  - log usage_log (tokens, duration, cache hits)
          ↓
Client receives SSE stream
  - parse events
  - build assistant message with place cards
  - display streaming text + restaurant recommendations
```

---

## Data Model (ER Diagram — Text)

```
CONVERSATIONS (id, owner_key, title, active_location, created_at, updated_at)
    ↓ 1:N (conversation_id FK)
MESSAGES (id, conversation_id, owner_key, role, content, tool_calls, usage, created_at)
    ↓ 1:N (message_id FK)
RECOMMENDATIONS (id, message_id, owner_key, rank, place_id, snapshot, why_fits, created_at)

FAVORITES (id, owner_key, place_id, snapshot, created_at)
    └─ unique constraint: (owner_key, place_id)

PREFERENCES (owner_key [PK], context jsonb, updated_at)
    └─ user profile blob (dietary preferences, default cuisine, mood history)

PLACES_CACHE (cache_key [PK], payload jsonb, expires_at, created_at)
    └─ fallback persistent cache; primary is Upstash Redis

USAGE_LOG (id, ts, owner_key, conversation_id, model, input_tokens, output_tokens, 
           tool_calls_count, places_calls, cache_hits, duration_ms, error_code)
    └─ analytics; service-role only (no RLS for direct reads)
```

**Ownership Model:**
- `owner_key = auth.uid() OR x-device-id` (resolved by RLS function `current_owner_key()`)
- Guest users get a UUIDv4 `device_id` in localStorage + cookie (1-year expiry)
- On auth, `mergeGuestData(device_id, user.id)` moves all guest rows → user.id in a single call
- RLS policies enforce `owner_key = current_owner_key()` on all user data tables

---

## External Integrations & Cache Strategy

| Service | Endpoint | TTL | Cost | Rate Limit | Fallback |
|---------|----------|-----|------|-----------|----------|
| **Google Places (New)** | Text Search | 10m (Redis) | $32/1k calls | Budget guard (daily USD cap) | Cached results ("may be stale") |
| **Open-Meteo** | Current weather | 15m | Free | None enforced | Last cached value |
| **Nominatim** | Geocode (forward + reverse) | 24h | Free (ToS: ≤100/day reasonable) | 1 req/s per session | Cache-only or Mapbox (ENV flip) |
| **ipapi.co** | IP geolocation | 1h | Free tier ≤1k/day | None; enforce in app | Manual location picker |
| **Upstash Redis** | Session cache | Variable | $5/mo free tier | Depends on tier | Supabase `places_cache` table |
| **Supabase Auth** | OAuth + session | — | Free (pro: $25/mo) | Per-user rate limit | Fallback to anon mode (read-only) |
| **OpenAI Responses API** | gpt-5-mini | — | ~$0.15/1k tokens | Per-key limit | Fallback to gpt-4o-mini (ENV var) |

**Cache Hierarchy:**
1. Upstash Redis (L1, fast, warm)
2. Supabase `places_cache` table (L2, persistent fallback)
3. Upstream service (L3, live refresh)

---

## Rate Limiting Strategy

Rate limits are enforced per endpoint and reset daily at 00:00 UTC:

| Resource | Limit | Key | Enforcement |
|----------|-------|-----|-------------|
| **Chat session** | 1 msg/2s per user | `owner_key` | In-memory counter; reset on server restart |
| **Geocode (forward+reverse)** | 1 req/s per session | session_id \| device_id \| IP | Upstash Redis with 86400s TTL |
| **IP geolocation** | 1000/day per IP | client IP | Upstash Redis (proposal for Phase 9) |
| **Places API spend** | Daily USD budget | Redis counter `places:budget:YYYYMMDD` | Budget guard checks before call |
| **Login (IP-based)** | 5 attempts/15min | client IP | Supabase built-in |

**Rate limit key resolution:**
```
session_key = x-session-id (header) OR x-device-id (header/cookie) OR x-forwarded-for (IP)
```
Issue: Client-controlled headers can be rotated. Phase 9 hardens to prefer IP + apply two-limit strategy.

---

## SSE Event Catalog

During streaming, the server emits Server-Sent Events in this sequence:

```
event: tool_start
data: { "tool": "find_places", "query": "...pho..." }

event: tool_end
data: { "tool": "find_places", "places_found": 12 }

event: places_filtered
data: { "places": [ { id, name, address, rating, distance }, ... ] }

event: tool_start
data: { "tool": "get_weather", "at": "latitude,longitude" }

event: tool_end
data: { "tool": "get_weather", "weather": "rainy" }

event: recs_delta
data: { "assistant_message": "...", "recommendations": [ { place_id, why_fits }, ... ] }

event: message_delta
data: { "content": "...", "usage": { input_tokens, output_tokens } }

event: done
data: { "stop_reason": "end_turn" }
```

Or on error:
```
event: error
data: { "code": "rate_limited|internal|upstream_error", "message": "..." }
```

**Client parsing:** Each event is JSON. Parser collects full message before attachment. `recs_delta` payload is a JSON object (not double-encoded; C1 bug notes this is currently broken).

---

## Security & Compliance

### Row-Level Security (RLS)
All user data tables (`conversations`, `messages`, `recommendations`, `favorites`, `preferences`) have RLS enabled:
```sql
CREATE POLICY owner_policy ON table_name
FOR ALL USING (owner_key = current_owner_key())
WITH CHECK (owner_key = current_owner_key());
```

Where `current_owner_key()` is a Postgres function that returns:
```sql
COALESCE(auth.uid()::text, nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', ''))
```

Service-role queries MUST include explicit `.eq("owner_key", ...)` filter or risk permission bypass.

### Guest-to-User Merge
When a guest (device_id) logs in:
1. Auth flow redirects to `/api/auth/merge-guest?next=/`
2. Callback validates device_id from **cookie only** (not query param)
3. `mergeGuestData(deviceId, userId)` moves conversations, messages, recommendations, favorites → userId
4. Idempotent: re-running on same (device_id, user_id) is safe

**Current issue (C4):** Route accepts device_id from request body in POST; should only accept from HttpOnly cookie.

### PII Scrubbing for Sentry
Before sending errors to Sentry:
- Strip user message content (preserve structure, mask text)
- Strip location context (lat/lng → "location_present": true/false)
- Preserve error traces + stack frames

See `lib/observability/scrub.ts`.

### Structured Output Guard (`text.format`)
Pass-2 uses JSON Schema with `place_id` enum constrained to filtered places list. This prevents:
- Hallucinated restaurant names
- Invalid place_id values that would break Maps redirect
- Model creativity that breaks downstream parsing

**Current issue (C2):** Code uses Chat Completions shape; should use Responses API `text.format` shape.

### Safe Redirect Validation (`safe-next`)
Function validates redirect URL before use:
```typescript
function safeNext(next: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
```
Prevents: `//evil.com`, `/\\evil.com`, `http://evil.com`, etc.

**Current issue (C3):** Not applied consistently on all redirect endpoints.

---

## Observability & Monitoring

### Logging
Structured logs go to stdout + Sentry:
```typescript
log.info("event_name", { field1, field2, ... })
log.error("error_event", { err, context })
```

Key events:
- `chat.start` — new conversation started
- `chat.tool_*` — tool invocation (places, weather, geocode)
- `chat.fail` — chat error (LLM, upstream, parsing)
- `places.hit` / `places.miss` — cache efficiency
- `budget_guard.exceeded` — daily spend limit crossed
- `auth.merge_guest` — device_id → user_id migration
- `health.supabase` / `health.redis` — connectivity check

### Usage Logging
Fire-and-forget after chat completes. Inserts one row per turn:
```
usage_log {
  ts: now,
  owner_key,
  conversation_id,
  model: "gpt-5-mini",
  input_tokens,
  output_tokens,
  tool_calls_count,
  places_calls,
  cache_hits,
  duration_ms,
  error_code (if failed)
}
```

Enables: `/api/admin/stats` to compute P50/P95 latency, cache hit rate, error breakdown.

### Budget Guard
Tracks daily Places API spend in Redis:
```
Key: places:budget:YYYYMMDD
Value: integer (number of calls made)
TTL: 48h (survives midnight)
```

Before each `find_places` call:
1. Increment counter
2. If (counter * $0.032) > PLACES_DAILY_BUDGET_USD, reject call
3. On >80% threshold, POST to ALERT_WEBHOOK_URL with `{ type: "budget_warning" }`

---

## Error Handling Patterns

### Server-side
```typescript
try {
  // operation
} catch (err) {
  if (err instanceof RateLimitError) {
    // emit SSE error + 429
  } else if (err instanceof UpstreamError) {
    // emit SSE error + fallback response
  } else {
    log.error("event", { err })
    // emit generic "internal error" to client
  }
}
```

### Client-side (use-chat-stream)
```typescript
// On parse error or network error:
setError(err)
// User sees error banner (retry button)
// Retry logic: re-fetch `/api/chat` with same messages
```

### Fallback Behavior
- **Places:** Return cached results with "may be outdated" flag
- **Weather:** Omit weather context; retry pass-2 with reduced prompt complexity
- **Geocode:** Use rough IP-based location or manual picker
- **OpenAI:** Fallback to gpt-4o-mini (configured in ENV)

---

## Deployment Target

Currently architecture-neutral; tested on Node.js. Likely deployment:
- **Vercel:** Recommended. App Router native. Serverless by default.
- **Node Lambda (AWS, Google Cloud):** Routes require `export const runtime = "nodejs"` (no edge runtime for now due to long-running SSE streams).

Key constraint: SSE responses are long-lived (5–15s). Edge compute runtimes have shorter timeouts; full Node.js required.

---

## Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Chat TTI (Time-to-First-Byte) | <2.5s | Depends on Places latency |
| Grounded recommendations | 100% | Enforced by schema enum guard |
| P50 chat latency | <4s | Monitoring via usage_log |
| P95 chat latency | <8s | Monitoring via usage_log |
| Places cache hit rate | ≥60% | Upstash + persistent fallback |
| Lighthouse a11y | ≥95 | shadcn baseline + testing |
| Daily cost (1k turns) | Places <$40 + OpenAI <$3 | Caching + budget guard |

---

## Known Architectural Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Pass-2 Responses API shape bug** | Critical | Fix C2 before production deploy |
| **RCS_delta double-JSON-encoded** | Critical | Fix C1 before production deploy |
| **Open redirect on auth callback** | Critical | Fix C3 before production deploy |
| **Device_id hijack via body param** | Critical | Fix C4 before production deploy |
| **Admin key default in code** | High | Fix C5; require ADMIN_KEY env var |
| **Nominatim rate-limit DOS** | Medium | Enforce 1 req/s + fallback to Mapbox ENV flip |
| **Places budget spike (multi-turn abuse)** | Medium | Budget guard + IP-level block on next tier |
| **Supabase RLS policy bypass** | Medium | Integration test before deploy; code review RLS policies |
| **Missing AbortController on streams** | Medium | Fix H7; prevents zombie requests on nav |
| **Favorites N+1 fetch** | Low | Phase 9 refactor to Zustand store |

See full risk analysis in `plans/reports/code-reviewer-260421-1347-food-discovery-mvp.md`.
