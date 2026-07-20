/**
 * Exponential backoff with equal jitter for 429/5xx retries (plan §13).
 * A server-provided `retryAfterMs` (e.g. from a `RateLimitError` or a
 * `Retry-After` header) always wins when it is longer than the computed delay.
 */

export type BackoffConfig = {
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly factor?: number;
  /** Injected for deterministic tests; must return [0, 1). */
  readonly random?: () => number;
};

export const DEFAULT_BACKOFF: Required<Omit<BackoffConfig, "random">> = {
  baseMs: 500,
  maxMs: 30_000,
  factor: 2,
};

export const backoffDelayMs = (attempt: number, config: BackoffConfig = {}, retryAfterMs?: number): number => {
  const baseMs = config.baseMs ?? DEFAULT_BACKOFF.baseMs;
  const maxMs = config.maxMs ?? DEFAULT_BACKOFF.maxMs;
  const factor = config.factor ?? DEFAULT_BACKOFF.factor;
  const random = config.random ?? Math.random;

  const exp = Math.min(maxMs, baseMs * factor ** attempt);
  // Equal jitter: half deterministic, half random — spreads retries without
  // ever collapsing the delay to ~0.
  const jittered = Math.round(exp / 2 + random() * (exp / 2));
  return Math.max(retryAfterMs ?? 0, jittered);
};
