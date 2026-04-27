/** Typed errors for tool wrappers — upstream API failures, rate limits, budget overruns. */

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export class RateLimitError extends UpstreamError {
  constructor(message = "Upstream rate limit exceeded (429)") {
    super(message, undefined, 429);
    this.name = "RateLimitError";
  }
}

export class BudgetExceededError extends Error {
  constructor(message = "Daily Places API budget exceeded") {
    super(message);
    this.name = "BudgetExceededError";
  }
}
