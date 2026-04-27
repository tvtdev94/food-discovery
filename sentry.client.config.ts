/**
 * Sentry client-side initialisation.
 * Next.js auto-imports this file on the browser bundle.
 * All init logic lives in lib/observability/sentry.ts.
 */
import { initClient } from "@/lib/observability/sentry";

initClient();
