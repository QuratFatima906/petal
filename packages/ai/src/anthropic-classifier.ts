import Anthropic from "@anthropic-ai/sdk";
import { EnrichmentError } from "@petal/core";
import { z } from "zod";
import { BATCH_SIZE, MODEL_ID, MODEL_PRICING, PROMPT_VERSION } from "./constants";
import { classificationSchema, type Classification, type Classifier, type ClassifyResult } from "./classifier";

/**
 * Anthropic-backed classifier (plan §9). Uses structured output constrained to
 * the sentiment/intent unions, batches up to {@link BATCH_SIZE} texts per API
 * call, and accounts cost per call into `cost_usd`. The raw model call is
 * injected via {@link BatchRunner} so tests never touch the network — the real
 * runner (built from the SDK) is the default.
 */

/** One model call's raw output plus token usage (what cost accounting needs). */
export type BatchResponse = {
  readonly raw: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

/** The injectable model-call seam: scores one batch (≤ BATCH_SIZE texts). */
export type BatchRunner = (texts: readonly string[]) => Promise<BatchResponse>;

export type AnthropicClassifierConfig = {
  readonly apiKey: string;
  readonly model?: string;
  /** Override the model call (tests inject a stub; production omits it). */
  readonly runBatch?: BatchRunner;
};

/** US-dollar cost of one call from its token usage (plan §13 cost controls). */
export const estimateCostUsd = (inputTokens: number, outputTokens: number): number =>
  (inputTokens / 1_000_000) * MODEL_PRICING.inputPerMillion +
  (outputTokens / 1_000_000) * MODEL_PRICING.outputPerMillion;

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** JSON schema handed to the model — output is constrained to the unions. */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sentiment", "intent", "confidence"],
        properties: {
          sentiment: { type: "string", enum: ["positive", "negative", "neutral", "mixed"] },
          intent: {
            type: "string",
            enum: ["complaint", "praise", "question", "purchase_intent", "spam", "other"],
          },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT =
  "You classify short Instagram comments and mentions about a product. " +
  "For each input text, return its sentiment and intent. " +
  "sentiment is one of: positive, negative, neutral, mixed. " +
  "intent is one of: complaint, praise, question, purchase_intent, spam, other. " +
  "confidence is your certainty from 0 to 1. " +
  "Some texts are Roman Urdu or mixed Urdu-English; classify by meaning, not language. " +
  "Return exactly one result per input text, in the same order.";

/** The user prompt for a batch — indexed so the model preserves order. */
export const buildBatchPrompt = (texts: readonly string[]): string => {
  const lines = texts.map((t, i) => `${i + 1}. ${t}`);
  return `Classify each of the following ${texts.length} text(s):\n\n${lines.join("\n")}`;
};

const batchSchema = z.object({ items: z.array(classificationSchema) });

/** Parse + validate a batch response; throws EnrichmentError on malformed output. */
export const parseBatchResult = (raw: string, expected: number): Classification[] => {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new EnrichmentError("model returned non-JSON output");
  }
  const parsed = batchSchema.safeParse(json);
  if (!parsed.success) throw new EnrichmentError("model output failed schema validation");
  if (parsed.data.items.length !== expected) {
    throw new EnrichmentError(`model returned ${parsed.data.items.length} results, expected ${expected}`);
  }
  return parsed.data.items;
};

const extractText = (message: Anthropic.Message): string =>
  message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

const makeSdkRunner =
  (apiKey: string, model: string): BatchRunner =>
  async (texts) => {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: buildBatchPrompt(texts) }],
    });
    return {
      raw: extractText(message),
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  };

/**
 * Build the production classifier. `classify` splits its input into batches of
 * {@link BATCH_SIZE}, one model call each, concatenates results in order and
 * sums cost. Malformed output surfaces as {@link EnrichmentError} (the enrich
 * pipeline retries once, then degrades to the lexicon).
 */
export const createAnthropicClassifier = (config: AnthropicClassifierConfig): Classifier => {
  const model = config.model ?? MODEL_ID;
  const runBatch = config.runBatch ?? makeSdkRunner(config.apiKey, model);
  return {
    model,
    classify: async (texts): Promise<ClassifyResult> => {
      if (texts.length === 0) return { results: [], costUsd: 0, model };
      let costUsd = 0;
      const results: Classification[] = [];
      for (const batch of chunk(texts, BATCH_SIZE)) {
        const response = await runBatch(batch);
        costUsd += estimateCostUsd(response.inputTokens, response.outputTokens);
        results.push(...parseBatchResult(response.raw, batch.length));
      }
      return { results, costUsd, model };
    },
  };
};

export { PROMPT_VERSION };
