"use client";

import { useState } from "react";
import { INITIAL_TAGS, type Hashtag } from "@/lib/demo-data";
import { Toggle } from "@/components/toggle";
import { RailCard } from "@/components/rail-card";

const TAG_PATTERN = /^[A-Za-z0-9_]+$/;
const TAG_LIMIT = 30;
const TABLE_COLS = "minmax(0,1fr) 52px 64px 88px 62px";

export default function HashtagsPage() {
  const [tags, setTags] = useState<readonly Hashtag[]>(INITIAL_TAGS);
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  const activeCount = tags.filter((t) => t.active).length;
  const activeWithPosts = tags.filter((t) => t.active && t.posts > 0);
  const maxTagPosts = Math.max(1, ...activeWithPosts.map((t) => t.posts));
  const leaderboard = [...activeWithPosts].sort((a, b) => b.posts - a.posts);
  const quotaPct = Math.round((activeCount / TAG_LIMIT) * 100);

  const addTag = () => {
    const v = newTag.trim().replace(/^#/, "").toLowerCase();
    if (!TAG_PATTERN.test(v)) {
      setTagError("Hashtags are letters, numbers and underscores only — no spaces or #.");
      return;
    }
    if (tags.some((t) => t.name === v)) {
      setTagError(`Already tracking #${v}.`);
      return;
    }
    setTags((prev) => [...prev, { name: v, active: true, posts: 0, polled: "just added" }]);
    setNewTag("");
    setTagError(null);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[13px] text-ink2">
            Track up to {TAG_LIMIT} public hashtags. Instagram limits how many you can query per week.
          </div>
          <span className="flex-none rounded-full border border-line px-2.5 py-[3px] font-mono text-[11px] text-ink2">
            {activeCount} of {TAG_LIMIT} this week
          </span>
        </div>

        <div className="flex gap-2">
          <input
            value={newTag}
            onChange={(e) => {
              setNewTag(e.target.value);
              setTagError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            placeholder="Add a hashtag, e.g. omahi"
            className="flex-1 rounded-control border border-line bg-surface px-3 py-[9px] text-[15px] text-ink"
          />
          <button
            type="button"
            onClick={addTag}
            className="cursor-pointer rounded-control border-none bg-accent px-[18px] py-[9px] text-[15px] font-medium text-surface hover:bg-accent-hover"
          >
            Add
          </button>
        </div>

        {tagError ? <div className="text-[13px] text-neg">{tagError}</div> : null}

        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div
            className="grid gap-2.5 border-b border-line px-4 py-2.5 text-[11px] tracking-[0.06em] text-ink3 uppercase"
            style={{ gridTemplateColumns: TABLE_COLS }}
          >
            <span>Hashtag</span>
            <span>Active</span>
            <span>Posts</span>
            <span>Polled</span>
            <span />
          </div>
          {tags.map((t, i) => (
            <div
              key={t.name}
              className="grid items-center gap-2.5 border-b border-line px-4 py-3 hover:bg-surface2"
              style={{ gridTemplateColumns: TABLE_COLS }}
            >
              <span className="truncate text-[15px] font-medium">#{t.name}</span>
              <Toggle
                on={t.active}
                label={`Toggle #${t.name}`}
                onToggle={() => setTags((prev) => prev.map((x, j) => (j === i ? { ...x, active: !x.active } : x)))}
              />
              <span className="font-mono text-[13px]" style={{ color: t.posts > 0 ? "var(--color-ink)" : "var(--color-ink3)" }}>
                {t.posts}
              </span>
              <span className="text-[13px] text-ink2">{t.polled}</span>
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((_, j) => j !== i))}
                className="cursor-pointer border-none bg-transparent p-0 text-right text-[13px] text-ink3 hover:text-neg"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-card border border-accent bg-warn-bg px-5 py-3">
          <div className="text-[13px] text-accent">
            Hashtag tracking needs Meta&apos;s approval for this app. Everything else works without it.
          </div>
          <a href="#" onClick={(e) => e.preventDefault()} className="flex-none text-[13px]">
            How approval works
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:flex min-[1100px]:flex-col">
        <RailCard title="Volume · 7 days">
          {leaderboard.length > 0 ? (
            <div className="flex flex-col gap-3">
              {leaderboard.map((t, i) => (
                <div key={t.name} className="flex flex-col gap-[5px]">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink">#{t.name}</span>
                    <span className="font-mono text-ink">{t.posts}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((t.posts / maxTagPosts) * 100)}%`,
                        background: i === 0 ? "var(--color-accent)" : "#6B7690",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-ink2">No active hashtags yet. Toggle one on to start collecting posts.</div>
          )}
        </RailCard>

        <RailCard
          title="Weekly quota"
          gap={12}
          header={
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] tracking-[0.08em] text-ink3 uppercase">Weekly quota</span>
              <span className="font-mono text-[13px] text-ink">
                {activeCount} / {TAG_LIMIT}
              </span>
            </div>
          }
        >
          <div className="h-2 overflow-hidden rounded-full bg-surface2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${quotaPct}%` }} />
          </div>
          <div className="text-[13px] text-ink2">
            {TAG_LIMIT - activeCount} slots left. Instagram resets your query budget every Monday.
          </div>
        </RailCard>

        <RailCard title="Trending" gap={8}>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[22px] font-semibold">#cycletracking</span>
            <span className="text-[13px] text-pos">▲ 40%</span>
          </div>
          <div className="text-[13px] text-ink2">Most new posts this week came from #cycletracking.</div>
        </RailCard>
      </div>
    </div>
  );
}
