import { type Clock, systemClock } from "./clock";

/**
 * Circuit breaker: opens after N consecutive failures, half-opens after a
 * cooldown to let one probe through, and reports its state so `/api/health`
 * can surface it (plan §13). Pollers pause while open; webhooks carry the load.
 */

export type BreakerState = "closed" | "open" | "half_open";

export type CircuitBreakerConfig = {
  /** Consecutive failures before the circuit opens. */
  readonly failureThreshold?: number;
  /** How long the circuit stays open before allowing a probe. */
  readonly cooldownMs?: number;
  readonly clock?: Clock;
};

export type AcquireResult = { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number };

export type CircuitBreaker = {
  readonly state: () => BreakerState;
  /** Gate a request: allowed in closed, denied in open, one probe in half-open. */
  readonly tryAcquire: () => AcquireResult;
  readonly recordSuccess: () => void;
  readonly recordFailure: () => void;
};

export const DEFAULT_FAILURE_THRESHOLD = 5;
export const DEFAULT_COOLDOWN_MS = 30_000;

export const createCircuitBreaker = (config: CircuitBreakerConfig = {}): CircuitBreaker => {
  const failureThreshold = config.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const clock = config.clock ?? systemClock;

  let consecutiveFailures = 0;
  let openedAt: number | undefined;
  let probing = false;

  const state = (): BreakerState => {
    if (openedAt === undefined) return "closed";
    return clock().getTime() - openedAt >= cooldownMs ? "half_open" : "open";
  };

  return {
    state,
    tryAcquire: () => {
      const current = state();
      if (current === "closed") return { ok: true };
      if (current === "half_open" && !probing) {
        probing = true;
        return { ok: true };
      }
      const elapsed = openedAt === undefined ? 0 : clock().getTime() - openedAt;
      // While a probe is in flight (or the cooldown is running), callers wait
      // out the remaining cooldown — or a full one if it already elapsed.
      return { ok: false, retryAfterMs: Math.max(cooldownMs - elapsed, 1) };
    },
    recordSuccess: () => {
      consecutiveFailures = 0;
      openedAt = undefined;
      probing = false;
    },
    recordFailure: () => {
      if (probing || openedAt !== undefined) {
        // A failed probe (or failure while open) re-opens with a fresh cooldown.
        openedAt = clock().getTime();
        probing = false;
        return;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= failureThreshold) openedAt = clock().getTime();
    },
  };
};
