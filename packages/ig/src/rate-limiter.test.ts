import { describe, expect, it } from "vitest";
import { createTokenBucket } from "./rate-limiter";

const fakeClock = (startMs = 0) => {
  let now = startMs;
  return {
    clock: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("createTokenBucket", () => {
  it("starts full and spends one token per take", () => {
    const { clock } = fakeClock();
    const bucket = createTokenBucket({ capacity: 3, refillIntervalMs: 1000, clock });
    expect(bucket.available()).toBe(3);
    expect(bucket.take().ok).toBe(true);
    expect(bucket.take().ok).toBe(true);
    expect(bucket.take().ok).toBe(true);
    expect(bucket.available()).toBe(0);
  });

  it("denies with exact retryAfterMs when empty", () => {
    const { clock, advance } = fakeClock();
    const bucket = createTokenBucket({ capacity: 1, refillIntervalMs: 1000, clock });
    expect(bucket.take().ok).toBe(true);
    advance(400);
    const denied = bucket.take();
    expect(denied).toEqual({ ok: false, retryAfterMs: 600 });
  });

  it("refills one token per interval, not more", () => {
    const { clock, advance } = fakeClock();
    const bucket = createTokenBucket({ capacity: 5, refillIntervalMs: 1000, clock });
    for (let i = 0; i < 5; i++) expect(bucket.take().ok).toBe(true);
    advance(999);
    expect(bucket.take().ok).toBe(false);
    advance(1);
    expect(bucket.take().ok).toBe(true);
    expect(bucket.take().ok).toBe(false);
  });

  it("credits multiple whole intervals at once and caps at capacity", () => {
    const { clock, advance } = fakeClock();
    const bucket = createTokenBucket({ capacity: 3, refillIntervalMs: 1000, clock });
    for (let i = 0; i < 3; i++) expect(bucket.take().ok).toBe(true);
    advance(2500);
    expect(bucket.available()).toBe(2);
    advance(10_000);
    expect(bucket.available()).toBe(3);
  });

  it("does not bank fractional intervals across refills", () => {
    const { clock, advance } = fakeClock();
    const bucket = createTokenBucket({ capacity: 2, refillIntervalMs: 1000, clock });
    expect(bucket.take().ok).toBe(true);
    expect(bucket.take().ok).toBe(true);
    advance(1500);
    expect(bucket.available()).toBe(1);
    // The half interval already elapsed still counts toward the next token.
    advance(500);
    expect(bucket.available()).toBe(2);
  });

  it("a full bucket does not accumulate a backlog of future tokens", () => {
    const { clock, advance } = fakeClock();
    const bucket = createTokenBucket({ capacity: 1, refillIntervalMs: 1000, clock });
    advance(60_000); // idle while full
    expect(bucket.take().ok).toBe(true);
    const denied = bucket.take();
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfterMs).toBe(1000);
  });
});
