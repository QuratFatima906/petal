import { describe, expect, it } from "vitest";
import { DAYS, INTENTS, MENTIONS, SENTIMENTS, dayTotal } from "./demo-data";

describe("demo dataset", () => {
  it("has unique mention ids", () => {
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
    expect(total).toBe(310);
  });
});
