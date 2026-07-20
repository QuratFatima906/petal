import { type Clock, systemClock } from "./clock";

/**
 * Token bucket with continuous refill: one token every `refillIntervalMs`,
 * capped at `capacity`. Two instances back the two limiter classes (plan §13):
 * BUC (per IG account) and Platform (business discovery + hashtag search).
 */

export type TokenBucketConfig = {
  readonly capacity: number;
  /** One token is earned every this many milliseconds. */
  readonly refillIntervalMs: number;
  readonly clock?: Clock;
};

export type TakeResult = { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number };

export type TokenBucket = {
  /** Spend one token, or report how long until the next one refills. */
  readonly take: () => TakeResult;
  /** Whole tokens currently available (after refill accounting). */
  readonly available: () => number;
};

export const createTokenBucket = (config: TokenBucketConfig): TokenBucket => {
  const { capacity, refillIntervalMs } = config;
  const clock = config.clock ?? systemClock;

  let tokens = capacity;
  // Timestamp the last earned token was credited at; refill math stays exact
  // by advancing it in whole intervals rather than resetting to `now`.
  let creditedAt = clock().getTime();

  const refill = (now: number): void => {
    const earned = Math.floor((now - creditedAt) / refillIntervalMs);
    if (earned <= 0) return;
    tokens = Math.min(capacity, tokens + earned);
    creditedAt += earned * refillIntervalMs;
    // A full bucket cannot bank future tokens; restart the interval from now.
    if (tokens === capacity) creditedAt = now;
  };

  return {
    take: () => {
      const now = clock().getTime();
      refill(now);
      if (tokens > 0) {
        tokens -= 1;
        return { ok: true };
      }
      return { ok: false, retryAfterMs: creditedAt + refillIntervalMs - now };
    },
    available: () => {
      refill(clock().getTime());
      return tokens;
    },
  };
};
