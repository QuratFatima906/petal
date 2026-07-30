# @petal/ai

AI enrichment for Petal: sentiment + intent classification of Instagram comments
and mentions, with caching, a daily cost budget, and a keyword-based lexicon
degradation path.

- **Model:** `claude-haiku-4-5` (pinned in one constant, `MODEL_ID`).
- **Prompt version:** `petal-enrich-v1` (`PROMPT_VERSION`). Bumping it
  invalidates the enrichment cache, since `content_hash = sha256(normalized_text + prompt_version)`.

The package is DB- and queue-free. It exports the scoring primitives; the
pipeline that wires them to Postgres and BullMQ lives in the worker
(`apps/worker/src/jobs/enrich.ts`).

## What's here

- `MODEL_ID`, `PROMPT_VERSION`, `MODEL_PRICING`, `BATCH_SIZE` — pinned config.
- `normalizeText` / `contentHash` — cache keying.
- `createAnthropicClassifier` — structured-output classifier constrained to the
  `@petal/core` sentiment/intent unions; batches up to 10 texts per API call and
  accounts cost per call.
- `createLexiconClassifier` / `lexiconScore` — the offline, zero-cost fallback
  scorer (flagged `method: "lexicon"` upstream), including Roman-Urdu cues.
- `EVAL_SET` (120 labeled items) + `scoreClassifier` — the eval harness.

## Evals

The labeled set is **120 items**: the 80 WP1 fixture mention events (imported
from `@petal/fixtures`, labeled by event id in `src/eval/labels.ts`) plus 40
extra items shipped here that stress sarcasm, code-switched Roman Urdu, spam,
and mixed feelings.

### Accuracy report script

```sh
# Measures the real model (requires a key):
ANTHROPIC_API_KEY=sk-... pnpm --filter @petal/ai eval

# No key → scores the offline lexicon baseline instead (zero cost):
pnpm --filter @petal/ai eval
```

Prints sentiment / intent / exact-match accuracy and total cost as JSON.

### promptfoo

`promptfooconfig.yaml` scores the prompt one text per call against the same set:

```sh
ANTHROPIC_API_KEY=sk-... npx promptfoo@latest eval -c promptfooconfig.yaml
```

Merge gate for prompt changes (plan §12): no accuracy regression greater than
2 points.

> **No accuracy number is stated here.** The evals require a real Anthropic key
> and have not been run against one in this environment. Run the script above to
> produce a measured number before recording it.
