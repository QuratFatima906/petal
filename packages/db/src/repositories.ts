import {
  ValidationError,
  enrichmentSchema,
  mediaSchema,
  mentionEventSchema,
  type Enrichment,
  type FeedItem,
  type Media,
  type MentionEvent,
  type MentionsQuery,
} from "@petal/core";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "./client";
import { decodeCursor, encodeCursor } from "./cursor";
import { decryptToken, encryptToken, type TokenEncryptionKey } from "./crypto";
import {
  accounts,
  dailyAggregates,
  deadLetters,
  enrichmentCache,
  enrichments,
  media,
  mentionEvents,
} from "./schema";

/**
 * Repository layer: the only place that speaks SQL. Inputs are parsed with
 * the frozen core schemas at the boundary; outputs are core domain types —
 * no drizzle rows leak past this file (plan WP2).
 */

// ---------- accounts ----------

export type UpsertAccountInput = {
  readonly id: string;
  readonly igUserId: string;
  readonly username: string;
  readonly accessToken: string | null;
  readonly tokenExpiresAt: string | null;
  readonly connectedAt: string;
  readonly status: "active" | "token_expired" | "disconnected";
};

export async function upsertAccount(db: Db, input: UpsertAccountInput, key?: TokenEncryptionKey): Promise<void> {
  if (input.accessToken !== null && key === undefined) {
    throw new ValidationError("an access token requires an encryption key — tokens are never stored in the clear");
  }
  const encrypted = input.accessToken !== null && key !== undefined ? encryptToken(input.accessToken, key) : null;
  const values = {
    id: input.id,
    igUserId: input.igUserId,
    username: input.username,
    accessTokenEncrypted: encrypted,
    tokenExpiresAt: input.tokenExpiresAt === null ? null : new Date(input.tokenExpiresAt),
    connectedAt: new Date(input.connectedAt),
    status: input.status,
  };
  await db
    .insert(accounts)
    .values(values)
    .onConflictDoUpdate({ target: accounts.id, set: { ...values, updatedAt: new Date() } });
}

/** Returns the decrypted token, null when the account has none stored. */
export async function getAccountAccessToken(db: Db, id: string, key: TokenEncryptionKey) {
  const [row] = await db
    .select({ encrypted: accounts.accessTokenEncrypted })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  if (row === undefined || row.encrypted === null) return null;
  return decryptToken(row.encrypted, key);
}

// ---------- media ----------

export async function upsertMedia(db: Db, input: Media): Promise<void> {
  const m = mediaSchema.parse(input);
  const values = {
    id: m.id,
    accountId: m.accountId,
    origin: m.origin,
    caption: m.caption,
    mediaType: m.mediaType,
    permalink: m.permalink,
    postedAt: new Date(m.postedAt),
    likeCount: m.likeCount,
    commentsCount: m.commentsCount,
    raw: m.raw,
  };
  await db
    .insert(media)
    .values(values)
    .onConflictDoUpdate({
      target: media.id,
      set: {
        caption: values.caption,
        permalink: values.permalink,
        likeCount: values.likeCount,
        commentsCount: values.commentsCount,
        raw: values.raw,
        updatedAt: new Date(),
      },
    });
}

// ---------- mention events ----------

type MentionEventRow = typeof mentionEvents.$inferSelect;

function rowToMentionEvent(row: MentionEventRow): MentionEvent {
  return mentionEventSchema.parse({
    id: row.id,
    accountId: row.accountId,
    source: row.source,
    igObjectId: row.igObjectId,
    mediaId: row.mediaId,
    authorUsername: row.authorUsername,
    text: row.text,
    permalink: row.permalink,
    occurredAt: row.occurredAt.toISOString(),
    ingestedVia: row.ingestedVia,
    raw: row.raw,
  });
}

/**
 * Idempotent on (source, ig_object_id) — the plan §13 idempotency key.
 * `inserted` distinguishes a fresh row from a replayed webhook/poll overlap,
 * via `xmax = 0` (a row version untouched by any update is a fresh insert),
 * so WP5 can enqueue enrichment exactly once per new item.
 */
export async function upsertMentionEvent(db: Db, event: MentionEvent): Promise<{ inserted: boolean }> {
  const e = mentionEventSchema.parse(event);
  const [row] = await db
    .insert(mentionEvents)
    .values({
      id: e.id,
      accountId: e.accountId,
      source: e.source,
      igObjectId: e.igObjectId,
      mediaId: e.mediaId,
      authorUsername: e.authorUsername,
      text: e.text,
      permalink: e.permalink,
      occurredAt: new Date(e.occurredAt),
      ingestedVia: e.ingestedVia,
      raw: e.raw,
    })
    .onConflictDoUpdate({
      target: [mentionEvents.source, mentionEvents.igObjectId],
      set: {
        // Comment text is editable on Instagram; keep mirrored content fresh.
        text: e.text,
        authorUsername: e.authorUsername,
        permalink: e.permalink,
        raw: e.raw,
        updatedAt: new Date(),
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return { inserted: row?.inserted ?? false };
}

/** Poll-lane deletion mirroring (plan §13): remove rows Instagram no longer returns. */
export async function deleteMentionEventsByIgObjectIds(
  db: Db,
  source: MentionEvent["source"],
  igObjectIds: readonly string[],
): Promise<number> {
  if (igObjectIds.length === 0) return 0;
  const deleted = await db
    .delete(mentionEvents)
    .where(and(eq(mentionEvents.source, source), inArray(mentionEvents.igObjectId, [...igObjectIds])))
    .returning({ id: mentionEvents.id });
  return deleted.length;
}

// ---------- enrichments ----------

export async function insertEnrichment(db: Db, enrichment: Enrichment): Promise<void> {
  const e = enrichmentSchema.parse(enrichment);
  const values = {
    mentionEventId: e.mentionEventId,
    sentiment: e.sentiment,
    intent: e.intent,
    confidence: e.confidence,
    model: e.model,
    promptVersion: e.promptVersion,
    latencyMs: e.latencyMs,
    costUsd: e.costUsd.toFixed(6),
    method: e.method,
  };
  // Job retries may re-score an event; last write wins on the PK.
  await db
    .insert(enrichments)
    .values(values)
    .onConflictDoUpdate({ target: enrichments.mentionEventId, set: { ...values, updatedAt: new Date() } });
}

export async function getCachedEnrichment(db: Db, contentHash: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .update(enrichmentCache)
    .set({ hitCount: sql`${enrichmentCache.hitCount} + 1` })
    .where(eq(enrichmentCache.contentHash, contentHash))
    .returning({ result: enrichmentCache.result });
  return row?.result ?? null;
}

export async function setCachedEnrichment(db: Db, contentHash: string, result: Record<string, unknown>): Promise<void> {
  await db
    .insert(enrichmentCache)
    .values({ contentHash, result })
    .onConflictDoUpdate({ target: enrichmentCache.contentHash, set: { result, updatedAt: new Date() } });
}

// ---------- feed ----------

type EnrichmentRow = typeof enrichments.$inferSelect;

function rowToEnrichment(row: EnrichmentRow): Enrichment {
  return enrichmentSchema.parse({
    mentionEventId: row.mentionEventId,
    sentiment: row.sentiment,
    intent: row.intent,
    confidence: row.confidence,
    model: row.model,
    promptVersion: row.promptVersion,
    latencyMs: row.latencyMs,
    costUsd: Number(row.costUsd),
    method: row.method,
  });
}

export type ListMentionsResult = { readonly items: FeedItem[]; readonly nextCursor: string | null };

export async function listMentions(db: Db, accountId: string, query: MentionsQuery): Promise<ListMentionsResult> {
  const conditions = [eq(mentionEvents.accountId, accountId)];
  if (query.source !== undefined) conditions.push(eq(mentionEvents.source, query.source));
  if (query.q !== undefined && query.q !== "") conditions.push(ilike(mentionEvents.text, `%${query.q}%`));
  if (query.sentiment !== undefined) conditions.push(eq(enrichments.sentiment, query.sentiment));
  if (query.intent !== undefined) conditions.push(eq(enrichments.intent, query.intent));

  if (query.cursor !== undefined) {
    const decoded = decodeCursor(query.cursor);
    if (!decoded.ok) throw decoded.error;
    const { occurredAt, id } = decoded.value;
    const at = new Date(occurredAt);
    const keyset = or(
      lt(mentionEvents.occurredAt, at),
      and(eq(mentionEvents.occurredAt, at), lt(mentionEvents.id, id)),
    );
    if (keyset !== undefined) conditions.push(keyset);
  }

  const rows = await db
    .select({ event: mentionEvents, enrichment: enrichments })
    .from(mentionEvents)
    .leftJoin(enrichments, eq(enrichments.mentionEventId, mentionEvents.id))
    .where(and(...conditions))
    .orderBy(desc(mentionEvents.occurredAt), desc(mentionEvents.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const items: FeedItem[] = page.map((r) => ({
    event: rowToMentionEvent(r.event),
    enrichment: r.enrichment === null ? null : rowToEnrichment(r.enrichment),
  }));
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > query.limit && last !== undefined
      ? encodeCursor({ occurredAt: last.event.occurredAt.toISOString(), id: last.event.id })
      : null;
  return { items, nextCursor };
}

// ---------- aggregates ----------

export type DailyAggregate = {
  readonly accountId: string;
  readonly date: string;
  readonly mentionsTotal: number;
  readonly positive: number;
  readonly negative: number;
  readonly neutral: number;
  readonly mixed: number;
  readonly byIntent: Partial<Record<Enrichment["intent"], number>>;
  readonly bySource: Partial<Record<MentionEvent["source"], number>>;
  readonly topMedia: readonly { mediaId: string; mentions: number }[];
};

export async function upsertDailyAggregate(db: Db, agg: DailyAggregate): Promise<void> {
  const values = {
    accountId: agg.accountId,
    date: agg.date,
    mentionsTotal: agg.mentionsTotal,
    positive: agg.positive,
    negative: agg.negative,
    neutral: agg.neutral,
    mixed: agg.mixed,
    byIntent: agg.byIntent,
    bySource: agg.bySource,
    topMedia: [...agg.topMedia],
  };
  await db
    .insert(dailyAggregates)
    .values(values)
    .onConflictDoUpdate({ target: [dailyAggregates.accountId, dailyAggregates.date], set: { ...values, updatedAt: new Date() } });
}

/**
 * Recomputes one (account, UTC day) from raw events + enrichments and
 * upserts the rollup. Deliberately recompute-from-source rather than
 * incremental: idempotent under replays and immune to drift (plan §6.1
 * "debounced per day key" — the debounce lives in the worker, WP7).
 */
export async function recomputeDayAggregate(db: Db, accountId: string, date: string): Promise<DailyAggregate> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError(`not a YYYY-MM-DD date: ${date}`);
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({ event: mentionEvents, enrichment: enrichments })
    .from(mentionEvents)
    .leftJoin(enrichments, eq(enrichments.mentionEventId, mentionEvents.id))
    .where(
      and(
        eq(mentionEvents.accountId, accountId),
        gte(mentionEvents.occurredAt, dayStart),
        lt(mentionEvents.occurredAt, dayEnd),
      ),
    );

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  const byIntent: Partial<Record<Enrichment["intent"], number>> = {};
  const bySource: Partial<Record<MentionEvent["source"], number>> = {};
  const mediaCounts = new Map<string, number>();

  for (const { event, enrichment } of rows) {
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    if (event.mediaId !== null) mediaCounts.set(event.mediaId, (mediaCounts.get(event.mediaId) ?? 0) + 1);
    if (enrichment !== null) {
      sentimentCounts[enrichment.sentiment] += 1;
      byIntent[enrichment.intent] = (byIntent[enrichment.intent] ?? 0) + 1;
    }
  }

  const topMedia = [...mediaCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([mediaId, mentions]) => ({ mediaId, mentions }));

  const agg: DailyAggregate = {
    accountId,
    date,
    mentionsTotal: rows.length,
    ...sentimentCounts,
    byIntent,
    bySource,
    topMedia,
  };
  await upsertDailyAggregate(db, agg);
  return agg;
}

// ---------- dead letters ----------

export type ParkDeadLetterInput = {
  readonly queue: string;
  readonly jobName: string;
  readonly payload: Record<string, unknown>;
  readonly error: string;
  readonly attempts: number;
};

export async function parkDeadLetter(db: Db, input: ParkDeadLetterInput, now: Date): Promise<string> {
  const id = ulid(now.getTime());
  await db.insert(deadLetters).values({ id, ...input, parkedAt: now });
  return id;
}

// ---------- retention ----------

/** Deletes events past the retention window; enrichments follow via FK cascade. */
export async function deleteExpiredMentionEvents(
  db: Db,
  opts: { readonly retentionDays: number; readonly now: Date },
): Promise<number> {
  const cutoff = new Date(opts.now.getTime() - opts.retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(mentionEvents)
    .where(lt(mentionEvents.occurredAt, cutoff))
    .returning({ id: mentionEvents.id });
  return deleted.length;
}
