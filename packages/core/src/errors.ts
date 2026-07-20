/**
 * Typed errors that cross package boundaries. HTTP handlers and job
 * processors are the only broad catchers; they map these to status codes
 * and retry decisions explicitly (plan §5.3).
 */

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class IgAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IgAuthError";
  }
}

export class IgApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly igCode?: number,
  ) {
    super(message);
    this.name = "IgApiError";
  }
}

export class EnrichmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnrichmentError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}
