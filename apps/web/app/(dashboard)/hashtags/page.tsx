"use client";

import { useState } from "react";
import { INITIAL_TAGS, type Hashtag } from "@/lib/demo-data";
import { Toggle } from "@/components/toggle";

const TAG_PATTERN = /^[A-Za-z0-9_]+$/;
const TAG_LIMIT = 30;

export default function HashtagsPage() {
  const [tags, setTags] = useState<readonly Hashtag[]>(INITIAL_TAGS);
  const [newTag, setNewTag] = useState("");
  const [tagError, setTagError] = useState(false);

  const activeCount = tags.filter((t) => t.active).length;

  const addTag = () => {
    const v = newTag.trim().replace(/^#/, "");
    if (!TAG_PATTERN.test(v)) {
      setTagError(true);
      return;
    }
    setTags((prev) => [...prev, { name: v.toLowerCase(), active: true, posts: 0, polled: "just added" }]);
    setNewTag("");
    setTagError(false);
  };

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
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
            setTagError(false);
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

      {tagError ? (
        <div className="text-[13px] text-neg">Hashtags are letters, numbers and underscores only — no spaces or #.</div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="grid grid-cols-[1fr_90px_120px_110px_70px] gap-2 border-b border-line px-4 py-2.5 text-[11px] tracking-[0.08em] text-ink3 uppercase">
          <span>Hashtag</span>
          <span>Active</span>
          <span>Posts · 7d</span>
          <span>Last polled</span>
          <span />
        </div>
        {tags.map((t, i) => (
          <div
            key={t.name}
            className="grid grid-cols-[1fr_90px_120px_110px_70px] items-center gap-2 border-b border-line px-4 py-3 hover:bg-surface2"
          >
            <span className="text-[15px] font-medium">#{t.name}</span>
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
  );
}
