/**
 * Model + prompt pinning for enrichment (plan §9, §13). The model id lives in
 * exactly ONE constant so a swap is a one-line change; `PROMPT_VERSION` is the
 * cache key salt — bumping it invalidates every cached classification because
 * `content_hash = sha256(normalized_text + prompt_version)` (plan §6).
 */

/**
 * Small, cheap, current classification model (per the claude-api skill:
 * Haiku 4.5 is the fastest/most cost-effective tier, and supports the
 * structured-output constraint we rely on). Bump deliberately.
 */
export const MODEL_ID = "claude-haiku-4-5";

/** Bump on any prompt/schema change — invalidates the enrichment cache. */
export const PROMPT_VERSION = "petal-enrich-v1";

/**
 * Published Haiku 4.5 pricing, US dollars per million tokens (claude-api skill,
 * cached 2026-06-24). Used only for local cost accounting into `cost_usd`;
 * re-verify when the model id changes.
 */
export const MODEL_PRICING = {
  inputPerMillion: 1.0,
  outputPerMillion: 5.0,
} as const;

/** Texts per model call (plan §9 "batches up to 10 texts per call"). */
export const BATCH_SIZE = 10;

/** Provenance for keyword-scored results — never confused with an LLM call. */
export const LEXICON_MODEL = "lexicon";
export const LEXICON_VERSION = "lexicon-v1";
