# Codebase Summary — Food Discovery MVP

Generated: 2026-04-21 | Stack: Next.js 15 App Router + TS + Tailwind/shadcn + Supabase + Upstash Redis + OpenAI Responses API + Google Places (New)

---

## Directory Layout

```
food-discovery/
├── app/                        # Next.js 15 App Router
│   ├── api/                    # Route handlers
│   ├── auth/                   # Auth flows
│   ├── (app)/                  # Main layout pages
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Home/chat page
├── components/                 # React components (client + server)
├── hooks/                      # Client hooks
├── lib/                        # Utilities, services, middleware
├── supabase/migrations/        # DB schema
├── evals/                      # Evaluation suite (30 VI queries)
├── tests/                      # Vitest coverage
├── public/                     # Static assets, manifest
├── docs/                       # Documentation
├── plans/                      # Phase files + reports
├── instrumentation.ts          # OpenTelemetry setup
├── middleware.ts               # Auth + device-id middleware
└── [config files]             # tsconfig, tailwind, etc.
```

---

## API Routes (`app/api/`)

### Chat
- **`/api/chat` (POST)** — SSE stream. Accepts `{ messages, location?, context? }`. Pipe: resolve-identity → persist-conv → dispatch-tools (pass-1) → responses-runner (pass-2) → emit SSE events.

### Location
- **`/api/location/active` (GET)** — returns active location from conversation context.
- **`/api/location/ip` (GET)** — geolocate client by IP (uses ipapi.co).
- **`/api/location/search` (GET)** — text search + geocode (Nominatim). Query param `q=`. Rate-limited per session.
- **`/api/location/reverse` (GET)** — reverse geocode lat/lng. Rate-limited per session.

### Auth
- **`/api/auth/callback` (GET)** — OAuth2 callback (Supabase). Redirects to `?next=` (safeNext validated).
- **`/api/auth/merge-guest` (GET|POST)** — merge device_id guest data into authenticated user.

### History & Favorites
- **`/api/conversations` (GET|POST)** — list/create conversations.
- **`/api/conversations/[id]/messages` (GET)** — load messages + recommendations for a conversation.
- **`/api/favorites` (GET)** — load user's favorited places.
- **`/api/favorites` (POST)** — toggle favorite (with place snapshot).

### Admin
- **`/api/admin/stats` (GET)** — usage stats (24h window). Requires `x-admin-key` header.
- **`/api/health` (GET)** — health check (Supabase + Redis connectivity).

---

## Pages (`app/`, `app/[page]/page.tsx`)

| Page | Purpose |
|------|---------|
| `/` | Chat UI (main). Shows conversation thread, assistant messages with place cards, quick-chip prompts, location picker. |
| `/login` | OAuth sign-in form. Links to Supabase Auth. |
| `/history` | List past conversations. Click to load into chat. |
| `/favorites` | User's bookmarked places. |
| `/auth/callback` | OAuth redirect target. Merges guest data then redirects to `next=` or `/`. |
| `/admin/stats` | Admin dashboard (not in MVP; referenced in ops-runbook). |

---

## Components (`components/`)

### Chat Flow
- **`chat/chat-shell.tsx`** — main container. Holds MessageList + Composer.
- **`chat/message-list.tsx`** — scroll container for Message threads.
- **`chat/message-bubble.tsx`** — single message (user/assistant/system). Handles role-based styling.
- **`chat/assistant-message.tsx`** — assistant message with SSE streaming indicator.
- **`chat/restaurant-card.tsx`** — place recommendation card. Shows name, rating, distance, why_fits, favorite toggle, maps link.
- **`chat/typing-indicator.tsx`** — animated 3-dot loading.
- **`chat/composer.tsx`** — textarea input + send button. Auto-focus, submit on Shift+Enter.
- **`chat/quick-chips.tsx`** — preset prompt chips (mood, dietary, time, budget). One-click insertion.

### Location
- **`location/location-header.tsx`** — shows active location (lat/lng label).
- **`location/location-chip.tsx`** — "Change location" button.
- **`location/location-picker-sheet.tsx`** — sheet modal. Tabs: GPS, search, recent. Calls `/api/location/*` endpoints.

### Auth
- **`auth/login-form.tsx`** — login button → Supabase OAuth flow.

### History
- **`history/conversation-list-item.tsx`** — single conversation row (title, date, click to load).

### Favorites
- **`favorites/favorite-card.tsx`** — bookmarked place card. Swipe-to-remove on mobile.

### Error States
- **`error-states/*.tsx`** — components for API error, network error, no results, rate limit exceeded. Exported from `error-states/index.ts`.

### UI (shadcn Primitives)
- `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `sheet.tsx`, `skeleton.tsx`, `textarea.tsx`, `toast.tsx`, `toaster.tsx`.

### Onboarding
- **`onboarding-overlay.tsx`** — one-time walkthrough shown to first-time users. Dismissible.

---

## Hooks (`hooks/`)

| Hook | Purpose | Client/Server |
|------|---------|---------------|
| `use-chat-stream.ts` | Manages SSE streaming from `/api/chat`. Parses events, builds message state, handles errors & retry. 413 LOC. | Client |
| `use-active-location.ts` | Zustand store for active location (lat, lng, label). Persisted to localStorage. | Client |
| `use-favorites.ts` | Fetch favorites from `/api/favorites`. Watch for card toggles. | Client |
| `use-session.ts` | Read auth session from Supabase client. Returns `{ user, device_id }`. | Client |
| `use-toast.ts` | shadcn toast (notifications). Wrapper for `@/components/ui/toast`. | Client |

**Tech debt note:** `use-favorites` has N+1 fetch issue (one hook per card). Phase 9 refactor to Zustand store.

---

## Library Utilities (`lib/`)

### Chat Pipeline
- **`responses-runner.ts`** (390 LOC) — orchestrates 2-pass LLM:
  - Pass 1: `find_places` tool dispatch (weather, places, rule-filter).
  - Pass 2: structured output (place_id enum from filtered list).
  - Emits SSE events: `tool_start`, `tool_end`, `places_filtered`, `recs_delta`, `message_delta`, `done`, `error`.
  - **Tech debt:** C2 pass-2 `response_format` wrong shape; C3 open redirect in `safeNext`.

- **`dispatch-tools.ts`** — parse tool_calls, invoke tool handler, return result. Currently: `find_places`, `get_weather`, `get_geocode`.

- **`load-history.ts`** — fetch conversation + messages + recommendations from Supabase (service-role).

- **`persist-turn.ts`** — insert conversation, messages, recommendations into Supabase. Fire-and-forget on `/api/chat` exit.

- **`response-schema.ts`** — builds JSON Schema for pass-2 structured output. `place_id` enum constrained to filtered place IDs.

- **`system-prompt.ts`** — system message. VI-first tone instruction. Specifies 2-pass flow + tool constraints.

- **`persona-prompt-v2.ts`** — character prompt (persona for "food buddy"). Tuned for VI tone, casual+friendly.

- **`tool-schemas.ts`** — Zod + JSON Schema for tool arguments. `FindPlacesArgs`, `GetWeatherArgs`, `GetGeocodeArgs`.

- **`sse.ts`** — SSE encoding/decoding. `sseEncode(event, data)` → `data: <json>`, `parseSSE(text)` → `{ event, data }`.

### Tools
- **`tools/places.ts`** — Google Places Text Search API wrapper. Applies field masking, caching (10m TTL), budget guard.

- **`tools/weather.ts`** — Open-Meteo API wrapper. Current weather code + interpretation (rain, sunny, etc.). Cache 15m.

- **`tools/rule-filter.ts`** — post-filter Places results. Distance ≤10km, rating ≥3.5, reviews ≥10, optionally open_now. Returns top 5.

- **`tools/cache.ts`** — Upstash Redis client. `cacheThrough(key, ttl, producer)` pattern. Fallback to Supabase `places_cache` table.

- **`tools/errors.ts`** — error types: `UpstreamError`, `RateLimitError`, `CacheError`.

- **`tools/types.ts`** — shared TS interfaces: `Place`, `Weather`, `ToolResult`.

### Location
- **`location/nominatim.ts`** — reverse-geocode (lat/lng → address) + forward-geocode (query → lat/lng). Cache 24h. 5s timeout.

- **`location/ip-geolocate.ts`** — geolocate client IP via ipapi.co. Cache 1h.

- **`location/types.ts`** — `LatLng`, `GeoLocation` types.

### Auth
- **`auth/resolve-identity.ts`** — from request, resolve `{ ownerKey, deviceId, userId, isAuthenticated }`. Logic: auth.uid() OR x-device-id header.

- **`auth/device-id.ts`** — generate/read client device_id. Stored in localStorage.

- **`auth/safe-next.ts`** — validate redirect URL. Prevents open redirect. Checks: starts with `/`, not `//`, not `/\\`, not `http*`.

- **`auth/merge-guest-data.ts`** — after auth, move device_id guest rows → user.id. Idempotent. Updates: conversations, messages, recommendations, favorites, preferences.

- **`auth/rate-key.ts`** — extract rate-limit key from request. Fallback chain: session_id → device_id → IP.

- **`auth/supabase-middleware.ts`** — inject device_id header into Supabase requests (for RLS `current_owner_key()` resolution).

### Supabase
- **`supabase/server.ts`** — create authenticated Supabase client (server-side, uses cookies).

- **`supabase/client.ts`** — browser Supabase client (anon key, auth state provider).

- **`supabase/admin.ts`** — service-role Supabase client (unrestricted, for persistence/admin).

- **`supabase/database-types.ts`** — TypeScript types auto-generated from schema.

### Observability
- **`observability/usage-logger.ts`** — log turn to `usage_log` table (tokens, duration, places_calls, cache_hits, errors).

- **`observability/budget-guard.ts`** — daily Places API spend ceiling. Increments counter in Redis. Emits budget webhook if >80%.

- **`observability/scrub.ts`** — PII scrubbing for Sentry. Masks user inputs, location context.

- **`observability/sentry.ts`** — Sentry client init (server + client DSN). Rate limit 0.1 traces/errors.

### Config & Utilities
- **`env.ts`** — validated environment variables (Zod). Server-only secrets.

- **`env-public.ts`** — public (safe for client) env vars. Exported to `process.env`.

- **`logger.ts`** — structured logging. `log.info/warn/error(event, fields)` → Sentry + stdout.

- **`redis.ts`** — Upstash REST client initialization.

- **`sse-parser.ts`** — SSE stream parser. Handles multiline chunks.

- **`maps-deep-link.ts`** — generate Google Maps deep link from place_id.

- **`utils.ts`** — helpers: `cn()` (tailwind merge), `formatDistance()`, etc.

---

## Database (`supabase/migrations/`)

### 20260421000000_init.sql
Baseline schema:
- `conversations(id, owner_key, title, active_location, created_at, updated_at)`
- `messages(id, conversation_id, owner_key, role, content, tool_calls, usage, created_at)`
- `recommendations(id, message_id, owner_key, rank, place_id, snapshot, why_fits, created_at)`
- `favorites(id, owner_key, place_id, snapshot, created_at)`
- `preferences(owner_key, context, updated_at)` — user profile blob
- `places_cache(cache_key, payload, expires_at)` — persistent cache fallback

All tables have RLS enabled. `current_owner_key()` resolves auth.uid() OR x-device-id header.

### 20260428000000_usage_log.sql
Analytics table:
- `usage_log(id, ts, owner_key, conversation_id, model, input_tokens, output_tokens, tool_calls_count, places_calls, cache_hits, duration_ms, error_code)`
- Service-role only (deny-all RLS policy).

---

## Evaluations (`evals/`)

- **`queries-vi.json`** — 30 Vietnamese test queries. 6 dimensions × 5 variants:
  - Mood (hungry, picky, date night, lazy, adventurous)
  - Weather (rainy, sunny, hot, cold, windy)
  - Dietary (vegetarian, spicy, low-carb, seafood, picky ingredients)
  - Budget (under 50k, luxury, split bill, student, splurge)
  - Time (breakfast, lunch, dinner, late-night, quick)
  - Group (solo, couple, family, friend group, business)

- **`run-evals.mjs`** — Node.js script. POSTs each query to `/api/chat`, collects SSE stream, saves JSON results. Outputs to `evals/results/<date>/`.

- **`README.md`** — eval framework. Manual grading: grounded (Y/N), relevance (1-5), tone (1-5).

---

## Testing (`tests/`)

Vitest coverage (Node environment). Currently ~12 test files:
- **`chat/dispatch-tools.test.ts`** — tool_calls parsing + handler invocation.
- **`chat/response-schema.test.ts`** — schema building (enum guard logic).
- **`tools/places.test.ts`** — Google Places mocking + field masking.
- **`tools/weather.test.ts`** — Open-Meteo parsing + code mapping.
- **`tools/rule-filter.test.ts`** — filtering logic (distance, rating, reviews).
- **`tools/cache.test.ts`** — caching patterns.

**Coverage gaps:** responses-runner, persist-turn, load-history, ip-geolocate, resolve-identity (5 untested modules). Phase 9 backlog.

---

## Configuration

| File | Purpose |
|------|---------|
| `tsconfig.json` | Path aliases: `@/lib/*`, `@/components/*`, etc. strict mode. |
| `next.config.ts` | `instrumentation.ts` hook for OpenTelemetry init. `compress: false` for easier dev logs. |
| `vitest.config.ts` | Test runner config. Node environment. Mock Supabase + Redis. |
| `tailwind.config.ts` | shadcn defaults. Custom color palette (if any). |
| `components.json` | shadcn component registry. |
| `.eslintrc.json` | Next.js core rules. Allow `react/no-unescaped-entities`, `@typescript-eslint/no-unused-vars` with `^_` pattern. |
| `.prettierrc` | 100 char line, 2-space indent, Tailwind plugin. |
| `middleware.ts` | Inject device_id to headers. Set device_id cookie (1-year TTL) on first visit. |

---

## Tech Debt & Known Issues

**File size violations (>200 LOC, Phase 9 refactor):**
- `lib/chat/responses-runner.ts` (390 LOC) → split into orchestrator + event-emitter
- `hooks/use-chat-stream.ts` (413 LOC) → extract parser + state machine
- `app/page.tsx` (251 LOC) → split into components

**Critical bugs (Phase 9 or immediate fix):**
- C1: `recs_delta` double-JSON-encoded on wire → client can't parse
- C2: Pass-2 uses Chat Completions shape; Responses API expects `text.format` shape
- C3–C5: Security issues (open redirect, device_id hijack, admin key default)
- H1–H7: Rate limit, error leak, favorites N+1, AbortController missing, etc.

See `plans/reports/code-reviewer-260421-1347-food-discovery-mvp.md` for full list.

---

## Total Stats

- **TS/TSX files:** ~60
- **Components:** 30+
- **API routes:** 11
- **Hook implementations:** 5
- **Lib modules:** 41
- **Test files:** 12
- **DB migrations:** 2
- **Eval queries:** 30
