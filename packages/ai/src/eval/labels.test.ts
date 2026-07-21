import { describe, expect, it } from "vitest";
import { intentSchema, sentimentSchema } from "@petal/core";
import { EVAL_SET, evalLabels } from "./labels";

describe("EVAL_SET", () => {
  it("holds exactly 120 items (80 fixtures + 40 extras)", () => {
    expect(EVAL_SET).toHaveLength(120);
    expect(EVAL_SET.filter((i) => i.id.startsWith("fx-"))).toHaveLength(80);
    expect(EVAL_SET.filter((i) => i.id.startsWith("ex-"))).toHaveLength(40);
  });

  it("has unique ids and non-empty texts", () => {
    const ids = new Set(EVAL_SET.map((i) => i.id));
    expect(ids.size).toBe(120);
    for (const item of EVAL_SET) expect(item.text.trim().length).toBeGreaterThan(0);
  });

  it("labels every item with a valid sentiment and intent union member", () => {
    for (const item of EVAL_SET) {
      expect(sentimentSchema.safeParse(item.label.sentiment).success).toBe(true);
      expect(intentSchema.safeParse(item.label.intent).success).toBe(true);
    }
  });

  it("exposes a label map keyed by event id", () => {
    for (const item of EVAL_SET) {
      expect(evalLabels[item.id]).toEqual(item.label);
    }
  });
});
