/**
 * Demo data for the dashboard, derived from the shared @petal/fixtures
 * dataset (80 mention events) instead of the old hand-written inline set.
 * The fixtures carry raw events only, so this module supplies the
 * deterministic demo enrichment (sentiment/intent/confidence/method) that
 * the WP6 enrichment worker will later produce for real, and computes every
 * aggregate the screens show. The clock is fixed (plan §5.9: time is
 * injected) so the rendered UI and the e2e assertions stay stable.
 */

import type { EnrichMethod, Intent, MentionEvent, MentionSource, Sentiment } from "@petal/core";
import { OWNED_MEDIA_CAPTIONS, buildFixtureEvents } from "@petal/fixtures";

export type { EnrichMethod, Intent, Sentiment } from "@petal/core";
/** Alias kept from the inline-dataset days; components import `Source`. */
export type Source = MentionSource;

export const SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;
export const INTENTS = ["complaint", "praise", "question", "purchase_intent", "spam", "other"] as const;

export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: "var(--color-pos)",
  negative: "var(--color-neg)",
  neutral: "var(--color-neu)",
  mixed: "var(--color-mix)",
};

export const INTENT_LABEL: Record<Intent, string> = {
  complaint: "complaint",
  praise: "praise",
  question: "question",
  purchase_intent: "purchase intent",
  spam: "spam",
  other: "other",
};

export const SOURCE_LABEL: Record<Source, string> = {
  own_comment: "Comment on your post",
  caption_mention: "Mentioned you in a caption",
  comment_mention: "Comment mention",
  hashtag_media: "Hashtag post",
};

/** Fixed demo clock: Sunday 2026-07-19 14:44 PKT — the mockup's Jul 13 – Jul 19 week. */
export const DEMO_NOW = new Date("2026-07-19T14:44:00+05:00");

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** All display and bucketing happens in Pakistan time, like the mockup. */
const PKT_OFFSET_MS = 5 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad2 = (n: number): string => String(n).padStart(2, "0");

const inPkt = (t: number): Date => new Date(t + PKT_OFFSET_MS);

const fmtMonthDay = (t: number): string => {
  const d = inPkt(t);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const fmtTimestamp = (t: number): string => {
  const d = inPkt(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

const relativeLabel = (t: number): string => {
  const mins = Math.max(1, Math.round((DEMO_NOW.getTime() - t) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

type DemoEnrichment = {
  readonly sentiment: Sentiment;
  readonly intent: Intent;
  readonly confidence: number;
  readonly method: EnrichMethod;
};

/**
 * One row per fixture event, in dataset order: [expected author, sentiment,
 * intent, confidence, method?]. The author column is verified against the
 * fixtures at module load so a reordered or extended dataset fails loudly
 * instead of silently misclassifying.
 */
type EnrichmentRow = readonly [string | null, Sentiment, Intent, number, EnrichMethod?];

const ENRICHMENT_ROWS: readonly EnrichmentRow[] = [
  ["lena.codes", "positive", "praise", 0.96],
  ["cyclesyncedlife", "positive", "praise", 0.9],
  ["minimal_tabs", "positive", "praise", 0.77],
  ["newtab_nerd", "positive", "praise", 0.88],
  ["sana.builds", "positive", "praise", 0.92],
  ["quietsoftware", "positive", "praise", 0.91],
  ["tabgarden", "positive", "praise", 0.86],
  ["roshni_dev", "positive", "praise", 0.93],
  ["ovulation_nation", "positive", "praise", 0.9],
  ["browsertweaks", "positive", "praise", 0.89],
  ["girlwhocodes_", "positive", "praise", 0.94],
  ["softwaregardener", "positive", "praise", 0.92],
  ["lowtechlife", "positive", "praise", 0.88],
  ["amna.reads", "positive", "praise", 0.85],
  ["pixel_priya", "positive", "praise", 0.82],
  ["steadyhabits", "positive", "praise", 0.91],
  ["casual_carrie", "positive", "praise", 0.84],
  ["thebrowsergal", "positive", "praise", 0.87],
  ["tabfresh", "neutral", "question", 0.91],
  ["devdaisy", "neutral", "question", 0.9],
  ["curious_cat22", "neutral", "question", 0.89],
  ["healthnerd_hs", "neutral", "question", 0.92],
  ["spreadsheet_sam", "neutral", "question", 0.87],
  ["modest_muser", "neutral", "question", 0.88],
  ["nightowl_nadia", "neutral", "question", 0.86],
  ["privacy_prof", "neutral", "question", 0.93],
  ["new_here_nina", "neutral", "question", 0.9],
  ["skeptical_sister", "neutral", "question", 0.85],
  ["genuinely_asking", "neutral", "question", 0.83],
  ["firefoxfaithful", "neutral", "question", 0.94],
  ["gadgetgrrl", "mixed", "other", 0.81],
  ["safari_sailor", "neutral", "question", 0.89],
  ["widget_wisher", "neutral", "other", 0.78],
  ["notify_me_pls", "neutral", "other", 0.8],
  ["mobile_mona", "mixed", "other", 0.76],
  ["partner_pete", "neutral", "question", 0.84],
  ["noorulain_x", "positive", "purchase_intent", 0.89],
  ["impulse_installer", "positive", "purchase_intent", 0.95],
  ["tab_collector", "positive", "purchase_intent", 0.87],
  ["hana.switches", "positive", "purchase_intent", 0.9],
  ["linkplease_lena", "positive", "purchase_intent", 0.92],
  ["weekend_wanda", "positive", "purchase_intent", 0.81],
  ["maya_reads", "negative", "complaint", 0.93],
  ["salikaz", "negative", "complaint", 0.95],
  ["grumpy_gwen", "negative", "complaint", 0.84],
  ["syncless_in_seattle", "negative", "complaint", 0.9],
  ["detail_dana", "negative", "complaint", 0.88],
  ["quietly_annoyed", "negative", "complaint", 0.86],
  ["privacywonk", "mixed", "other", 0.72],
  ["datadoubter", "mixed", "other", 0.7],
  ["burned_before", "mixed", "question", 0.74],
  ["vpn_vera", "positive", "praise", 0.9],
  ["growthhacks365", "neutral", "spam", 0.64, "lexicon"],
  ["crypto_queen_x", "neutral", "spam", 0.71, "lexicon"],
  ["followers4cheap", "neutral", "spam", 0.68, "lexicon"],
  ["dropship_dan", "neutral", "spam", 0.62, "lexicon"],
  ["sarcastic_sam", "mixed", "other", 0.84],
  ["deadpan_dee", "mixed", "other", 0.79],
  ["eyeroll_emma", "mixed", "other", 0.77],
  ["mahnoor.k", "positive", "praise", 0.9],
  ["fatima_codes", "neutral", "question", 0.88],
  ["areeba.z", "negative", "complaint", 0.87],
  ["hira_designs", "positive", "praise", 0.91],
  ["zoya_skeptic", "mixed", "question", 0.75],
  ["laiba.installs", "neutral", "other", 0.73],
  ["ammi_ki_beti", "neutral", "question", 0.89],
  ["mashal.m", "positive", "praise", 0.92],
  ["sehar_speaks", "positive", "praise", 0.86],
  ["irregular_iqra", "neutral", "question", 0.87],
  ["raat_ki_rani", "neutral", "question", 0.9],
  ["do_computer", "negative", "complaint", 0.85],
  ["savings_sana", "neutral", "question", 0.82],
  ["edge_ki_awaz", "negative", "complaint", 0.8],
  ["teesra_din", "positive", "praise", 0.88],
  ["khud_check_kiya", "positive", "praise", 0.83],
  ["tea_and_tabs", "positive", "praise", 0.81],
  ["unfollowed_apps", "positive", "praise", 0.93],
  ["notes_by_noor", "neutral", "question", 0.86],
  ["graceful_exit", "mixed", "other", 0.82],
  [null, "positive", "praise", 0.88],
];

const EVENTS: readonly MentionEvent[] = buildFixtureEvents(DEMO_NOW);

if (EVENTS.length !== ENRICHMENT_ROWS.length) {
  throw new Error(`Demo enrichment covers ${ENRICHMENT_ROWS.length} events but fixtures provide ${EVENTS.length}`);
}

const enrichmentFor = (event: MentionEvent, index: number): DemoEnrichment => {
  const row = ENRICHMENT_ROWS[index];
  if (!row || row[0] !== event.authorUsername) {
    throw new Error(`Demo enrichment out of sync with @petal/fixtures at index ${index} (${event.authorUsername ?? "null"})`);
  }
  return { sentiment: row[1], intent: row[2], confidence: row[3], method: row[4] ?? "llm" };
};

type EnrichedEvent = {
  readonly event: MentionEvent;
  readonly enrichment: DemoEnrichment;
  /** occurredAt as epoch ms, precomputed for windowing */
  readonly at: number;
};

const ENRICHED: readonly EnrichedEvent[] = EVENTS.map((event, i) => ({
  event,
  enrichment: enrichmentFor(event, i),
  at: new Date(event.occurredAt).getTime(),
}));

/** Owned post "posted" dates: a day before the earliest mention on that post. */
const MEDIA_POSTED = new Map<string, number>();
for (const { event, at } of ENRICHED) {
  if (event.mediaId !== null) {
    const prev = MEDIA_POSTED.get(event.mediaId);
    if (prev === undefined || at < prev) MEDIA_POSTED.set(event.mediaId, at);
  }
}

const mediaCaption = (mediaId: string): string => {
  const caption = OWNED_MEDIA_CAPTIONS[Number(mediaId.replace("media-", ""))];
  if (caption === undefined) throw new Error(`Unknown fixture media id: ${mediaId}`);
  return caption;
};

const mediaPostedLabel = (mediaId: string): string => {
  const earliest = MEDIA_POSTED.get(mediaId);
  if (earliest === undefined) throw new Error(`Unknown fixture media id: ${mediaId}`);
  return fmtMonthDay(earliest - DAY_MS);
};

export type MediaRef = {
  readonly caption: string;
  readonly posted: string;
};

export type Mention = {
  readonly id: string;
  readonly username: string;
  readonly source: Source;
  readonly when: string;
  readonly ts: string;
  readonly text: string;
  readonly sentiment: Sentiment;
  readonly intent: Intent;
  readonly confidence: number;
  readonly method: EnrichMethod;
  readonly media: MediaRef | null;
};

export const MENTIONS: readonly Mention[] = [...ENRICHED]
  .sort((a, b) => b.at - a.at)
  .map(({ event, enrichment, at }) => ({
    id: event.id,
    username: event.authorUsername === null ? "Public post" : `@${event.authorUsername}`,
    source: event.source,
    when: relativeLabel(at),
    ts: fmtTimestamp(at),
    text: event.text,
    sentiment: enrichment.sentiment,
    intent: enrichment.intent,
    confidence: enrichment.confidence,
    method: enrichment.method,
    media: event.mediaId === null ? null : { caption: mediaCaption(event.mediaId), posted: mediaPostedLabel(event.mediaId) },
  }));

/** Start of the current Mon–Sun week (00:00 Monday, PKT), as a UTC instant. */
const startOfPktDay = DEMO_NOW.getTime() - ((DEMO_NOW.getTime() + PKT_OFFSET_MS) % DAY_MS);
const daysSinceMonday = (inPkt(DEMO_NOW.getTime()).getUTCDay() + 6) % 7;
const WEEK_START = startOfPktDay - daysSinceMonday * DAY_MS;

export const WEEK_RANGE_LABEL = `${fmtMonthDay(WEEK_START)} – ${fmtMonthDay(WEEK_START + 6 * DAY_MS)}`;

const inWindow = (from: number, to: number): readonly EnrichedEvent[] => ENRICHED.filter((x) => x.at >= from && x.at < to);

const WEEK = inWindow(WEEK_START, DEMO_NOW.getTime() + 1);
const PRIOR_WEEK = inWindow(WEEK_START - 7 * DAY_MS, WEEK_START);

const countBy = <K extends string>(items: readonly EnrichedEvent[], keys: readonly K[], key: (x: EnrichedEvent) => K): Record<K, number> => {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const item of items) counts[key(item)] += 1;
  return counts;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayAggregate = {
  readonly label: string;
  readonly pos: number;
  readonly neu: number;
  readonly mix: number;
  readonly neg: number;
};

export const DAYS: readonly DayAggregate[] = DAY_LABELS.map((label, i) => {
  const day = inWindow(WEEK_START + i * DAY_MS, WEEK_START + (i + 1) * DAY_MS);
  const c = countBy(day, SENTIMENTS, (x) => x.enrichment.sentiment);
  return { label, pos: c.positive, neu: c.neutral, mix: c.mixed, neg: c.negative };
});

export const dayTotal = (d: DayAggregate): number => d.pos + d.neu + d.mix + d.neg;

const negativeSharePct = (items: readonly EnrichedEvent[]): number =>
  items.length === 0 ? 0 : (items.filter((x) => x.enrichment.sentiment === "negative").length / items.length) * 100;

const purchaseIntentCount = (items: readonly EnrichedEvent[]): number =>
  items.filter((x) => x.enrichment.intent === "purchase_intent").length;

export type WeekStats = {
  readonly mentions: number;
  readonly negativeSharePct: number;
  readonly purchaseIntent: number;
  /** vs the prior Mon–Sun week, all from the same dataset */
  readonly mentionsDeltaPct: number;
  readonly negativeShareDeltaPts: number;
  readonly purchaseIntentDelta: number;
};

export const WEEK_STATS: WeekStats = {
  mentions: WEEK.length,
  negativeSharePct: Math.round(negativeSharePct(WEEK)),
  purchaseIntent: purchaseIntentCount(WEEK),
  mentionsDeltaPct: PRIOR_WEEK.length === 0 ? 0 : Math.round(((WEEK.length - PRIOR_WEEK.length) / PRIOR_WEEK.length) * 100),
  negativeShareDeltaPts: Math.round(negativeSharePct(WEEK) - negativeSharePct(PRIOR_WEEK)),
  purchaseIntentDelta: purchaseIntentCount(WEEK) - purchaseIntentCount(PRIOR_WEEK),
};

export type IntentRow = {
  readonly label: string;
  readonly count: number;
  readonly color: string;
};

const INTENT_ROW_ORDER: readonly { intent: Intent; label: string; color: string }[] = [
  { intent: "praise", label: "Praise", color: "var(--color-pos)" },
  { intent: "question", label: "Question", color: "var(--color-neu)" },
  { intent: "complaint", label: "Complaint", color: "var(--color-neg)" },
  { intent: "purchase_intent", label: "Purchase intent", color: "var(--color-accent)" },
  { intent: "spam", label: "Spam", color: "var(--color-ink3)" },
  { intent: "other", label: "Other", color: "var(--color-mix)" },
];

export const INTENT_ROWS: readonly IntentRow[] = INTENT_ROW_ORDER.map(({ intent, label, color }) => ({
  label,
  color,
  count: WEEK.filter((x) => x.enrichment.intent === intent).length,
}));

export type TopPost = {
  readonly caption: string;
  readonly posted: string;
  readonly mentions: number;
};

const weekMediaCounts = new Map<string, number>();
for (const { event } of WEEK) {
  if (event.mediaId !== null) weekMediaCounts.set(event.mediaId, (weekMediaCounts.get(event.mediaId) ?? 0) + 1);
}

export const TOP_POSTS: readonly TopPost[] = [...weekMediaCounts.entries()]
  .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
  .slice(0, 3)
  .map(([mediaId, count]) => ({ caption: mediaCaption(mediaId), posted: mediaPostedLabel(mediaId), mentions: count }));

export const BUCKET_TIMES = ["00–06", "06–12", "12–18", "18–24"] as const;

export type PulseBucket = {
  readonly key: string;
  readonly dayLabel: string;
  readonly timeLabel: string;
  readonly count: number;
  /** null when the bucket has no mentions */
  readonly dominant: Sentiment | null;
  readonly isLive: boolean;
  readonly isFuture: boolean;
};

/** 28 pulse buckets: 7 days × four 6h slots, counted from the dataset. */
export const PULSE_BUCKETS: readonly PulseBucket[] = Array.from({ length: 28 }, (_, i) => {
  const start = WEEK_START + Math.floor(i / 4) * DAY_MS + (i % 4) * 6 * HOUR_MS;
  const items = inWindow(start, start + 6 * HOUR_MS);
  const counts = countBy(items, SENTIMENTS, (x) => x.enrichment.sentiment);
  let dominant: Sentiment | null = null;
  for (const s of SENTIMENTS) {
    if (counts[s] > (dominant === null ? 0 : counts[dominant])) dominant = s;
  }
  return {
    key: `${DAY_LABELS[Math.floor(i / 4)] ?? ""}-${i % 4}`,
    dayLabel: DAY_LABELS[Math.floor(i / 4)] ?? "",
    timeLabel: BUCKET_TIMES[i % 4] ?? "",
    count: items.length,
    dominant,
    isLive: DEMO_NOW.getTime() >= start && DEMO_NOW.getTime() < start + 6 * HOUR_MS,
    isFuture: start > DEMO_NOW.getTime(),
  };
});

export type Hashtag = {
  readonly name: string;
  readonly active: boolean;
  readonly posts: number;
  readonly polled: string;
};

/** 7-day post volume per tracked tag, counted from hashtag_media fixtures. */
const tagPosts = (name: string): number =>
  WEEK.filter((x) => x.event.source === "hashtag_media" && x.event.text.toLowerCase().includes(`#${name}`)).length;

export const INITIAL_TAGS: readonly Hashtag[] = [
  { name: "omahi", active: true, posts: tagPosts("omahi"), polled: "20m ago" },
  { name: "cycletracking", active: true, posts: tagPosts("cycletracking"), polled: "1h ago" },
  { name: "newtabextension", active: false, posts: tagPosts("newtabextension"), polled: "2d ago" },
  { name: "cyclesyncing", active: true, posts: tagPosts("cyclesyncing"), polled: "1h ago" },
];

export type RuleParam = {
  readonly k: string;
  readonly label: string;
  readonly v: string;
};

export type AlertRule = {
  readonly id: "volume_spike" | "negative_share";
  readonly name: string;
  readonly desc: string;
  readonly enabled: boolean;
  readonly params: readonly RuleParam[];
};

export const INITIAL_RULES: readonly AlertRule[] = [
  {
    id: "volume_spike",
    name: "Volume spike",
    desc: "Fires when 24h mentions reach a multiple of the 7 day daily average.",
    enabled: true,
    params: [
      { k: "mult", label: "Multiplier", v: "2" },
      { k: "min", label: "Min events", v: "10" },
      { k: "cool", label: "Cooldown (h)", v: "6" },
    ],
  },
  {
    id: "negative_share",
    name: "Negative share",
    desc: "Fires when negative mentions cross a share of the last 24 hours.",
    enabled: true,
    params: [
      { k: "share", label: "Share (%)", v: "30" },
      { k: "min", label: "Min events", v: "5" },
      { k: "cool", label: "Cooldown (h)", v: "6" },
    ],
  },
];

export type FiredAlert = {
  readonly when: string;
  readonly rule: string;
  readonly summary: string;
  readonly delivered: boolean;
  /** sentiment filter applied when clicking through to the feed */
  readonly filter: Sentiment | "all";
};

/** Alert history is demo flavor from the mockup — no alert fixtures exist yet (WP7). */
export const FIRED_ALERTS: readonly FiredAlert[] = [
  { when: "Jul 16 · 09:40", rule: "Volume spike", summary: "118 mentions in 24h — 2.6× the 46/day average", delivered: true, filter: "all" },
  { when: "Jul 15 · 22:10", rule: "Negative share", summary: "34% negative across 41 mentions", delivered: true, filter: "negative" },
  { when: "Jul 12 · 08:20", rule: "Volume spike", summary: "96 mentions in 24h — 2.1× average", delivered: false, filter: "all" },
];
