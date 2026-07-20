import { describe, expect, it } from "vitest";
import { FIXTURE_COUNT } from "@petal/fixtures";
import { DAYS, INTENTS, MENTIONS, PULSE_BUCKETS, SENTIMENTS, WEEK_STATS, dayTotal } from "./demo-data";

describe("demo dataset", () => {
  it("surfaces every fixture event exactly once", () => {
    expect(MENTIONS.length).toBe(FIXTURE_COUNT);
    const ids = MENTIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses known sentiment and intent values", () => {
    for (const m of MENTIONS) {
      expect(SENTIMENTS).toContain(m.sentiment);
      expect(INTENTS).toContain(m.intent);
      expect(m.confidence).toBeGreaterThan(0);
      expect(m.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("day aggregates sum to the overview total", () => {
    const total = DAYS.reduce((sum, d) => sum + dayTotal(d), 0);
    expect(total).toBe(WEEK_STATS.mentions);
    // Pinned so e2e assertions and the dataset can't drift silently.
    expect(total).toBe(50);
  });

  it("feed counts asserted by e2e stay in sync with the dataset", () => {
    expect(MENTIONS.length).toBe(80);
    expect(MENTIONS.filter((m) => m.sentiment === "negative").length).toBe(9);
  });

  it("pulse buckets cover the whole week", () => {
    expect(PULSE_BUCKETS.length).toBe(28);
    expect(PULSE_BUCKETS.reduce((sum, b) => sum + b.count, 0)).toBe(WEEK_STATS.mentions);
    expect(PULSE_BUCKETS.filter((b) => b.isLive).length).toBe(1);
  });
});
