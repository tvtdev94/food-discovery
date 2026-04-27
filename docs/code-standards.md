# Code Standards — Food Discovery MVP

**Version:** 1.0 | **Last Updated:** 2026-04-21

---

## File Naming & Structure

### Naming Convention
- **TS/TSX files:** kebab-case (e.g., `use-chat-stream.ts`, `dispatch-tools.ts`)
- **React components:** PascalCase inside kebab-case filenames (e.g., `restaurant-card.tsx` exports `RestaurantCard`)
- **Directories:** kebab-case (e.g., `components/chat/`, `lib/tools/`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `DEFAULT_CACHE_TTL = 600`)

### File Organization
```
lib/
├── [concern]/          # Group by domain: auth, chat, location, tools, observability
│   ├── file-one.ts
│   └── file-two.ts
├── env.ts              # Config
├── logger.ts           # Shared utilities
└── utils.ts
```

Each module has a clear single responsibility. Avoid generic `utils/` dumping.

---

## TypeScript Standards

### Strict Mode
- Enable `"strict": true` in tsconfig.json
- No `any` types exported from modules
- Narrow `unknown` with type guards before use

```typescript
// ❌ Bad
function process(data: any) { }

// ✅ Good
function process(data: unknown) {
  if (typeof data === "object" && data !== null) {
    // now TypeScript knows data is an object
  }
}
```

### Type Exports
- Export types alongside implementations
- Use `type` keyword for type-only exports (improves bundle)

```typescript
// ✅ Good
export type ChatMessage = { role: string; content: string };
export const defaultMessage: ChatMessage = { role: "user", content: "" };
```

### Error Handling
- Define error types in `lib/[concern]/errors.ts`
- Use `instanceof` checks, not string comparison

```typescript
// ✅ Good
class RateLimitError extends Error {
  constructor(public remaining: number) {
    super("Rate limited");
  }
}

try {
  // operation
} catch (err) {
  if (err instanceof RateLimitError) {
    // handle
  }
}
```

---

## Server vs. Client Boundary

### Server-Only Modules
Top of every server-only file (no "use client" allowed):
```typescript
import "server-only";
```

Examples: `lib/supabase/server.ts`, `lib/env.ts`, `lib/chat/responses-runner.ts`, all route handlers.

### Client Components
Top of every client component or hook:
```typescript
"use client";
```

Examples: `hooks/use-chat-stream.ts`, `components/chat/chat-shell.tsx`, any hook using browser APIs.

### Server Component Utilities
Some utilities (e.g., `lib/utils.ts`, `lib/maps-deep-link.ts`) are safe for both. Mark as such in comments:
```typescript
// Safe for server and client (no secrets, no browser APIs)
export function formatDistance(km: number): string { ... }
```

---

## Route Handlers & API Design

### Zod Validation at Entry
Every route handler validates input at the top:

```typescript
import "server-only";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

const QuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: searchParams.get("q"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  // Use parsed.data
}
```

### Service-Role Query Safety
When using `supabaseAdmin()` (service-role), ALWAYS include explicit owner_key filter:

```typescript
// ❌ Dangerous — leaks all rows
const { data } = await supabaseAdmin()
  .from("conversations")
  .select("*");

// ✅ Safe
const { data } = await supabaseAdmin()
  .from("conversations")
  .select("*")
  .eq("owner_key", ownerKey);
```

### Response Status Codes
- `200 OK` — success
- `201 Created` — resource created
- `400 Bad Request` — invalid input (Zod parse fail)
- `401 Unauthorized` — missing auth
- `403 Forbidden` — auth present but not authorized
- `404 Not Found` — resource doesn't exist
- `429 Too Many Requests` — rate limit exceeded
- `500 Internal Server Error` — server crash or unhandled upstream error

---

## SSE (Server-Sent Events)

### Encoding
```typescript
import { sseEncode } from "@/lib/chat/sse";

// Emit event
response.write(sseEncode("event_name", { data: "value" }));
response.write(sseEncode("another_event", payload));
response.write(sseEncode("done", null)); // signal end
```

### Decoding
```typescript
import { parseSSE } from "@/lib/sse-parser";

// Parse one chunk
const event = parseSSE(chunk);
if (event) {
  const { event: eventName, data } = event;
  // data is already JSON.parse'd (as object or string)
}
```

### Event Payload Shape
Events MUST be JSON-serializable and parseable on first attempt:
```typescript
// ❌ Bad — double-encoded
sseEncode("recs_delta", JSON.stringify({ recommendations: [] }));

// ✅ Good — object (sseEncode will JSON.stringify internally)
sseEncode("recs_delta", { recommendations: [] });
```

---

## Testing Standards

### Test Environment
- **Framework:** Vitest (Node environment, not jsdom)
- **Mocking:** Mock server-only modules first (`vi.mock("@/lib/supabase/admin")`)
- **Fixtures:** Define test data in `tests/fixtures/` for reuse

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin");

describe("loadHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch messages", async () => {
    const mockData = [/* fixture */];
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockData }),
      }),
    });

    const result = await loadHistory("conv-123", "user-456");
    expect(result).toEqual(mockData);
  });
});
```

### No Fake Data in Tests
- Don't mock return values unless testing error paths
- Use real test data shapes; fixtures must match production schema
- Integration tests should use real Supabase/Redis if possible (local emulator or staging)

### Test Coverage Goals
- Critical paths: 100% (chat flow, auth, data persistence)
- Error handling: 80%+
- Utilities: 70%+

Current gaps (Phase 9 backlog):
- `lib/chat/responses-runner.ts` (390 LOC, untested)
- `lib/chat/persist-turn.ts` (untested)
- `lib/chat/load-history.ts` (untested)
- `lib/location/ip-geolocate.ts` (untested)
- `lib/auth/resolve-identity.ts` (untested)

---

## Commit Message Format

**Convention:** Conventional Commits (no AI references)

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructure (no feature change)
- `test:` — test additions/fixes
- `docs:` — documentation only
- `chore:` — build, deps, config (not in `.claude/`)

### Example
```
feat(chat): add structured output guard for place_id enum

Responses API now constrains place_id to filtered list via JSON schema.
Prevents hallucinated venue names.

Fixes: #42
```

### NO
```
AI: enhanced the responses runner for better...
docs: updated stuff
fix: made it work
```

---

## Performance & File Size

### Target: <200 LOC per File
Current violations (tech debt, Phase 9 refactor):
- `lib/chat/responses-runner.ts` — 390 LOC → split into orchestrator + event handler
- `hooks/use-chat-stream.ts` — 413 LOC → extract parser logic + state machine
- `app/page.tsx` — 251 LOC → split into sub-components

When a file approaches 200 LOC during implementation, consider early refactor:
```typescript
// Instead of 150-line monolith, extract helpers
export function validateInput(data: unknown) { ... }
export function processStep1(validated: Data) { ... }
export function processStep2(step1Result: Result) { ... }
// Main function now 30 LOC, calls helpers
```

### Bundle Size Discipline
- Prefer `type` exports for TypeScript-only constructs
- Keep `lib/utils.ts` minimal; move domain-specific utils to `lib/[concern]/`
- Lazy-load heavy components (e.g., location picker) with `dynamic()` import
- Tree-shake unused dependencies in `package.json`

---

## Code Review Checklist

Before submitting PR:

- [ ] `pnpm typecheck` passes (no TS errors)
- [ ] `pnpm lint` passes (ESLint)
- [ ] `pnpm test` passes (Vitest, no skipped tests)
- [ ] New files have `"use client"` or `import "server-only"` as appropriate
- [ ] Route handlers have Zod validation + error handling
- [ ] Service-role queries include `.eq("owner_key", ...)` filter
- [ ] No `any` types exported
- [ ] Commit messages follow Conventional Commits
- [ ] No secrets in code (.env vars only)
- [ ] File size <200 LOC (or documented tech debt)

---

## Documentation Standards

### Inline Comments
- Explain *why*, not *what*
- Keep comments up-to-date with code changes

```typescript
// ❌ Bad
const result = places.filter(p => p.rating >= 3.5); // filter by rating

// ✅ Good
// Ensure only well-reviewed places; < 3.5 typically has low review count or poor feedback
const result = places.filter(p => p.rating >= 3.5);
```

### Function Documentation
```typescript
/**
 * Dispatches a tool call to the appropriate handler.
 * 
 * @param toolName - name of the tool (e.g., "find_places")
 * @param args - parsed tool arguments from LLM
 * @returns tool result or error
 * @throws SyntaxError if args cannot be JSON.parse'd
 */
export async function dispatchTool(
  toolName: string,
  args: unknown,
): Promise<ToolResult> { ... }
```

### Module Documentation
Top of file:
```typescript
/**
 * Chat response orchestration.
 * 
 * Handles 2-pass LLM ranking:
 * - Pass 1: tool dispatch (places, weather, geocode)
 * - Pass 2: structured output via Responses API
 * 
 * Emits SSE events for client streaming UI.
 */
```

---

## Environment Variables

### Validation
All env vars go through `lib/env.ts` (server-only) or `lib/env-public.ts` (client-safe):

```typescript
// lib/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  PLACES_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),
  ADMIN_KEY: z.string().min(8), // No default; required
});

export const env = EnvSchema.parse(process.env);
```

### No Secrets in `.env.example`
```
OPENAI_API_KEY=sk-... # Fill in your key
GOOGLE_PLACES_API_KEY=AIza... # Get from Google Cloud
```

---

## Common Patterns

### Rate Limiting
```typescript
import { ratelimitGeocodeMap } from "@/lib/observability/budget-guard";

export async function GET(req: NextRequest) {
  const sessionKey = resolveSessionKey(req);
  const { success, remaining } = await ratelimitGeocodeMap.limit(sessionKey);
  
  if (!success) {
    return NextResponse.json(
      { error: "rate_limited", remaining },
      { status: 429 }
    );
  }
  // proceed
}
```

### Caching
```typescript
import { cacheThrough } from "@/lib/tools/cache";

const places = await cacheThrough(
  `places:${query}`,
  600, // 10 min TTL
  async () => {
    return await googlePlaces.textSearch(query);
  }
);
```

### Error Wrapping for Sentry
```typescript
import { log } from "@/lib/logger";

try {
  // operation
} catch (err) {
  log.error("chat.places_fetch_failed", {
    err,
    query,
    owner_key: identity.ownerKey,
  });
  // return error to client or rethrow
}
```

---

## Know Before You Code

1. **Always read `.env.example`** to understand required secrets
2. **Check `docs/codebase-summary.md`** for module inventory
3. **Review RLS policies** in `supabase/migrations/` before data access
4. **Test locally** with `pnpm dev` and Supabase local (if needed)
5. **Run `pnpm test`** after any change to utils, tools, chat logic
6. **Check `plans/reports/code-reviewer-*.md`** for known issues before implementing similar patterns

---

## Quick Reference

| Task | Command |
|------|---------|
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Format | `pnpm format` (if configured) |
| Test | `pnpm test` |
| Test watch | `pnpm test:watch` |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Supabase setup | `pnpm supabase login && pnpm supabase db push` |
