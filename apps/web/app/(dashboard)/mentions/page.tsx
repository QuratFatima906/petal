"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  INTENTS,
  INTENT_LABEL,
  MENTIONS,
  SENTIMENTS,
  SENTIMENT_COLOR,
  type Intent,
  type Sentiment,
  type Source,
} from "@/lib/demo-data";
import { MentionCard } from "@/components/mention-card";
import { MentionSheet } from "@/components/mention-sheet";
import { RailCard } from "@/components/rail-card";

const PAGE_SIZE = 8;
const LOAD_MORE = 6;

type SentimentFilter = Sentiment | "all";
type SourceFilter = Source | "all";

const SOURCE_OPTIONS: readonly { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "own_comment", label: "Comments on your posts" },
  { value: "caption_mention", label: "Caption mentions" },
  { value: "comment_mention", label: "Comment mentions" },
  { value: "hashtag_media", label: "Hashtag posts" },
];

const RAIL_SENTIMENTS: readonly { key: Sentiment; label: string }[] = [
  { key: "positive", label: "Positive" },
  { key: "negative", label: "Negative" },
  { key: "neutral", label: "Neutral" },
  { key: "mixed", label: "Mixed" },
];

const RAIL_BAR_ORDER: readonly Sentiment[] = ["positive", "mixed", "neutral", "negative"];

function MentionsScreen() {
  const params = useSearchParams();
  const initialSentiment = params.get("sentiment");
  const [sentiment, setSentiment] = useState<SentimentFilter>(
    SENTIMENTS.includes(initialSentiment as Sentiment) ? (initialSentiment as Sentiment) : "all",
  );
  const [intentFilters, setIntentFilters] = useState<readonly Intent[]>([]);
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("open"));

  // Rail counts react to source + search only, so sentiment/intent clicks
  // filter the feed without zeroing their own counts (per the mockup).
  const railSrc = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MENTIONS.filter(
      (m) =>
        (source === "all" || m.source === source) &&
        (q === "" || m.text.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)),
    );
  }, [source, query]);

  const filtered = useMemo(
    () =>
      railSrc.filter(
        (m) =>
          (sentiment === "all" || m.sentiment === sentiment) &&
          (intentFilters.length === 0 || intentFilters.includes(m.intent)),
      ),
    [railSrc, sentiment, intentFilters],
  );

  const feed = filtered.slice(0, visible);
  const negCount = filtered.filter((m) => m.sentiment === "negative").length;
  const selected = MENTIONS.find((m) => m.id === selectedId) ?? null;

  const sentimentCount = (k: Sentiment): number => railSrc.filter((m) => m.sentiment === k).length;

  const railIntents = INTENTS.map((k) => ({ k, count: railSrc.filter((m) => m.intent === k).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const railPeople = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of railSrc) {
      if (m.username !== "Public post") counts.set(m.username, (counts.get(m.username) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [railSrc]);

  const toggleIntent = (k: Intent) => {
    setIntentFilters((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
    setVisible(PAGE_SIZE);
  };

  const clearFilters = () => {
    setSentiment("all");
    setIntentFilters([]);
    setSource("all");
    setQuery("");
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex overflow-hidden rounded-control border border-line">
            {(["all", ...SENTIMENTS] as const).map((k, i) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setSentiment(k);
                  setVisible(PAGE_SIZE);
                }}
                className={`cursor-pointer border-none px-3 py-[7px] text-[13px] hover:text-ink ${i > 0 ? "border-l border-line" : ""} ${
                  sentiment === k ? "bg-surface2 font-medium text-ink" : "bg-surface text-ink2"
                }`}
              >
                {k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as SourceFilter);
              setVisible(PAGE_SIZE);
            }}
            className="rounded-control border border-line bg-surface px-2.5 py-[7px] text-[13px] text-ink"
          >
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search mentions"
            className="min-w-40 flex-1 rounded-control border border-line bg-surface px-3 py-[7px] text-[13px] text-ink"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {INTENTS.map((k) => {
            const on = intentFilters.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleIntent(k)}
                className={`cursor-pointer rounded-full px-3 py-1 text-[13px] hover:border-ink3 ${
                  on ? "border border-accent bg-warn-bg text-accent" : "border border-line bg-transparent text-ink2"
                }`}
              >
                {INTENT_LABEL[k]}
              </button>
            );
          })}
        </div>

        <div className="text-[13px] text-ink3">
          {filtered.length} mentions · {negCount} negative
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 py-12 text-center">
            <div className="text-ink2">No mentions match these filters.</div>
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer rounded-control border border-line bg-transparent px-3.5 py-[7px] text-[13px] font-medium text-accent hover:bg-surface2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {feed.map((m) => (
              <MentionCard key={m.id} mention={m} selected={m.id === selectedId} onOpen={() => setSelectedId(m.id)} />
            ))}
          </div>
        )}

        {filtered.length > visible ? (
          <button
            type="button"
            onClick={() => setVisible((v) => v + LOAD_MORE)}
            className="cursor-pointer self-center rounded-control border border-line bg-transparent px-5 py-2 text-[13px] text-ink2 hover:bg-surface2 hover:text-ink"
          >
            Load more
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:flex min-[1100px]:flex-col">
        <RailCard title="This view">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[32px] leading-none font-semibold">{railSrc.length}</span>
            <span className="text-[13px] text-ink2">mentions</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface2">
            {RAIL_BAR_ORDER.map((k) => {
              const c = sentimentCount(k);
              return (
                <div
                  key={k}
                  title={`${k} · ${c}`}
                  style={{
                    width: `${railSrc.length ? Math.round((c / railSrc.length) * 100) : 0}%`,
                    background: SENTIMENT_COLOR[k],
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            {RAIL_SENTIMENTS.map((r) => {
              const on = sentiment === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setSentiment(on ? "all" : r.key);
                    setVisible(PAGE_SIZE);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-control border px-2 py-1.5 text-left text-[13px] text-ink2 hover:bg-surface2"
                  style={{
                    borderColor: on ? "var(--color-accent)" : "transparent",
                    background: on ? "var(--color-surface2)" : "transparent",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: SENTIMENT_COLOR[r.key] }} />
                    {r.label}
                  </span>
                  <span className="font-mono text-ink">{sentimentCount(r.key)}</span>
                </button>
              );
            })}
          </div>
        </RailCard>

        <RailCard title="Top intents" gap={12}>
          <div className="flex flex-col gap-2.5">
            {railIntents.map((x) => {
              const on = intentFilters.includes(x.k);
              return (
                <button
                  key={x.k}
                  type="button"
                  onClick={() => toggleIntent(x.k)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-control border bg-transparent px-2 py-1.5 text-left text-[13px] hover:border-ink3"
                  style={{ borderColor: on ? "var(--color-accent)" : "var(--color-line)" }}
                >
                  <span className="text-ink2">{INTENT_LABEL[x.k]}</span>
                  <span className="font-mono text-ink">{x.count}</span>
                </button>
              );
            })}
          </div>
        </RailCard>

        <RailCard title="Most active" gap={10}>
          {railPeople.map((p) => (
            <div key={p.username} className="flex items-center gap-2.5">
              <div className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full border border-line bg-surface2 font-display text-[11px] font-semibold text-ink2">
                {p.username.replace("@", "").charAt(0)?.toUpperCase()}
              </div>
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.username}</span>
              <span className="font-mono text-[13px] text-ink2">{p.count}</span>
            </div>
          ))}
        </RailCard>
      </div>

      {selected ? <MentionSheet mention={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

export default function MentionsPage() {
  return (
    <Suspense>
      <MentionsScreen />
    </Suspense>
  );
}
