import { intentSchema, sentimentSchema, type Intent, type Sentiment } from "@petal/core";
import { z } from "zod";

/**
 * A single classification, constrained to the frozen @petal/core unions
 * (plan §9). Confidence is a 0–1 real; the LLM path clamps model output into
 * range before it reaches this schema.
 */
export const classificationSchema = z.object({
  sentiment: sentimentSchema,
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof classificationSchema>;

/** Result of scoring a batch: classifications aligned 1:1 with the input texts. */
export type ClassifyResult = {
  readonly results: readonly Classification[];
  readonly costUsd: number;
  readonly model: string;
};

/**
 * The enrichment scorer seam. The worker injects one of these into the enrich
 * processor, so tests swap in a stub (no network) and production wires the
 * Anthropic client. `classify` returns one classification per input text, in
 * order.
 */
export type Classifier = {
  readonly model: string;
  classify(texts: readonly string[]): Promise<ClassifyResult>;
};

export type { Intent, Sentiment };
