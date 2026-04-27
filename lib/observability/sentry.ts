/**
 * Thin Sentry wrapper — keeps init logic in one place.
 * Server-side uses env.SENTRY_DSN (server-only env).
 * Client-side uses publicEnv.NEXT_PUBLIC_SENTRY_DSN (public env).
 *
 * Both sides are no-ops when the respective DSN is absent,
 * so local dev works without Sentry configured.
 *
 * @sentry/nextjs types are referenced via a local shim so the file
 * typechecks before `pnpm install` has run.
 */

// Minimal type shim so this file typechecks without @sentry/nextjs installed.
// Once `pnpm install` runs, the real package overrides these.
type SentryEvent = {
  request?: Record<string, unknown>;
  exception?: { values?: Array<{ value?: string; [k: string]: unknown }> };
  message?: string;
  [k: string]: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySentry = any;

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;

/** Redacts email-like strings from a string. */
function redactEmails(str: string): string {
  return str.replace(EMAIL_RE, "<email>");
}

/**
 * Removes PII from a Sentry event before it leaves the process:
 * - Drops request.data entirely (may contain user message).
 * - Redacts emails from exception values and top-level message.
 */
function scrubSentryEvent(event: SentryEvent): SentryEvent | null {
  // Drop raw POST body / request data.
  if (event.request) {
    event.request = { ...event.request, data: undefined };
  }

  // Redact emails from exception messages.
  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((v) => ({
      ...v,
      value: v.value ? redactEmails(v.value) : v.value,
    }));
  }

  // Redact emails from top-level message.
  if (typeof event.message === "string") {
    event.message = redactEmails(event.message);
  }

  return event;
}

// ---------------------------------------------------------------------------
// Server init
// ---------------------------------------------------------------------------

let serverInitDone = false;

export function initServer(): void {
  // Dynamically accessed to avoid importing server-only env on the client bundle.
  // This function is only ever called in Node.js runtime via instrumentation.ts.
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || serverInitDone) return;
  serverInitDone = true;

  // Dynamic require so Next.js doesn't tree-shake or bundle for client.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require("@sentry/nextjs") as AnySentry;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Capture 100% of errors on server.
    sampleRate: 1.0,
    beforeSend: scrubSentryEvent,
  });
}

// ---------------------------------------------------------------------------
// Client init
// ---------------------------------------------------------------------------

let clientInitDone = false;

export function initClient(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || clientInitDone) return;
  clientInitDone = true;

  // On the client, @sentry/nextjs is available as a normal import.
  // We use require for symmetry and to keep the pattern consistent.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require("@sentry/nextjs") as AnySentry;
  Sentry.init({
    dsn,
    // Capture all errors on client; 10% of performance traces.
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    beforeSend: scrubSentryEvent,
  });
}

// ---------------------------------------------------------------------------
// Capture helper — usable on both server and client
// ---------------------------------------------------------------------------

export function captureException(err: unknown, ctx?: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as AnySentry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Sentry.withScope((scope: any) => {
      if (ctx) {
        scope.setExtras(ctx);
      }
      Sentry.captureException(err);
    });
  } catch {
    // If Sentry is not installed or fails, silently swallow.
  }
}
