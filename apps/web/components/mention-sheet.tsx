"use client";

import { SENTIMENT_COLOR, SOURCE_LABEL, type Mention } from "@/lib/demo-data";
import { IntentBadge, KeywordScoredBadge } from "./badges";
import { mentionInitial } from "./mention-card";

export function MentionSheet({ mention, onClose }: { mention: Mention; onClose: () => void }) {
  const sentColor = SENTIMENT_COLOR[mention.sentiment];
  return (
    <>
      <div className="absolute inset-0 z-10 bg-[rgba(10,13,22,0.55)]" onClick={onClose} />
      <div
        className="absolute top-0 right-0 bottom-0 z-20 flex w-[420px] flex-col overflow-y-auto border-l border-line bg-surface"
        style={{ animation: "sheetin 150ms ease-out" }}
        role="dialog"
        aria-label="Mention detail"
      >
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="text-[13px] text-ink2">{SOURCE_LABEL[mention.source]}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 cursor-pointer rounded-control border border-line bg-transparent text-[13px] leading-none text-ink2 hover:bg-surface2 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 flex-none place-items-center rounded-full border border-line bg-surface2 font-display text-[15px] font-semibold text-ink2">
              {mentionInitial(mention)}
            </div>
            <div>
              <div className="text-[15px] font-medium">{mention.username}</div>
              <div className="font-mono text-[11px] text-ink3">{mention.ts} PKT</div>
            </div>
          </div>
          <div className="text-[17px] leading-normal">{mention.text}</div>
          {mention.media ? (
            <div className="flex items-center gap-3 rounded-control border border-line p-2.5">
              <div
                className="grid h-11 w-11 flex-none place-items-center rounded-control border border-line font-mono text-[9px] text-ink3"
                style={{ background: "repeating-linear-gradient(45deg, var(--color-surface2) 0 6px, var(--color-surface) 6px 12px)" }}
              >
                img
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{mention.media.caption}</div>
                <div className="text-[11px] text-ink3">Posted {mention.media.posted}</div>
              </div>
              <a href="#" onClick={(e) => e.preventDefault()} className="flex-none text-[13px]">
                Open ↗
              </a>
            </div>
          ) : null}
          <div className="flex flex-col gap-2.5 rounded-control border border-line bg-bg p-3.5">
            <div className="text-[11px] tracking-[0.08em] text-ink3 uppercase">AI classification</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border px-2 py-px text-[11px]" style={{ color: sentColor, borderColor: sentColor }}>
                {mention.sentiment}
              </span>
              <IntentBadge intent={mention.intent} />
              {mention.method === "lexicon" ? <KeywordScoredBadge /> : null}
              <span className="text-[13px] text-ink3">{Math.round(mention.confidence * 100)}% confident</span>
            </div>
            <div className="font-mono text-[11px] text-ink3">
              {mention.method === "lexicon" ? "lexicon v1 · budget fallback" : "claude-sonnet-4 · prompt v3"}
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              className="flex-1 cursor-pointer rounded-control border-none bg-accent px-4 py-2.5 text-[15px] font-medium text-accent-ink hover:bg-accent-hover"
            >
              Open on Instagram
            </button>
            <button
              type="button"
              title="Reclassify arrives in v2"
              className="cursor-not-allowed rounded-control border border-line bg-transparent px-4 py-2.5 text-[15px] text-ink3"
            >
              Reclassify
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
