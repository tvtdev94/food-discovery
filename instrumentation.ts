/**
 * Next.js 15 instrumentation hook.
 * Called once when the server runtime initialises.
 * Registers Sentry on the Node.js runtime only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServer } = await import("@/lib/observability/sentry");
    initServer();
  }
}
