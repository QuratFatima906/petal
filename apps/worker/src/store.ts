import { and, desc, eq, inArray } from "drizzle-orm";
import { deleteMentionEventsByIgObjectIds, schema, type Db } from "@petal/db";
import type { MentionSource } from "@petal/core";

/**
 * The worker's read-side of the database, plus the poll-lane deletion
 * mirror. Writes to mention_events go exclusively through the ingest
 * consumer (upsertMentionEvent); the pollers only read watermarks and
 * hashtag state here.
 */

export type AccountRef = { readonly id: string; readonly igUserId: string };

export async function getAccountByIgUserId(db: Db, igUserId: string): Promise<AccountRef | null> {
  const [row] = await db
    .select({ id: schema.accounts.id, igUserId: schema.accounts.igUserId })
    .from(schema.accounts)
    .where(eq(schema.accounts.igUserId, igUserId))
    .limit(1);
  return row ?? null;
}

export async function getActiveAccount(db: Db): Promise<AccountRef | null> {
  const [row] = await db
    .select({ id: schema.accounts.id, igUserId: schema.accounts.igUserId })
    .from(schema.accounts)
    .where(eq(schema.accounts.status, "active"))
    .limit(1);
  return row ?? null;
}

export async function mediaExists(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .limit(1);
  return row !== undefined;
}

/** Poller state the pollers depend on; db-free in unit tests. */
export type PollStore = {
  /** Watermark check: which of these ig object ids are already mirrored? */
  readonly knownIgObjectIds: (
    source: MentionSource,
    ids: readonly string[],
  ) => Promise<ReadonlySet<string>>;
  /** Known mention ids for re-hydration — polling cannot discover new mentions (plan L11). */
  readonly listKnownMentionRefs: (limit: number) => Promise<{
    readonly captionMentionMediaIds: readonly string[];
    readonly commentMentionIds: readonly string[];
  }>;
  readonly listActiveHashtags: () => Promise<readonly { id: string; name: string }[]>;
  readonly markHashtagPolled: (id: string, at: Date) => Promise<void>;
  /** Deletion mirroring (plan §13): a re-fetch 404/disappearance removes the mirrored row. */
  readonly deleteMirrored: (source: MentionSource, igObjectIds: readonly string[]) => Promise<number>;
};

export const createDbPollStore = (db: Db, accountId: string): PollStore => ({
  knownIgObjectIds: async (source, ids) => {
    if (ids.length === 0) return new Set();
    const rows = await db
      .select({ igObjectId: schema.mentionEvents.igObjectId })
      .from(schema.mentionEvents)
      .where(
        and(
          eq(schema.mentionEvents.accountId, accountId),
          eq(schema.mentionEvents.source, source),
          inArray(schema.mentionEvents.igObjectId, [...ids]),
        ),
      );
    return new Set(rows.map((r) => r.igObjectId));
  },

  listKnownMentionRefs: async (limit) => {
    const refs = async (source: MentionSource): Promise<readonly string[]> => {
      const rows = await db
        .select({ igObjectId: schema.mentionEvents.igObjectId })
        .from(schema.mentionEvents)
        .where(and(eq(schema.mentionEvents.accountId, accountId), eq(schema.mentionEvents.source, source)))
        .orderBy(desc(schema.mentionEvents.occurredAt))
        .limit(limit);
      return rows.map((r) => r.igObjectId);
    };
    return {
      captionMentionMediaIds: await refs("caption_mention"),
      commentMentionIds: await refs("comment_mention"),
    };
  },

  listActiveHashtags: async () => {
    const rows = await db
      .select({ id: schema.hashtags.id, name: schema.hashtags.name })
      .from(schema.hashtags)
      .where(and(eq(schema.hashtags.accountId, accountId), eq(schema.hashtags.active, true)));
    return rows;
  },

  markHashtagPolled: async (id, at) => {
    await db.update(schema.hashtags).set({ lastPolledAt: at }).where(eq(schema.hashtags.id, id));
  },

  deleteMirrored: (source, igObjectIds) => deleteMentionEventsByIgObjectIds(db, source, igObjectIds),
});
