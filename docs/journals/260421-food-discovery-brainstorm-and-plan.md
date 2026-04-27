# Food Discovery Assistant: Greenfield Brainstorm & Plan Execution

**Date**: 2026-04-21  
**Severity**: Informational  
**Component**: Project Foundation  
**Status**: Complete

## What Happened

Brainstorm + planning sprint for "Food Discovery Assistant" greenfield project completed. Stack locked, architecture decided, 8-phase roadmap hydrated with 8 Claude tasks in blockedBy chain. All artifacts committed to `plans/` and `plans/reports/`.

## Technical Decisions & Rationale

### 1. Responses API 2-Pass with Structured Output Enum Guard
**Decision**: OpenAI gpt-5-mini via Responses API. First pass extracts cuisine/constraints natural language. Second pass ranks restaurants with place_id constrained to JSON schema enum of IDs returned by Places Text Search.

**Why**: Pure LLM ranking without enum constraint hallucinates restaurant names ("Ngon Nhat on Nguyen Hue" doesn't exist). Enum hard-guard prevents invalid place_id propagation to Google Maps redirect. Adds ~300ms latency but eliminates data integrity risk.

### 2. Hybrid Ranking Strategy
**Decision**: Server-side rule filter (distance ≤10km, rating≥3.5, reviews≥10, open_now), then LLM reranks top 5 results with one-liner `why_fits` explanations.

**Why**: Pure-LLM ranking over 20 Places = ~8k tokens context. Pure rule filtering = tone-deaf (misses vibe fit). Hybrid = cheap, explainable, context-efficient. User sees "Cozy pho near you with late hours" instead of opaque top-k.

### 3. Guest Mode + Optional Login with Device Merge
**Decision**: Default guest mode (device_id in localStorage). On auth, merge device_id→user_id in Supabase. No signup friction.

**Why**: Lowers conversion friction for mobile web. User tries 3 searches without login. If they love it, auth gate opens smoothly (Supabase user.id + device_id foreign key). Preserves conversation history across login.

### 4. Aggressive Caching + Daily Budget Guard
**Decision**: Upstash Redis. Places 10m TTL, Weather 15m, Geocode 24h. Counter-based daily kill switch if quota exceeded.

**Why**: Google Places Text Search = $32/1000 requests. No cache = 100 daily users × 3 queries/user = $9.60/day. With cache hit rate ≥70%, cost drops to $2.88/day. Daily budget kill switch at $5 spend (hardcoded or ENV) prevents runaway bill.

### 5. Google Places Minimal Field Masking
**Decision**: Text Search only. Response fields: `places[].id, .displayName.text, .formatted_address, .rating, .user_rating_count, .opening_hours.open_now`. No Place Details round-trip in MVP.

**Why**: Per-field billing discipline. `place_id` lookup later if user clicks (not MVP). Saves ~$0.007 per search.

### 6. Nominatim Geocoding with Polite Rate Limit
**Decision**: Nominatim proxy (24h cache) + 1 req/session/sec rate limiter + UA header with contact email.

**Why**: Nominatim free tier requires ToS politeness. If usage exceeds "reasonable" (~100/day per IP), get blocked. Fallback plan: Mapbox Geocoding API ($0.50/1000). Rate limit + cache keeps us in free tier for MVP; ENV-config switch to Mapbox when scaling.

## Artifacts Produced

- **Brainstorm report**: `plans/reports/brainstorm-260421-0959-food-discovery-mvp.md` (requirement synthesis, stack rationale)
- **Master plan**: `plans/260421-0959-food-discovery-mvp/plan.md` (overview, phase links)
- **Phase files**: `phase-01-bootstrap.md` through `phase-08-observability.md`
- **Task chain**: 8 Claude tasks with blockedBy graph (phase-01 → phase-02 → ... → phase-08)

## Open Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| gpt-5-mini availability in `openai` npm SDK | High | P1 bootstrap verify. ENV var `OPENAI_MODEL_ID` allows instant fallback to gpt-4o if needed. |
| iOS Safari geolocation (HTTPS + user gesture req) | Medium | IP-based fallback. Manual zip/location picker in UI. Test on actual Safari before ship. |
| RLS policy bugs (guest_user_id vs auth_user_id) | High | Integration test: 2 users, verify row isolation. Cannot ship without passing. |
| Nominatim rate limit hit during beta | Low | Monitor API error count. Instant ENV flip to Mapbox if >5 blocks/day. |
| Places API outage | Medium | Graceful degradation: cache-only mode. Show stale results with "data may be outdated" banner. |

## Emotional Reality

Relief mixed with healthy skepticism. Stack is locked, phases are clear, no ambiguity about what bootstrap looks like. The enum-guard decision feels like an engineering win—prevents the "magical restaurant name hallucination" bug that would ship broken. Caching strategy is conservative but necessary; can't afford a $200 bill on day 3.

Slight anxiety: gpt-5-mini is new. If `openai` npm SDK doesn't have it day-1, entire ranking pipeline breaks. Mitigation is in place (ENV var), but it's a hard dependency to verify at P1 bootstrap.

## Next Steps

1. **P1 Bootstrap (Phase 01)**: Verify gpt-5-mini availability. Set up Next.js 15 App Router, Supabase project, Upstash namespace, OpenAI key rotation. All ENV vars documented. Task: `phase-01-bootstrap`
2. **Phase 02–03**: Core API routes (Places proxy, geocode, weather). Task chain continues.
3. **First gate**: Integration test with 2 Supabase users before UI build (phase-04). RLS must pass.

---

## Unresolved Questions

- **gpt-5-mini billing tier**: Only available in Pay-As-You-Go? Or requires prepaid? Check OpenAI console.
- **Nominatim contact protocol**: UA header includes email—what's the expected response if they contact us about volume? Should we have a monitoring/reporting strategy?
- **Upstash Redis free tier limits**: Concurrent connections + total commands/day? Document in bootstrap phase.
