"use client";

import { SOURCE_LABEL, type Mention } from "@/lib/demo-data";
import { IntentBadge, KeywordScoredBadge, SentimentPill } from "./badges";

export const mentionInitial = (m: Mention): string =>
  m.username === "Public post" ? "◦" : (m.username.replace("@", "").charAt(0)?.toUpperCase() ?? "◦");

export function MentionCard({
  mention,
  selected = false,
  compact = false,
  onOpen,
}: {
  mention: Mention;
  selected?: boolean;
  compact?: boolean;
  onOpen: () => void;
}) {
  if (compact) {
    return (
      <div
        onClick={onOpen}
        className="flex cursor-pointer gap-3 rounded-control border-t border-line px-2 py-3 hover:bg-surface2"
      >
        <div className="grid h-8 w-8 flex-none place-items-center rounded-full border border-line bg-surface2 font-display text-[13px] font-semibold text-ink2">
          {mentionInitial(mention)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-medium">{mention.username}</span>
            <span className="text-[11px] text-ink3">
              {SOURCE_LABEL[mention.source]} · {mention.when}
            </span>
          </div>
          <div className="line-clamp-2 text-[13px] text-ink2">{mention.text}</div>
          <div className="flex gap-1.5">
            <SentimentPill sentiment={mention.sentiment} />
            <IntentBadge intent={mention.intent} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer gap-3 rounded-card border bg-surface px-4 py-3.5 hover:bg-surface2"
      style={{ borderColor: selected ? "var(--color-accent)" : "var(--color-line)" }}
    >
      <div className="grid h-9 w-9 flex-none place-items-center rounded-full border border-line bg-surface2 font-display text-[13px] font-semibold text-ink2">
        {mentionInitial(mention)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-medium">{mention.username}</span>
          <span className="text-[11px] text-ink3">
            {SOURCE_LABEL[mention.source]} · {mention.when}
          </span>
        </div>
        <div className="text-[15px] text-ink">{mention.text}</div>
        <div className="flex items-center gap-1.5">
          <SentimentPill sentiment={mention.sentiment} />
          <IntentBadge intent={mention.intent} />
          {mention.method === "lexicon" ? <KeywordScoredBadge /> : null}
        </div>
      </div>
    </div>
  );
}
