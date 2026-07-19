/** Demo dataset and domain unions, ported verbatim from the approved mockup (docs/design/petal-dashboard.dc.html). */

export type Sentiment = "positive" | "negative" | "neutral" | "mixed";
export type Intent = "complaint" | "praise" | "question" | "purchase_intent" | "spam" | "other";
export type Source = "own_comment" | "caption_mention" | "comment_mention" | "hashtag_media";
export type EnrichMethod = "llm" | "lexicon";

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

export const MENTIONS: readonly Mention[] = [
  { id: "m1", username: "@lena.codes", source: "own_comment", when: "12m ago", ts: "2026-07-19 14:32", text: "Love that everything stays on my device. No account, no cloud, exactly how it should be.", sentiment: "positive", intent: "praise", confidence: 0.96, method: "llm", media: { caption: "Local-only by design: how Omahi keeps your data yours", posted: "Jul 14" } },
  { id: "m2", username: "@maya_reads", source: "own_comment", when: "2h ago", ts: "2026-07-19 12:18", text: "The phase seems off by a day for me. Logged my start date twice and it still shows follicular.", sentiment: "negative", intent: "complaint", confidence: 0.93, method: "llm", media: { caption: "Phase colors, explained", posted: "Jul 16" } },
  { id: "m3", username: "@tabfresh", source: "own_comment", when: "3h ago", ts: "2026-07-19 11:05", text: "Does this sync across devices or is it per browser?", sentiment: "neutral", intent: "question", confidence: 0.91, method: "llm", media: { caption: "Meet Omahi — your cycle, on every new tab.", posted: "Jul 12" } },
  { id: "m4", username: "@salikaz", source: "comment_mention", when: "5h ago", ts: "2026-07-19 09:44", text: "@omahi.app my phase card disappeared after the last update. Reinstalled twice already.", sentiment: "negative", intent: "complaint", confidence: 0.95, method: "llm", media: null },
  { id: "m5", username: "@noorulain_x", source: "caption_mention", when: "6h ago", ts: "2026-07-19 08:21", text: "Okay where do I get this?? My new tab has been a wasteland forever. @omahi.app", sentiment: "positive", intent: "purchase_intent", confidence: 0.89, method: "llm", media: null },
  { id: "m6", username: "@privacywonk", source: "caption_mention", when: "9h ago", ts: "2026-07-19 05:37", text: "Skeptical of any cycle app tbh, but @omahi.app being local-only is a good start. Watching.", sentiment: "mixed", intent: "other", confidence: 0.72, method: "llm", media: null },
  { id: "m7", username: "Public post", source: "hashtag_media", when: "11h ago", ts: "2026-07-19 03:12", text: "New tab, but make it useful. #omahi #cycletracking", sentiment: "positive", intent: "praise", confidence: 0.88, method: "llm", media: null },
  { id: "m8", username: "@firefoxfaithful", source: "own_comment", when: "14h ago", ts: "2026-07-19 00:08", text: "Any plans for Firefox support? Would install today.", sentiment: "neutral", intent: "question", confidence: 0.94, method: "llm", media: { caption: "Meet Omahi — your cycle, on every new tab.", posted: "Jul 12" } },
  { id: "m9", username: "@gadgetgrrl", source: "own_comment", when: "16h ago", ts: "2026-07-18 22:40", text: "Gorgeous design, but I wish the phase card was smaller. It takes over the whole tab.", sentiment: "mixed", intent: "other", confidence: 0.81, method: "llm", media: { caption: "Phase colors, explained", posted: "Jul 16" } },
  { id: "m10", username: "@growthhacks365", source: "comment_mention", when: "18h ago", ts: "2026-07-18 20:15", text: "We help extensions 10x their installs. Check my profile for a free audit.", sentiment: "neutral", intent: "spam", confidence: 0.64, method: "lexicon", media: null },
  { id: "m11", username: "@devdaisy", source: "own_comment", when: "1d ago", ts: "2026-07-18 13:02", text: "Is my data actually private? What happens to it when I uninstall?", sentiment: "neutral", intent: "question", confidence: 0.9, method: "llm", media: { caption: "Local-only by design: how Omahi keeps your data yours", posted: "Jul 14" } },
  { id: "m12", username: "@minimal_tabs", source: "hashtag_media", when: "1d ago", ts: "2026-07-18 09:30", text: "Day 3 with #omahi and I actually know what phase I'm in without opening an app.", sentiment: "positive", intent: "praise", confidence: 0.77, method: "llm", media: null },
  { id: "m13", username: "@cyclesyncedlife", source: "own_comment", when: "2d ago", ts: "2026-07-17 17:55", text: "Just installed, obsessed. First tracker that doesn't feel creepy.", sentiment: "positive", intent: "praise", confidence: 0.9, method: "llm", media: { caption: "Meet Omahi — your cycle, on every new tab.", posted: "Jul 12" } },
  { id: "m14", username: "@sarcastic_sam", source: "caption_mention", when: "2d ago", ts: "2026-07-17 10:11", text: "Oh great, another extension that knows my body better than my doctor. (It's actually fine — @omahi.app keeps it all local, I checked.)", sentiment: "mixed", intent: "other", confidence: 0.84, method: "llm", media: null },
];

export type DayAggregate = {
  readonly label: string;
  readonly pos: number;
  readonly neu: number;
  readonly mix: number;
  readonly neg: number;
};

export const DAYS: readonly DayAggregate[] = [
  { label: "Mon", pos: 18, neu: 12, mix: 3, neg: 5 },
  { label: "Tue", pos: 22, neu: 15, mix: 4, neg: 6 },
  { label: "Wed", pos: 16, neu: 10, mix: 2, neg: 4 },
  { label: "Thu", pos: 27, neu: 14, mix: 5, neg: 9 },
  { label: "Fri", pos: 34, neu: 18, mix: 4, neg: 12 },
  { label: "Sat", pos: 25, neu: 13, mix: 3, neg: 7 },
  { label: "Sun", pos: 12, neu: 6, mix: 1, neg: 3 },
];

export const dayTotal = (d: DayAggregate): number => d.pos + d.neu + d.mix + d.neg;

export type IntentRow = {
  readonly label: string;
  readonly count: number;
  readonly color: string;
};

export const INTENT_ROWS: readonly IntentRow[] = [
  { label: "Praise", count: 118, color: "var(--color-pos)" },
  { label: "Question", count: 64, color: "var(--color-neu)" },
  { label: "Complaint", count: 41, color: "var(--color-neg)" },
  { label: "Purchase intent", count: 12, color: "var(--color-accent)" },
  { label: "Spam", count: 17, color: "var(--color-ink3)" },
  { label: "Other", count: 38, color: "var(--color-mix)" },
];

export type TopPost = {
  readonly caption: string;
  readonly posted: string;
  readonly mentions: number;
};

export const TOP_POSTS: readonly TopPost[] = [
  { caption: "Meet Omahi — your cycle, on every new tab.", posted: "Jul 12", mentions: 64 },
  { caption: "Local-only by design: how Omahi keeps your data yours", posted: "Jul 14", mentions: 31 },
  { caption: "Phase colors, explained", posted: "Jul 16", mentions: 22 },
];

export type Hashtag = {
  readonly name: string;
  readonly active: boolean;
  readonly posts: number;
  readonly polled: string;
};

export const INITIAL_TAGS: readonly Hashtag[] = [
  { name: "omahi", active: true, posts: 34, polled: "20m ago" },
  { name: "cycletracking", active: true, posts: 12, polled: "1h ago" },
  { name: "newtabextension", active: false, posts: 0, polled: "2d ago" },
  { name: "cyclesyncing", active: true, posts: 8, polled: "1h ago" },
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

export const FIRED_ALERTS: readonly FiredAlert[] = [
  { when: "Jul 16 · 09:40", rule: "Volume spike", summary: "118 mentions in 24h — 2.6× the 46/day average", delivered: true, filter: "all" },
  { when: "Jul 15 · 22:10", rule: "Negative share", summary: "34% negative across 41 mentions", delivered: true, filter: "negative" },
  { when: "Jul 12 · 08:20", rule: "Volume spike", summary: "96 mentions in 24h — 2.1× average", delivered: false, filter: "all" },
];

/** Dominant-sentiment pattern for the 28 pulse buckets (7 days × 4), from the mockup. */
export const PULSE_DOMINANT: readonly (keyof typeof PULSE_COLORS)[] = [
  "neu", "pos", "pos", "neu", "pos", "neg", "pos", "neu", "pos", "pos", "neu", "pos", "pos", "neg",
  "neg", "pos", "pos", "pos", "neg", "mix", "pos", "pos", "neu", "pos", "neu", "pos", "pos", "pos",
];

export const PULSE_COLORS = {
  pos: "var(--color-pos)",
  neu: "var(--color-neu)",
  mix: "var(--color-mix)",
  neg: "var(--color-neg)",
} as const;

/** Share of a day's volume falling into each 6h bucket, from the mockup. */
export const BUCKET_SHAPE = [0.15, 0.35, 0.3, 0.2] as const;
export const BUCKET_TIMES = ["00–06", "06–12", "12–18", "18–24"] as const;
