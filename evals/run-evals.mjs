#!/usr/bin/env node
// run-evals.mjs — ĂnGì eval runner
// Usage: node evals/run-evals.mjs --base=http://localhost:3000 --out=evals/results/20260421
//
// Reads evals/queries-vi.json, sends each query to /api/chat with a fake Hà Nội location,
// saves each result to <out>/<id>.json. Sequential to respect rate limits.

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    out: { type: "string", default: "" },
  },
  strict: false,
});

const BASE_URL = args.base ?? "http://localhost:3000";
const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT_DIR = args.out || path.join("evals", "results", dateStamp);

// ---------------------------------------------------------------------------
// Fake location: Hà Nội centre
// ---------------------------------------------------------------------------

const FAKE_LOCATION = {
  lat: 21.0285,
  lng: 105.8542,
  label: "Hà Nội",
};

// Unique device_id per query — sidesteps chat session rate limit (20/10m/device).
function fakeDeviceId(queryId) {
  return `eval-${queryId}-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Inline SSE parser (Node streams — no browser ReadableStream needed)
// ---------------------------------------------------------------------------

/**
 * Parses an SSE response body (Node fetch Response) into an async iterable
 * of { event: string, data: unknown } objects.
 */
async function* parseSseResponse(response) {
  const decoder = new TextDecoder();
  let buf = "";

  for await (const chunk of response.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? ""; // keep incomplete last line

    let event = "message";
    let dataLine = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice(5).trim();
      } else if (line === "") {
        // Dispatch event
        if (dataLine) {
          let parsed;
          try {
            parsed = JSON.parse(dataLine);
          } catch {
            parsed = dataLine;
          }
          yield { event, data: parsed };
        }
        // Reset for next event block
        event = "message";
        dataLine = "";
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Run a single query through /api/chat
// ---------------------------------------------------------------------------

async function runQuery(query) {
  const startMs = Date.now();
  const deviceId = fakeDeviceId(query.id);

  const body = JSON.stringify({
    message: query.query,
    activeLocation: FAKE_LOCATION,
    deviceId,
  });

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
      },
      body,
    });
  } catch (err) {
    return {
      id: query.id,
      dimension: query.dimension,
      query: query.query,
      status: "network_error",
      error: String(err),
      durationMs: Date.now() - startMs,
    };
  }

  if (!response.ok) {
    return {
      id: query.id,
      dimension: query.dimension,
      query: query.query,
      status: "http_error",
      httpStatus: response.status,
      durationMs: Date.now() - startMs,
    };
  }

  // Collect SSE events
  let assistantMessage = "";
  let recommendations = [];
  let usage = {};
  let errorPayload = null;

  try {
    for await (const { event, data } of parseSseResponse(response)) {
      switch (event) {
        case "message_delta":
          // Phase 9a: APPEND semantics — chunks accumulate.
          if (typeof data === "string") assistantMessage += data;
          else if (data?.text) assistantMessage += data.text;
          else if (data?.delta) assistantMessage += data.delta;
          break;

        case "recs_delta":
          if (data?.recommendations) recommendations = data.recommendations;
          if (data?.assistant_message) assistantMessage = data.assistant_message;
          break;

        case "done":
          if (data?.usage) usage = data.usage;
          break;

        case "error":
          errorPayload = data;
          break;

        default:
          break;
      }
    }
  } catch (err) {
    return {
      id: query.id,
      dimension: query.dimension,
      query: query.query,
      status: "parse_error",
      error: String(err),
      durationMs: Date.now() - startMs,
    };
  }

  const durationMs = Date.now() - startMs;

  return {
    id: query.id,
    dimension: query.dimension,
    query: query.query,
    expected_fields: query.expected_fields,
    status: errorPayload ? "error" : "ok",
    errorPayload: errorPayload ?? undefined,
    assistantMessage,
    recommendations,
    usage,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const queriesPath = path.join("evals", "queries-vi.json");
  if (!fs.existsSync(queriesPath)) {
    console.error(`ERROR: ${queriesPath} not found. Run from repo root.`);
    process.exit(1);
  }

  const queries = JSON.parse(fs.readFileSync(queriesPath, "utf8"));
  console.log(`Loaded ${queries.length} queries from ${queriesPath}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Output dir: ${OUT_DIR}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summary = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    process.stdout.write(`[${i + 1}/${queries.length}] ${q.id} ... `);

    const result = await runQuery(q);

    const outFile = path.join(OUT_DIR, `${q.id}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");

    const statusStr = result.status === "ok"
      ? `OK (${result.durationMs}ms, ${result.recommendations?.length ?? 0} recs)`
      : `FAIL: ${result.status}`;
    console.log(statusStr);

    summary.push({
      id: q.id,
      dimension: q.dimension,
      status: result.status,
      durationMs: result.durationMs,
      recCount: result.recommendations?.length ?? 0,
    });

    // Small delay between requests to avoid rate limits
    if (i < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Write summary file
  const summaryPath = path.join(OUT_DIR, "_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const okCount = summary.filter((s) => s.status === "ok").length;
  console.log(`\nDone: ${okCount}/${queries.length} OK`);
  console.log(`Results saved to: ${OUT_DIR}`);
  console.log(`\nNext step: manually grade in evals/results/${path.basename(OUT_DIR)}.md`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
