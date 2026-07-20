import {
  enrichmentSchema,
  mentionEventSchema,
  type Alert,
  type AlertRule,
  type AlertRulePatch,
  type Intent,
  type MentionDetailResponse,
  type StatsOverviewResponse,
} from "@petal/core";
import { schema, type Db } from "@petal/db";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";

/**
 * Web read-side of the database. SQL lives here (never in route handlers),
 * mirroring the worker's store.ts: reads go through the exported @petal/db
 * drizzle schema, writes reuse repositories where they exist. Every row is
 * parsed back into a frozen core type at the boundary (plan §5.3).
 */

export type ActiveAccount = { readonly id: string; readonly igUserId: string; readonly username: string };

/** Single-tenant: the one connected account. Null when nothing is connected (empty DB). */
export async function getActiveAccount(db: Db): Promise<ActiveAccount | null> {
  const [row] = await db
    .select({ id: schema.accounts.id, igUserId: schema.accounts.igUserId, username: schema.accounts.username })
    .from(schema.accounts)
    .where(eq(schema.accounts.status, "active"))
    .limit(1);
  return row ?? null;
}

// ---------- stats overview ----------

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
const shiftDay = (day: string, n: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The overview's byIntent (plan §7) carries every intent — the frozen schema requires a full record. */
const zeroIntents = (): Record<Intent, number> => ({
  complaint: 0,
  praise: 0,
  question: 0,
  purchase_intent: 0,
  spam: 0,
  other: 0,
});

type StatsData = StatsOverviewResponse["data"];
type DayPoint = StatsData["series"][number];

type WindowTotals = {
  readonly mentions: number;
  readonly negative: number;
  readonly negativeShare: number;
  readonly purchaseIntent: number;
};

/**
 * Overview computed strictly from `daily_aggregates` (plan §7 — never scans
 * raw events). Deltas compare the requested window against the equally-sized
 * window immediately before it. `topMedia` is summed from each day's stored
 * top-5, so it is a close approximation, not an exact global ranking.
 */
export async function getStatsOverview(db: Db, accountId: string, days: number, now: Date): Promise<StatsData> {
  const today = utcDay(now);
  const currentDates = Array.from({ length: days }, (_unused, i) => shiftDay(today, i - (days - 1)));
  const currentStart = currentDates[0] ?? today;
  const prevStart = shiftDay(currentStart, -days);
  const prevDates = Array.from({ length: days }, (_unused, i) => shiftDay(prevStart, i));

  const rows = await db
    .select()
    .from(schema.dailyAggregates)
    .where(
      and(
        eq(schema.dailyAggregates.accountId, accountId),
        gte(schema.dailyAggregates.date, prevStart),
        lte(schema.dailyAggregates.date, today),
      ),
    );
  const byDate = new Map(rows.map((r) => [r.date, r]));

  const series: DayPoint[] = currentDates.map((date) => {
    const r = byDate.get(date);
    return {
      date,
      total: r?.mentionsTotal ?? 0,
      positive: r?.positive ?? 0,
      negative: r?.negative ?? 0,
      neutral: r?.neutral ?? 0,
      mixed: r?.mixed ?? 0,
    };
  });

  const byIntent = zeroIntents();
  const mediaCounts = new Map<string, number>();
  let mentions = 0;
  let negative = 0;
  for (const date of currentDates) {
    const r = byDate.get(date);
    if (r === undefined) continue;
    mentions += r.mentionsTotal;
    negative += r.negative;
    for (const [intent, count] of Object.entries(r.byIntent)) {
      if (intent in byIntent) byIntent[intent as Intent] += count;
    }
    for (const { mediaId, mentions: n } of r.topMedia) {
      mediaCounts.set(mediaId, (mediaCounts.get(mediaId) ?? 0) + n);
    }
  }
  const purchaseIntent = byIntent.purchase_intent;

  const prev = summarizeWindow(prevDates, byDate);
  const currentNegShare = mentions > 0 ? negative / mentions : 0;

  const topMediaIds = [...mediaCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const captions = await getMediaCaptions(
    db,
    topMediaIds.map(([id]) => id),
  );
  const topMedia = topMediaIds.map(([mediaId, count]) => ({
    mediaId,
    caption: captions.get(mediaId) ?? null,
    mentions: count,
  }));

  return {
    totals: { mentions, negativeShare: round1(currentNegShare * 100) / 100, purchaseIntent },
    deltas: {
      mentionsPct: prev.mentions > 0 ? round1(((mentions - prev.mentions) / prev.mentions) * 100) : null,
      negativeSharePts: prev.mentions > 0 ? round1((currentNegShare - prev.negativeShare) * 100) : null,
      purchaseIntent: prev.mentions > 0 ? purchaseIntent - prev.purchaseIntent : null,
    },
    series,
    byIntent,
    topMedia,
  };
}

/** Zeroed overview for the no-account / empty-DB case — still a full `days` series. */
export function emptyStatsOverview(days: number, now: Date): StatsData {
  const today = utcDay(now);
  const series: DayPoint[] = Array.from({ length: days }, (_unused, i) => ({
    date: shiftDay(today, i - (days - 1)),
    total: 0,
    positive: 0,
    negative: 0,
    neutral: 0,
    mixed: 0,
  }));
  return {
    totals: { mentions: 0, negativeShare: 0, purchaseIntent: 0 },
    deltas: { mentionsPct: null, negativeSharePts: null, purchaseIntent: null },
    series,
    byIntent: zeroIntents(),
    topMedia: [],
  };
}

function summarizeWindow(dates: readonly string[], byDate: Map<string, typeof schema.dailyAggregates.$inferSelect>): WindowTotals {
  let mentions = 0;
  let negative = 0;
  let purchaseIntent = 0;
  for (const date of dates) {
    const r = byDate.get(date);
    if (r === undefined) continue;
    mentions += r.mentionsTotal;
    negative += r.negative;
    purchaseIntent += r.byIntent.purchase_intent ?? 0;
  }
  return { mentions, negative, negativeShare: mentions > 0 ? negative / mentions : 0, purchaseIntent };
}

async function getMediaCaptions(db: Db, ids: readonly string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: schema.media.id, caption: schema.media.caption })
    .from(schema.media)
    .where(inArray(schema.media.id, [...ids]));
  return new Map(rows.map((r) => [r.id, r.caption]));
}

// ---------- mention detail ----------

type MentionDetailData = MentionDetailResponse["data"];

export async function getMentionDetail(db: Db, accountId: string, id: string): Promise<MentionDetailData | null> {
  const [row] = await db
    .select({ event: schema.mentionEvents, enrichment: schema.enrichments })
    .from(schema.mentionEvents)
    .leftJoin(schema.enrichments, eq(schema.enrichments.mentionEventId, schema.mentionEvents.id))
    .where(and(eq(schema.mentionEvents.accountId, accountId), eq(schema.mentionEvents.id, id)))
    .limit(1);
  if (row === undefined) return null;

  const event = mentionEventSchema.parse({
    id: row.event.id,
    accountId: row.event.accountId,
    source: row.event.source,
    igObjectId: row.event.igObjectId,
    mediaId: row.event.mediaId,
    authorUsername: row.event.authorUsername,
    text: row.event.text,
    permalink: row.event.permalink,
    occurredAt: row.event.occurredAt.toISOString(),
    ingestedVia: row.event.ingestedVia,
    raw: row.event.raw,
  });
  const enrichment =
    row.enrichment === null
      ? null
      : enrichmentSchema.parse({
          mentionEventId: row.enrichment.mentionEventId,
          sentiment: row.enrichment.sentiment,
          intent: row.enrichment.intent,
          confidence: row.enrichment.confidence,
          model: row.enrichment.model,
          promptVersion: row.enrichment.promptVersion,
          latencyMs: row.enrichment.latencyMs,
          costUsd: Number(row.enrichment.costUsd),
          method: row.enrichment.method,
        });

  let media: MentionDetailData["media"] = null;
  if (event.mediaId !== null) {
    const [m] = await db
      .select({
        id: schema.media.id,
        caption: schema.media.caption,
        permalink: schema.media.permalink,
        postedAt: schema.media.postedAt,
      })
      .from(schema.media)
      .where(eq(schema.media.id, event.mediaId))
      .limit(1);
    if (m !== undefined) {
      media = { id: m.id, caption: m.caption, permalink: m.permalink, postedAt: m.postedAt.toISOString() };
    }
  }

  return { event, enrichment, media };
}

// ---------- alerts ----------

export async function listAlertRules(db: Db, accountId: string): Promise<AlertRule[]> {
  const rows = await db
    .select()
    .from(schema.alertRules)
    .where(eq(schema.alertRules.accountId, accountId))
    .orderBy(schema.alertRules.kind);
  return rows.map((r) => ({ id: r.id, kind: r.kind, params: r.params, enabled: r.enabled }));
}

export async function listFiredAlerts(db: Db, accountId: string, limit: number): Promise<Alert[]> {
  const rows = await db
    .select({
      id: schema.alerts.id,
      ruleId: schema.alerts.ruleId,
      firedAt: schema.alerts.firedAt,
      summary: schema.alerts.summary,
      deliveredSlack: schema.alerts.deliveredSlack,
    })
    .from(schema.alerts)
    .innerJoin(schema.alertRules, eq(schema.alertRules.id, schema.alerts.ruleId))
    .where(eq(schema.alertRules.accountId, accountId))
    .orderBy(desc(schema.alerts.firedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    firedAt: r.firedAt.toISOString(),
    summary: r.summary,
    deliveredSlack: r.deliveredSlack,
  }));
}

/** Enable/disable and tune a rule (plan §7). Returns null when the rule is not this account's. */
export async function updateAlertRule(
  db: Db,
  accountId: string,
  id: string,
  patch: AlertRulePatch,
): Promise<AlertRule | null> {
  const set: { enabled?: boolean; params?: Record<string, number> } = {};
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.params !== undefined) set.params = patch.params;

  const updated = await db
    .update(schema.alertRules)
    .set(set)
    .where(and(eq(schema.alertRules.id, id), eq(schema.alertRules.accountId, accountId)))
    .returning();
  const row = updated[0];
  if (row === undefined) return null;
  return { id: row.id, kind: row.kind, params: row.params, enabled: row.enabled };
}
