/**
 * Public surface of @petal/ai — enrichment scoring primitives (plan §9, §13):
 * the pinned model/prompt constants, text normalization + cache hashing, the
 * Anthropic structured-output classifier, and the lexicon degradation scorer.
 * The pipeline that wires these to the DB and the queue lives in the worker
 * (apps/worker/src/jobs/enrich.ts); this package stays DB- and queue-free.
 */

export * from "./constants";
export * from "./normalize";
export * from "./content-hash";
export * from "./classifier";
export * from "./lexicon";
export * from "./anthropic-classifier";
export { EVAL_SET, evalLabels, type EvalItem, type EvalLabel } from "./eval/labels";
export { scoreClassifier, type AccuracyReport } from "./eval/accuracy";
