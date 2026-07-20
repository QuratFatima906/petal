import { describe, expect, it } from "vitest";
import { backoffDelayMs } from "./backoff";

describe("backoffDelayMs", () => {
  it("produces the exponential schedule with jitter pinned high", () => {
    const random = () => 0.9999999;
    const delays = [0, 1, 2, 3].map((attempt) =>
      backoffDelayMs(attempt, { baseMs: 500, maxMs: 30_000, factor: 2, random }),
    );
    expect(delays).toEqual([500, 1000, 2000, 4000]);
  });

  it("equal jitter never drops below half the exponential delay", () => {
    const random = () => 0;
    expect(backoffDelayMs(0, { baseMs: 500, random })).toBe(250);
    expect(backoffDelayMs(2, { baseMs: 500, random })).toBe(1000);
  });

  it("caps at maxMs", () => {
    const random = () => 0.9999999;
    expect(backoffDelayMs(10, { baseMs: 500, maxMs: 30_000, factor: 2, random })).toBe(30_000);
  });

  it("honors a longer server retryAfterMs over the computed delay", () => {
    const random = () => 0;
    expect(backoffDelayMs(0, { baseMs: 500, random }, 5000)).toBe(5000);
  });

  it("ignores a shorter retryAfterMs than the computed delay", () => {
    const random = () => 0.9999999;
    expect(backoffDelayMs(3, { baseMs: 500, random }, 100)).toBe(4000);
  });
});
