// Client-safe SSE parser. Uses fetch Response body reader — NOT EventSource.
// Supports: event: <name>\ndata: <json>\n\n blocks.

/**
 * Async generator that parses an SSE stream from a fetch Response.
 * Yields { event, data } for every complete event block.
 * data is JSON-parsed; falls back to raw string on parse failure.
 */
export async function* parseSSE(
  response: Response,
): AsyncGenerator<{ event: string; data: unknown }> {
  if (!response.body) {
    throw new Error("Response body is null — cannot parse SSE stream");
  }

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;

      // Split by double newline (event boundaries)
      const blocks = buffer.split("\n\n");

      // Last element may be incomplete — keep it in buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        let eventName = "message";
        let dataLine = "";

        for (const line of trimmed.split("\n")) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLine = line.slice(5).trim();
          }
        }

        if (!dataLine) continue;

        let parsed: unknown;
        try {
          parsed = JSON.parse(dataLine);
        } catch {
          parsed = dataLine;
        }

        yield { event: eventName, data: parsed };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
