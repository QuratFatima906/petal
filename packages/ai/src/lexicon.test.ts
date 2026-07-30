import { describe, expect, it } from "vitest";
import { createLexiconClassifier, lexiconScore } from "./lexicon";

describe("lexiconScore", () => {
  it("flags spam", () => {
    expect(lexiconScore("Grow your page 5k followers weekly, link in bio").intent).toBe("spam");
  });

  it("detects install/purchase intent", () => {
    expect(lexiconScore("Sold. Installing right now.").intent).toBe("purchase_intent");
  });

  it("detects questions", () => {
    const r = lexiconScore("Does this sync across devices?");
    expect(r.intent).toBe("question");
  });

  it("detects complaints as negative", () => {
    const r = lexiconScore("The phase seems off by a day and it's frustrating");
    expect(r.intent).toBe("complaint");
    expect(r.sentiment).toBe("negative");
  });

  it("detects praise as positive", () => {
    const r = lexiconScore("Love this, the design is gorgeous");
    expect(r.sentiment).toBe("positive");
    expect(r.intent).toBe("praise");
  });

  it("handles Roman Urdu praise", () => {
    const r = lexiconScore("mashallah kya design hai, zabardast");
    expect(r.sentiment).toBe("positive");
  });

  it("returns a low-confidence neutral/other for empty text", () => {
    expect(lexiconScore("")).toEqual({ sentiment: "neutral", intent: "other", confidence: 0.2 });
  });

  it("keeps confidence modest (it is a heuristic)", () => {
    expect(lexiconScore("love love love amazing perfect great").confidence).toBeLessThanOrEqual(0.6);
  });
});

describe("createLexiconClassifier", () => {
  it("scores every text at zero cost with no network", async () => {
    const c = createLexiconClassifier();
    const out = await c.classify(["Love it", "where do I get this?"]);
    expect(out.costUsd).toBe(0);
    expect(out.model).toBe("lexicon");
    expect(out.results).toHaveLength(2);
  });
});
