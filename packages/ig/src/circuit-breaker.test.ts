import { describe, expect, it } from "vitest";
import { createCircuitBreaker } from "./circuit-breaker";

const fakeClock = (startMs = 0) => {
  let now = startMs;
  return {
    clock: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe("createCircuitBreaker", () => {
  it("stays closed below the failure threshold and resets on success", () => {
    const { clock } = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, clock });
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state()).toBe("closed");
    expect(breaker.tryAcquire().ok).toBe(true);
  });

  it("opens after N consecutive failures and denies with remaining cooldown", () => {
    const { clock, advance } = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, clock });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state()).toBe("open");
    advance(400);
    const denied = breaker.tryAcquire();
    expect(denied).toEqual({ ok: false, retryAfterMs: 600 });
  });

  it("half-opens after the cooldown and allows exactly one probe", () => {
    const { clock, advance } = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, clock });
    breaker.recordFailure();
    advance(1000);
    expect(breaker.state()).toBe("half_open");
    expect(breaker.tryAcquire().ok).toBe(true);
    expect(breaker.tryAcquire().ok).toBe(false);
  });

  it("a successful probe closes the circuit", () => {
    const { clock, advance } = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, clock });
    breaker.recordFailure();
    advance(1000);
    expect(breaker.tryAcquire().ok).toBe(true);
    breaker.recordSuccess();
    expect(breaker.state()).toBe("closed");
    expect(breaker.tryAcquire().ok).toBe(true);
  });

  it("a failed probe re-opens with a fresh cooldown", () => {
    const { clock, advance } = fakeClock();
    const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, clock });
    breaker.recordFailure();
    advance(1000);
    expect(breaker.tryAcquire().ok).toBe(true);
    breaker.recordFailure();
    expect(breaker.state()).toBe("open");
    advance(999);
    expect(breaker.tryAcquire().ok).toBe(false);
    advance(1);
    expect(breaker.tryAcquire().ok).toBe(true);
  });
});
