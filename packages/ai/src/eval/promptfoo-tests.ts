import { EVAL_SET } from "./labels";

/**
 * Promptfoo test cases derived from the 120-item labeled set (plan §9, §12).
 * Loaded by promptfooconfig.yaml. Each case feeds one text through the prompt
 * and asserts the model's JSON sentiment + intent match the label. Kept
 * separate from the batch production client — this surface scores one text per
 * call so a prompt regression is easy to localize.
 */

type PromptfooAssertion = { readonly type: string; readonly value?: unknown };
type PromptfooTestCase = {
  readonly description: string;
  readonly vars: { readonly text: string };
  readonly assert: readonly PromptfooAssertion[];
};

const cases: readonly PromptfooTestCase[] = EVAL_SET.map((item) => ({
  description: item.id,
  vars: { text: item.text },
  assert: [
    { type: "is-json" },
    {
      type: "javascript",
      value: (output: string): boolean => {
        try {
          const parsed = JSON.parse(output) as { sentiment?: string; intent?: string };
          return parsed.sentiment === item.label.sentiment && parsed.intent === item.label.intent;
        } catch {
          return false;
        }
      },
    },
  ],
}));

export default cases;
