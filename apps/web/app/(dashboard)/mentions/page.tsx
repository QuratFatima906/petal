"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  INTENTS,
  INTENT_LABEL,
  MENTIONS,
  SENTIMENTS,
  type Intent,
  type Sentiment,
  type Source,
} from "@/lib/demo-data";
import { MentionCard } from "@/components/mention-card";
import { MentionSheet } from "@/components/mention-sheet";

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MENTIONS.filter(
      (m) =>
        (sentiment === "all" || m.sentiment === sentiment) &&
        (intentFilters.length === 0 || intentFilters.includes(m.intent)) &&
        (source === "all" || m.source === source) &&
        (q === "" || m.text.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)),
    );
  }, [sentiment, intentFilters, source, query]);

  const feed = filtered.slice(0, visible);
  const negCount = filtered.filter((m) => m.sentiment === "negative").length;
  const selected = MENTIONS.find((m) => m.id === selectedId) ?? null;

  const clearFilters = () => {
    setSentiment("all");
    setIntentFilters([]);
    setSource("all");
    setQuery("");
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-3">
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
              onClick={() => {
                setIntentFilters((prev) => (on ? prev.filter((x) => x !== k) : [...prev, k]));
                setVisible(PAGE_SIZE);
              }}
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
