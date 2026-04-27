# Project Overview & PDR — Food Discovery MVP

**Version:** 1.0 | **Last Updated:** 2026-04-21 | **Status:** Completed Phase 0–8, Entering Phase 9

---

## Problem Statement

Vietnamese mobile users struggle to answer "Hôm nay ăn gì?" (What should I eat today?).

**Current friction:**
- Existing apps (Google Maps, Zalo, Grab) require explicit filtering (cuisine, price, rating) — slow cognitive load
- Food discovery is serendipitous, not personalized; recommendations are generic ("popular nearby")
- Language barrier: most reviews in English; VI users want VI-first experience
- No lightweight mobile web option; app stores are gatekeepers

**Market insight:** Vietnam has 35M smartphone users, 90% mobile-first. Messaging apps (Zalo, WhatsApp) dominate; lightweight web PWAs solve adoption friction.

---

## Target User

**Primary:** Vietnamese mobile users, ages 18–35, urban (Hà Nội, Sài Gòn, Đà Nẵng)

**Characteristics:**
- Comfortable with English but prefer VI
- Meal decisions are contextual (mood, budget, time, group size, weather, dietary restrictions)
- Use Google Maps for navigation; Zalo for social; want a single "food mood" assistant
- High mobile internet usage; moderate data plans (prefer lightweight)

**Use cases:**
- Solo lunch: "Bận công việc, không có thời gian. Ăn gì nhanh mà ngon?" → Pho, com tam, banh mi recommendations
- Date night: "Hẹn bạn tối nay lúc 7, budget 300k, tìm quán lãng mạn gần Hoan Kiem" → Romantic restaurants with reviews
- Rainy day: "Trời mưa, lười đi xa. Quán nào gần mà che mưa được?" → Indoor restaurants nearby
- Adventurous: "Muốn thử cái gì mới hôm nay" → Trending places with user explanations

---

## MVP Scope (In)

### Features Delivered (Phases 1–8)

1. **Chat-based food discovery**
   - VI-first persona ("food buddy" tone)
   - Type mood/budget/dietary → receive 5 grounded restaurant recommendations
   - Real-time reason why each place fits ("Quán pho nóng hổi, open late, cách bạn 1.2km")

2. **2-Pass AI Ranking**
   - Pass 1: Rules engine (distance ≤10km, rating ≥3.5, reviews ≥10, optionally open_now)
   - Pass 2: LLM personalization (why_fits explanations, tone check, context awareness)
   - Place_id enum guard prevents hallucinated venues

3. **Real Venue Data**
   - Google Places Text Search API integration
   - 5-field subset: name, address, rating, review count, opening hours
   - Caching reduces API cost (10m TTL, 60%+ hit rate target)

4. **Location Services**
   - GPS geolocation (browser Geolocation API)
   - IP-based fallback (ipapi.co)
   - Manual location search (Nominatim geocode)
   - Reverse geocode for location label ("District 1, HCMC")

5. **Conversation History**
   - Persist chats in Supabase
   - Load past conversations
   - Message + recommendation threads (for context re-use)

6. **Favorites/Bookmarking**
   - Save favorite places
   - Favorite list page
   - Quick access from restaurant cards

7. **Guest Mode → Auth Flow**
   - No signup friction: guest users get device_id, can explore freely
   - Optional Supabase OAuth (Google, GitHub)
   - Seamless merge: device_id history carries over on login
   - No lost context or double-entry

8. **Mobile-First UI**
   - Responsive design (iPhone 12–14, Android flagships)
   - PWA manifest + installable home screen
   - Tailwind + shadcn/ui component library

9. **Observability & Ops**
   - Structured logging (Sentry integration)
   - Daily usage analytics (tokens, latency, cache metrics)
   - Budget guard (prevent runaway Places API spend)
   - Admin stats dashboard (`/api/admin/stats`)
   - Ops runbook for on-call (troubleshooting guide)

---

## MVP Scope (Out)

**Explicit deferral to post-MVP phases:**

- **Map view** — Google Maps embed with place markers (Phase 10)
- **Reservations** — OpenTable / Momo booking integration (Phase 11)
- **URL sharing** — Share recommendations via link, track clicks (Phase 12)
- **Voice input** — "Hôm nay ăn gì?" voice query (Phase 13)
- **Multi-city** — Switch between HN, SG, DN, etc. (Phase 14+)
- **Place details** — Reviews, photos, menu images (requires Place Details API, +$0.01/call)
- **Advanced filters** — Price level dropdown, type-based search, custom radius
- **Social features** — Reviews, likes, user profiles (Phase TBD)
- **Offline mode** — Cached results for no-internet scenarios (Phase TBD)

---

## Success Metrics

### Functional Metrics
| Metric | Target | Owner | Measurement |
|--------|--------|-------|-------------|
| **Recommendations grounded** | 100% | Evals | 30/30 test queries return real place_ids only |
| **Relevance (avg)** | ≥4.0/5 | Evals | Manual grade across mood, dietary, time, budget, weather, group dimensions |
| **Tone (avg)** | ≥4.0/5 | Evals | VI-first, casual+friendly, not robotic |
| **Relevance misses** | ≤3/30 | Evals | Max 3 queries with score <4 (triggers prompt v2 iteration) |
| **Tone misses** | ≤3/30 | Evals | Max 3 queries with score <4 |

### Performance Metrics
| Metric | Target | Owner | Measurement |
|--------|--------|-------|-------------|
| **TTI (Time-to-First-Byte)** | <2.5s | Ops | `usage_log` aggregation, P50 |
| **P50 chat latency** | <4s | Ops | user sees "done" event <4s median |
| **P95 chat latency** | <8s | Ops | 95th percentile |
| **Places cache hit rate** | ≥60% | Ops | `cache_hits / (cache_hits + places_calls)` daily |
| **Lighthouse a11y** | ≥95 | QA | Automated Lighthouse score (mobile) |

### Cost & Efficiency Metrics
| Metric | Target | Owner | Measurement |
|--------|--------|-------|-------------|
| **Places API cost (1k turns)** | <$40/day | Ops | Budget guard daily counter |
| **OpenAI cost (1k turns)** | <$3/day | Ops | usage_log token aggregation × rate |
| **Supabase cost** | <$5/mo | Ops | Free tier (500k row capacity) |
| **Upstash Redis cost** | <$5/mo | Ops | Free tier (1GB) |
| **Daily budget alert** | >80% threshold | Ops | Webhook POST to ALERT_WEBHOOK_URL |

### Reliability Metrics
| Metric | Target | Owner | Measurement |
|--------|--------|-------|-------------|
| **Uptime** | ≥99.5% | Ops | Sentry error rate <0.5% |
| **Critical bug count** | 0 | QA | All C1–C5 fixed before deploy |
| **High-priority issues** | <3 unfixed | QA | H1–H7 resolved in Phase 9 |
| **Test coverage** | ≥80% critical paths | QA | Vitest suite + integration tests |

---

## Non-Functional Requirements

### Security
- **RLS enforcement:** All user data behind Supabase RLS policies (owner_key checks)
- **OAuth2 flow:** Supabase Auth (Google, GitHub) with safe redirect validation
- **Device_id security:** UUIDv4, HttpOnly cookie, merge requires auth
- **PII scrubbing:** User inputs + location masked before Sentry
- **Rate limiting:** Geocode 1 req/s, chat per-user per-IP, Places daily budget
- **API key rotation:** OPENAI_API_KEY, GOOGLE_PLACES_API_KEY managed in env (never in code)

### Performance
- **Bundle size:** <150 KB gzipped (Next.js optimized, tree-shaken deps)
- **Latency budgets:** TTI <2.5s, P50 <4s, P95 <8s (measured from start of SSE)
- **Cache strategy:** L1 Upstash (warm), L2 Supabase (fallback), L3 upstream
- **Connection pooling:** Supabase + Upstash clients configured for persistent connections

### Reliability
- **Fallback behavior:** Cached results if upstream fails, graceful degradation
- **Error handling:** Structured errors sent to client (no internal details leaked)
- **Logging:** Structured JSON to stdout (Sentry picks up in prod)
- **Health checks:** `/api/health` monitors Supabase + Redis connectivity

### Accessibility
- **WCAG 2.1 AA:** Screen reader support, keyboard navigation, color contrast
- **Mobile-first:** Touch targets ≥44px, responsive to viewport
- **Inclusive language:** VI + EN, no slang that excludes

### Compliance
- **Data residency:** Supabase free tier (likely US region); document for GDPR
- **Nominatim ToS:** User agent includes contact email per policy
- **Google Places ToS:** Field masking applied (no unnecessary data fetch)
- **OpenAI terms:** Content filtering enabled, no fine-tuning of user data

---

## Technical Constraints

### Architecture
- **Runtime:** Node.js (SSE streams require long-lived connections; edge compute unsuitable)
- **Framework:** Next.js 15 App Router (TypeScript enforced)
- **Database:** Supabase (PostgreSQL with RLS)
- **Cache:** Upstash Redis (free tier ≥1GB, reasonable concurrency)
- **LLM:** OpenAI Responses API (gpt-5-mini primary, gpt-4o-mini fallback)
- **Maps:** Google Places API (New) Text Search only

### Integration Dependencies
- **Stable:** Supabase Auth, Google Places, Open-Meteo, Upstash REST API
- **Fragile:** Nominatim (public free tier, subject to rate limiting)
- **New:** OpenAI gpt-5-mini (availability, latency, cost TBD post-launch)

### Scalability Limits
- **Free tier ceiling:** ~500 daily active users (Places: ~100 searches/day × $0.032 = $3.20, within $5 budget)
- **Supabase free:** 500k row capacity; current ~10k rows, 50x headroom
- **Upstash free:** 1GB storage + unlimited API calls; no enforcement monitored post-launch
- **Vercel:** Serverless, auto-scales; watch cold start latency at scale

---

## Risks & Mitigations

| Risk | Severity | Likelihood | Impact | Mitigation |
|------|----------|-----------|---------|-----------|
| **gpt-5-mini unavailable** | Critical | Low | Entire ranking fails | Fallback to gpt-4o-mini via ENV var (cost +10%) |
| **Critical bugs in pass-2** | Critical | Medium | No recs render (C1, C2) | Fix Phase 9 before prod; automated tests |
| **Open redirect exploits** | Critical | Medium | Phishing vector (C3) | Apply safeNext validator; security review |
| **Device_id hijack** | Critical | Low | Account takeover (C4) | Accept device_id from cookie only; fix Phase 9 |
| **Places API outage** | High | Low | No search results | Cache-only fallback ("data may be outdated") |
| **Nominatim rate-limit** | High | Medium | Geocode fails | Fallback to IP geo; ENV flip to Mapbox |
| **Budget spike abuse** | High | Low | $200+ bill on day 1 | Daily budget guard + IP-level block next tier |
| **iOS geolocation gesture** | Medium | Medium | Mobile users can't share location | Manual zip/address input fallback |
| **Supabase RLS bypass** | High | Low | Data leak across users | Integration tests before deploy; code review |
| **Safari in-app browser OAuth** | Medium | Medium | iOS app users blocked from login | Deeplink to Safari instead of in-app browser |
| **Eval round 1 fails** | Medium | Medium | Prompt tuning delay | Iterate persona-prompt-v2, Round 2, ship v0.1.1 |

---

## Timeline & Resources

### Phases Completed (2026-04-21)
- **Phase 0:** Brainstorm & plan (1 day)
- **Phases 1–8:** MVP build (same day, parallel agents)
  - Bootstrap, location, tools, chat API, UI, auth, polish, observability

### Phase 9 Roadmap (2026-04-22+)
- **P0 critical bugs:** C1–C5 fixes (1 day)
- **Test coverage:** 5 untested modules (1 day)
- **Eval round 1:** 30 VI queries (1 day)
- **High-priority fixes:** H1–H7 (1–2 days)
- **Load testing + hardening:** 1 day
- **Total Phase 9:** ~5–6 days

### Production Readiness (2026-04-27 estimated)
- All critical + high-priority issues resolved
- Eval metrics pass (grounded 100%, relevance ≥4.0, tone ≥4.0)
- Security review + RLS integration tests
- Deployed to staging, load-tested
- Ready for public launch

---

## Out-of-Scope Long-Term (Post-MVP)

**Not in MVP; documented for future planning:**

### Phase 10: Map View
- Google Maps embed + place markers
- Click marker → open place details + call/directions
- Cost: +$0.007/place (Place Details API)

### Phase 11: Reservations
- OpenTable / Momo / local booking API integration
- In-app reservation form
- Confirmation + reminder emails

### Phase 12: Share & Recommendations
- Generate shareable link for a recommendation
- Pre-filled conversation (read-only mode)
- Analytics: track clicks, redemptions

### Phase 13: Voice Input
- Web Audio API + speech-to-text
- "Hôm nay ăn gì?" voice → text → chat
- Accessibility: alternative for users with typing difficulties

### Phase 14+: Multi-City
- Switch between VN cities (HN, SG, DN, etc.)
- Per-city API keys + budget allocation
- Complexity: user preferences, location awareness, reviews per-city

---

## Success Criteria for Launch

- ✅ **All critical bugs (C1–C5) fixed**
- ✅ **Eval round 1 passes:** ≥27/30 relevance ≥4, ≥27/30 tone ≥4, 30/30 grounded
- ✅ **Integration tests pass:** RLS policies enforce owner_key, guest-to-user merge works
- ✅ **Load test passes:** 1k concurrent users, <8s P95 latency, budget guard holds
- ✅ **Security review passed:** No info leaks, rate limits enforced, CORS configured
- ✅ **Documentation complete:** Setup guide, ops runbook, architecture docs
- ✅ **Deployed to staging:** Accessible via staging URL, production env mirrors
- ✅ **Marketing collateral ready:** 1-liner ("VI-first food buddy"), hero screenshots

---

## Known Issues for Phase 9

**Captured in code review, scheduled:**
- C1–C5: 5 critical bugs (1 day fix)
- H1–H7: 7 high-priority issues (1–2 days)
- M1–M13: 13 medium-priority refactors (backlog, nice-to-have)
- 5 untested modules (1 day coverage)

See full details: `plans/reports/code-reviewer-260421-1347-food-discovery-mvp.md`

---

## Contact & Escalation

**Phase 9 Owner:** TBD (dedicated agent for hardening sprint)

**On-call Playbook:** See `docs/ops-runbook.md` for incident response (Places budget spike, OpenAI outage, etc.)

**Documentation:** All docs in `./docs/` directory; update on every phase completion.
