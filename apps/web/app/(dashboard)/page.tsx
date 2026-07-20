"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DAYS,
  INTENT_ROWS,
  MENTIONS,
  PULSE_BUCKETS,
  SENTIMENT_COLOR,
  TOP_POSTS,
  WEEK_RANGE_LABEL,
  WEEK_STATS,
  dayTotal,
} from "@/lib/demo-data";
import { MentionCard } from "@/components/mention-card";

const CHART_H = 172;

const arrow = (delta: number): string => (delta >= 0 ? "▲" : "▼");

export default function OverviewPage() {
  const router = useRouter();
  const maxDay = Math.max(...DAYS.map(dayTotal));

  const statCards = [
    {
      label: "Mentions",
      value: String(WEEK_STATS.mentions),
      delta: `${arrow(WEEK_STATS.mentionsDeltaPct)} ${Math.abs(WEEK_STATS.mentionsDeltaPct)}% vs prior 7 days`,
      deltaColor: WEEK_STATS.mentionsDeltaPct >= 0 ? "var(--color-pos)" : "var(--color-neg)",
      tip: "",
    },
    {
      label: "Negative share",
      value: `${WEEK_STATS.negativeSharePct}%`,
      delta: `${arrow(WEEK_STATS.negativeShareDeltaPts)} ${Math.abs(WEEK_STATS.negativeShareDeltaPts)} pts vs prior 7 days`,
      deltaColor: WEEK_STATS.negativeShareDeltaPts > 0 ? "var(--color-neg)" : "var(--color-pos)",
      tip: "",
    },
    {
      label: "Purchase intent",
      value: String(WEEK_STATS.purchaseIntent),
      delta: `${arrow(WEEK_STATS.purchaseIntentDelta)} ${Math.abs(WEEK_STATS.purchaseIntentDelta)} vs prior 7 days`,
      deltaColor: WEEK_STATS.purchaseIntentDelta >= 0 ? "var(--color-pos)" : "var(--color-neg)",
      tip: "",
    },
    { label: "Avg response gap", value: "—", delta: "Coming soon", deltaColor: "var(--color-ink3)", tip: "Response time tracking arrives in v2" },
  ];

  const maxBucket = Math.max(1, ...PULSE_BUCKETS.map((b) => b.count));
  const buckets = PULSE_BUCKETS.map((b) => ({
    key: b.key,
    tip: `${b.dayLabel} ${b.timeLabel} · ${b.count} mentions`,
    height: b.isFuture ? 2 : Math.max(3, Math.round((b.count / maxBucket) * 52)),
    color: b.isFuture
      ? "var(--color-surface2)"
      : b.isLive
        ? "var(--color-accent)"
        : b.dominant === null
          ? "var(--color-surface2)"
          : SENTIMENT_COLOR[b.dominant],
    isLive: b.isLive,
  }));

  const maxIntent = Math.max(...INTENT_ROWS.map((i) => i.count));
  const attention = MENTIONS.filter((m) => m.sentiment === "negative" || m.intent === "complaint").slice(0, 5);
  const px = (n: number): number => Math.max(n > 0 ? 2 : 0, Math.round((n / maxDay) * CHART_H));

  const legend = [
    { label: "Positive", color: "var(--color-pos)" },
    { label: "Neutral", color: "var(--color-neu)" },
    { label: "Mixed", color: "var(--color-mix)" },
    { label: "Negative", color: "var(--color-neg)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="mb-3.5 flex items-baseline justify-between">
          <div className="text-[11px] tracking-[0.08em] text-ink3 uppercase">Pulse · 6h buckets</div>
          <div className="font-mono text-[11px] text-ink3">{WEEK_RANGE_LABEL}</div>
        </div>
        <div className="flex h-14 items-end gap-[3px] border-b border-line">
          {buckets.map((b) => (
            <div
              key={b.key}
              title={b.tip}
              className="min-w-0 flex-1 cursor-pointer rounded-t-[2px] transition-transform duration-150 ease-out hover:scale-y-[1.06] hover:opacity-100"
              style={{
                height: b.height,
                background: b.color,
                opacity: b.isLive ? 1 : 0.85,
                transformOrigin: "bottom",
                animation: b.isLive ? "livetick 2s ease-in-out infinite" : undefined,
              }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between">
          {DAYS.map((d) => (
            <span key={d.label} className="font-mono text-[11px] text-ink3">
              {d.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} title={s.tip} className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface p-5">
            <div className="text-[11px] tracking-[0.08em] text-ink3 uppercase">{s.label}</div>
            <div className="font-display text-[28px] leading-[1.15] font-semibold">{s.value}</div>
            <div className="text-[13px]" style={{ color: s.deltaColor }}>
              {s.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="min-w-0 rounded-card border border-line bg-surface p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <div className="text-[15px] font-medium">Mentions by day</div>
            <div className="flex gap-3">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-[5px] text-[11px] text-ink2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-[180px] items-end gap-3.5 border-b border-line px-1.5">
            {DAYS.map((d) => (
              <div
                key={d.label}
                title={`${d.label} · ${dayTotal(d)} mentions (${d.neg} negative)`}
                className="flex h-full flex-1 flex-col-reverse justify-start gap-0.5"
              >
                <div className="rounded-t-[2px] bg-pos" style={{ height: px(d.pos) }} />
                <div className="rounded-[2px] bg-neu" style={{ height: px(d.neu) }} />
                <div className="rounded-[2px] bg-mix" style={{ height: px(d.mix) }} />
                <div className="rounded-[2px] bg-neg" style={{ height: px(d.neg) }} />
              </div>
            ))}
          </div>
          <div className="flex gap-3.5 px-1.5 pt-2">
            {DAYS.map((d) => (
              <div key={d.label} className="flex-1 text-center font-mono text-[11px] text-ink3">
                {d.label}
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-card border border-line bg-surface p-5">
          <div className="mb-4 text-[15px] font-medium">Intent</div>
          <div className="flex flex-col gap-3.5">
            {INTENT_ROWS.map((it) => (
              <div key={it.label} className="flex flex-col gap-[5px]">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink2">{it.label}</span>
                  <span className="font-mono text-ink">{it.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round((it.count / maxIntent) * 100)}%`, background: it.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="min-w-0 rounded-card border border-line bg-surface p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[15px] font-medium">Needs attention</div>
            <Link href="/mentions?sentiment=negative" className="text-[13px]">
              View all negative
            </Link>
          </div>
          <div className="flex flex-col">
            {attention.map((m) => (
              <MentionCard key={m.id} mention={m} compact onOpen={() => router.push(`/mentions?open=${m.id}`)} />
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-card border border-line bg-surface p-5">
          <div className="mb-3 text-[15px] font-medium">Top posts</div>
          <div className="flex flex-col gap-3">
            {TOP_POSTS.map((p) => (
              <div
                key={p.caption}
                className="flex cursor-pointer items-center gap-3 rounded-control border border-line p-2 hover:bg-surface2"
              >
                <div
                  className="grid h-11 w-11 flex-none place-items-center rounded-control border border-line font-mono text-[9px] text-ink3"
                  style={{ background: "repeating-linear-gradient(45deg, var(--color-surface2) 0 6px, var(--color-surface) 6px 12px)" }}
                >
                  img
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{p.caption}</div>
                  <div className="text-[11px] text-ink3">{p.posted}</div>
                </div>
                <div className="flex-none text-right">
                  <div className="font-display text-[17px] font-semibold">{p.mentions}</div>
                  <div className="text-[11px] text-ink3">mentions</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
