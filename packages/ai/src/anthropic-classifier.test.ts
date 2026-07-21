import { describe, expect, it, vi } from "vitest";
import { EnrichmentError } from "@petal/core";
import {
  createAnthropicClassifier,
  estimateCostUsd,
  parseBatchResult,
  type BatchResponse,
} from "./anthropic-classifier";
import { MODEL_PRICING } from "./constants";

const okBatch = (n: number, inputTokens = 100, outputTokens = 40): BatchResponse => ({
  raw: JSON.stringify({
    items: Array.from({ length: n }, () => ({ sentiment: "positive", intent: "praise", confidence: 0.9 })),
  }),
  inputTokens,
  outputTokens,
});

describe("estimateCostUsd", () => {
  it("prices from token usage", () => {
    expect(estimateCostUsd(1_000_000, 0)).toBeCloseTo(MODEL_PRICING.inputPerMillion, 10);
    expect(estimateCostUsd(0, 1_000_000)).toBeCloseTo(MODEL_PRICING.outputPerMillion, 10);
  });
});

describe("parseBatchResult", () => {
  it("parses valid output", () => {
    expect(parseBatchResult(okBatch(2).raw, 2)).toHaveLength(2);
  });

  it("throws on non-JSON", () => {
    expect(() => parseBatchResult("not json", 1)).toThrow(EnrichmentError);
  });

  it("throws on schema mismatch (unknown enum)", () => {
    const raw = JSON.stringify({ items: [{ sentiment: "furious", intent: "praise", confidence: 0.5 }] });
    expect(() => parseBatchResult(raw, 1)).toThrow(EnrichmentError);
  });

  it("throws when the count does not match the batch length", () => {
    expect(() => parseBatchResult(okBatch(1).raw, 3)).toThrow(EnrichmentError);
  });
});

describe("createAnthropicClassifier", () => {
  it("splits >10 texts into multiple model calls and sums cost", async () => {
    const runBatch = vi.fn(async (texts: readonly string[]) => okBatch(texts.length));
    const classifier = createAnthropicClassifier({ apiKey: "test", runBatch });

    const texts = Array.from({ length: 25 }, (_, i) => `text ${i}`);
    const result = await classifier.classify(texts);

    // 25 texts / batch size 10 => 3 calls (10, 10, 5).
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(runBatch.mock.calls[0]?.[0]).toHaveLength(10);
    expect(runBatch.mock.calls[2]?.[0]).toHaveLength(5);
    expect(result.results).toHaveLength(25);
    expect(result.costUsd).toBeCloseTo(3 * estimateCostUsd(100, 40), 10);
  });

  it("returns empty result for no texts without calling the model", async () => {
    const runBatch = vi.fn(async () => okBatch(0));
    const classifier = createAnthropicClassifier({ apiKey: "test", runBatch });
    const result = await classifier.classify([]);
    expect(runBatch).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(0);
  });

  it("surfaces malformed model output as EnrichmentError", async () => {
    const runBatch = vi.fn(async () => ({ raw: "garbage", inputTokens: 10, outputTokens: 5 }));
    const classifier = createAnthropicClassifier({ apiKey: "test", runBatch });
    await expect(classifier.classify(["hi"])).rejects.toBeInstanceOf(EnrichmentError);
  });
});
