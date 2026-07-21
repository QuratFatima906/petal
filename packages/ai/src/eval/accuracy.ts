import type { Classifier } from "../classifier";
import { EVAL_SET, type EvalItem } from "./labels";

/**
 * Accuracy report for a classifier over a labeled set (plan §9, §12). Reports
 * sentiment, intent and exact-match accuracy plus total model cost, so a prompt
 * change can be gated on "no regression > 2 points" (plan §12).
 */
export type AccuracyReport = {
  readonly total: number;
  readonly sentimentAccuracy: number;
  readonly intentAccuracy: number;
  readonly exactAccuracy: number;
  readonly costUsd: number;
};

/** Runs the classifier over the set (batched by the classifier) and scores it. */
export const scoreClassifier = async (
  classifier: Classifier,
  set: readonly EvalItem[] = EVAL_SET,
): Promise<AccuracyReport> => {
  const { results, costUsd } = await classifier.classify(set.map((item) => item.text));
  let sentimentCorrect = 0;
  let intentCorrect = 0;
  let exactCorrect = 0;
  set.forEach((item, i) => {
    const predicted = results[i];
    if (predicted === undefined) return;
    const s = predicted.sentiment === item.label.sentiment;
    const n = predicted.intent === item.label.intent;
    if (s) sentimentCorrect += 1;
    if (n) intentCorrect += 1;
    if (s && n) exactCorrect += 1;
  });
  const total = set.length;
  const ratio = (correct: number): number => (total === 0 ? 0 : correct / total);
  return {
    total,
    sentimentAccuracy: ratio(sentimentCorrect),
    intentAccuracy: ratio(intentCorrect),
    exactAccuracy: ratio(exactCorrect),
    costUsd,
  };
};
