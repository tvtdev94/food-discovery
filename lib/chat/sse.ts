import "server-only";

/**
 * Encodes a single SSE frame as UTF-8 bytes.
 * Format: "event: <event>\ndata: <json>\n\n"
 */
export function sseEncode(event: string, data: unknown): Uint8Array {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(frame);
}

export interface SSEStream {
  readable: ReadableStream<Uint8Array>;
  write: (event: string, data: unknown) => void;
  close: () => void;
}

/**
 * Creates a push-based SSE stream.
 * write() enqueues frames; close() terminates the stream.
 * Safe to call close() multiple times (no-op after first close).
 */
export function makeSSEStream(): SSEStream {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  function write(event: string, data: unknown): void {
    if (closed || !controller) return;
    try {
      controller.enqueue(sseEncode(event, data));
    } catch {
      // Stream already closed by client disconnect — ignore.
      closed = true;
    }
  }

  function close(): void {
    if (closed || !controller) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Already closed — ignore.
    }
    controller = null;
  }

  return { readable, write, close };
}
