import { INTENT_LABEL, SENTIMENT_COLOR, type Intent, type Sentiment } from "@/lib/demo-data";

export function SentimentPill({ sentiment }: { sentiment: Sentiment }) {
  const color = SENTIMENT_COLOR[sentiment];
  return (
    <span className="rounded-full border px-2 py-px text-[11px]" style={{ color, borderColor: color }}>
      {sentiment}
    </span>
  );
}

export function IntentBadge({ intent }: { intent: Intent }) {
  return (
    <span className="rounded-full border border-line px-2 py-px text-[11px] text-ink2">{INTENT_LABEL[intent]}</span>
  );
}

/** Marks lexicon-scored items, per the AiBadge spec ("keyword scored"). */
export function KeywordScoredBadge() {
  return (
    <span className="rounded-full border border-ai px-2 py-px text-[11px] text-ai">keyword scored</span>
  );
}
