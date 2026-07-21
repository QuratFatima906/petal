/**
 * Accuracy report runner (plan §9). Run with a real key to measure the LLM:
 *
 *   ANTHROPIC_API_KEY=sk-... pnpm --filter @petal/ai eval
 *
 * With no key it scores the lexicon baseline instead (offline, zero cost) so
 * the harness always runs. No accuracy number is claimed in the README unless
 * it was produced here against a real key.
 */
import { createAnthropicClassifier } from "../anthropic-classifier";
import { createLexiconClassifier } from "../lexicon";
import { EVAL_SET } from "./labels";
import { scoreClassifier } from "./accuracy";

const main = async (): Promise<void> => {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  const classifier = apiKey === undefined ? createLexiconClassifier() : createAnthropicClassifier({ apiKey });
  const backend = apiKey === undefined ? "lexicon (offline baseline)" : `anthropic (${classifier.model})`;

  const report = await scoreClassifier(classifier, EVAL_SET);
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

  console.log(
    JSON.stringify(
      {
        backend,
        total: report.total,
        sentimentAccuracy: pct(report.sentimentAccuracy),
        intentAccuracy: pct(report.intentAccuracy),
        exactAccuracy: pct(report.exactAccuracy),
        costUsd: report.costUsd.toFixed(4),
      },
      null,
      2,
    ),
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
