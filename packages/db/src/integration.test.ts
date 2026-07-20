import { randomBytes } from "node:crypto";
import {
  intentSchema,
  mentionsQuerySchema,
  sentimentSchema,
  type Enrichment,
  type MentionEvent,
} from "@petal/core";
import { FIXTURE_ACCOUNT_ID, FIXTURE_COUNT, OWNED_MEDIA_CAPTIONS, buildFixtureEvents, seedFixtures } from "@petal/fixtures";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { parseEncryptionKey, type TokenEncryptionKey } from "./crypto";
import { testDb, truncateAll } from "./integration-harness";
import {
  deleteExpiredMentionEvents,
  deleteMentionEventsByIgObjectIds,
  getAccountAccessToken,
  getCachedEnrichment,
  insertEnrichment,
  listMentions,
  parkDeadLetter,
  recomputeDayAggregate,
  setCachedEnrichment,
  upsertAccount,
  upsertMedia,
  upsertMentionEvent,
} from "./repositories";
import { mentionEvents } from "./schema";

/** Fixed clock (plan §5.9): every windowed assertion derives from NOW. */
const NOW = new Date("2026-07-20T12:00:00.000Z");

const keyResult = parseEncryptionKey(randomBytes(32).toString("hex"));
if (!keyResult.ok) throw keyResult.error;
const KEY: TokenEncryptionKey = keyResult.value;

const db = testDb?.db;

async function countEvents(): Promise<number> {
  if (db === undefined) throw new Error("no db");
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(mentionEvents);
  return rows[0]?.n ?? 0;
}

async function seedAll(): Promise<void> {
  if (db === undefined) throw new Error("no db");
  await truncateAll(db);
  await upsertAccount(
    db,
    {
      id: FIXTURE_ACCOUNT_ID,
      igUserId: "1789000000000",
      username: "omahi.app",
      accessToken: null,
      tokenExpiresAt: null,
      connectedAt: NOW.toISOString(),
      status: "active",
    },
  );
  await Promise.all(
    OWNED_MEDIA_CAPTIONS.map((caption, i) =>
      upsertMedia(db, {
        id: `media-${i}`,
        accountId: FIXTURE_ACCOUNT_ID,
        origin: "owned",
        caption,
        mediaType: "IMAGE",
        permalink: null,
        postedAt: new Date(NOW.getTime() - (i + 1) * 86_400_000).toISOString(),
        likeCount: 0,
        commentsCount: 0,
        raw: {},
      }),
    ),
  );
  await seedFixtures(NOW, (event) => upsertMentionEvent(db, event));
}

describe.skipIf(testDb === null)("@petal/db integration", () => {
  beforeAll(async () => {
    await seedAll();
  });

  it("seeds the full fixture dataset through the production upsert path", async () => {
    expect(await countEvents()).toBe(FIXTURE_COUNT);
  });

  it("seeding twice yields identical row counts (idempotent upsert)", async () => {
    if (db === undefined) throw new Error("no db");
    await seedFixtures(NOW, (event) => upsertMentionEvent(db, event));
    expect(await countEvents()).toBe(FIXTURE_COUNT);
  });

  it("upsert reports inserted only for fresh rows and refreshes mutable fields", async () => {
    if (db === undefined) throw new Error("no db");
    const [first] = buildFixtureEvents(NOW);
    if (first === undefined) throw new Error("empty fixtures");
    expect((await upsertMentionEvent(db, first)).inserted).toBe(false);

    // Same idempotency key arriving from the other lane with edited text.
    const replay: MentionEvent = { ...first, id: "different-ulid", text: "edited on Instagram", ingestedVia: "poll" };
    expect((await upsertMentionEvent(db, replay)).inserted).toBe(false);
    expect(await countEvents()).toBe(FIXTURE_COUNT);

    const { items } = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 100, q: "edited on Instagram" }));
    expect(items).toHaveLength(1);
    expect(items[0]?.event.id).toBe(first.id); // original id survives the replay
  });

  it("paginates the feed with a keyset cursor, stable under concurrent inserts", async () => {
    if (db === undefined) throw new Error("no db");
    const pageOne = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 30 }));
    expect(pageOne.items).toHaveLength(30);
    expect(pageOne.nextCursor).not.toBeNull();

    // A brand-new mention lands while the user scrolls — page 2 must not shift.
    const newest: MentionEvent = {
      id: "fx-newest",
      accountId: FIXTURE_ACCOUNT_ID,
      source: "own_comment",
      igObjectId: "17800000newest",
      mediaId: null,
      authorUsername: "late_arrival",
      text: "arrived mid-pagination",
      permalink: null,
      occurredAt: NOW.toISOString(),
      ingestedVia: "webhook",
      raw: {},
    };
    await upsertMentionEvent(db, newest);

    const collected = [...pageOne.items];
    let cursor = pageOne.nextCursor;
    while (cursor !== null) {
      const page = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 30, cursor }));
      collected.push(...page.items);
      cursor = page.nextCursor;
    }
    const ids = collected.map((i) => i.event.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toHaveLength(FIXTURE_COUNT); // no skips; the new row only affects fresh page-1 reads
    expect(ids).not.toContain("fx-newest");

    const timestamps = collected.map((i) => Date.parse(i.event.occurredAt));
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);

    await deleteMentionEventsByIgObjectIds(db, "own_comment", ["17800000newest"]);
  });

  it("filters by sentiment/intent via the enrichment join and by source/q directly", async () => {
    if (db === undefined) throw new Error("no db");
    const events = buildFixtureEvents(NOW);
    const sentiments = sentimentSchema.options;
    const intents = intentSchema.options;
    await Promise.all(
      events.map((event, i) =>
        insertEnrichment(db, {
          mentionEventId: event.id,
          sentiment: sentiments[i % sentiments.length] as Enrichment["sentiment"],
          intent: intents[i % intents.length] as Enrichment["intent"],
          confidence: 0.9,
          model: "claude-haiku-4-5-20251001",
          promptVersion: "p1",
          latencyMs: 120,
          costUsd: 0.00042,
          method: "llm",
        }),
      ),
    );

    const negative = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 100, sentiment: "negative" }));
    const expectedNegative = events.filter((_, i) => sentiments[i % sentiments.length] === "negative").length;
    expect(negative.items).toHaveLength(expectedNegative);
    expect(negative.items.every((i) => i.enrichment?.sentiment === "negative")).toBe(true);
    expect(negative.items.every((i) => Math.abs((i.enrichment?.costUsd ?? 0) - 0.00042) < 1e-9)).toBe(true);

    const hashtagOnly = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 100, source: "hashtag_media" }));
    expect(hashtagOnly.items.every((i) => i.event.source === "hashtag_media")).toBe(true);

    const urdu = await listMentions(db, FIXTURE_ACCOUNT_ID, mentionsQuerySchema.parse({ limit: 100, q: "zabardast" }));
    expect(urdu.items.length).toBeGreaterThan(0);
  });

  it("recomputed day aggregate matches a brute-force count over fixtures", async () => {
    if (db === undefined) throw new Error("no db");
    const events = buildFixtureEvents(NOW);
    const sentiments = sentimentSchema.options;
    // Yesterday UTC is guaranteed to hold fixture events (offsets 24–48h).
    const date = new Date(NOW.getTime() - 86_400_000).toISOString().slice(0, 10);

    const inDay = (e: MentionEvent) => e.occurredAt.slice(0, 10) === date;
    const dayEvents = events.filter(inDay);
    expect(dayEvents.length).toBeGreaterThan(0);

    const agg = await recomputeDayAggregate(db, FIXTURE_ACCOUNT_ID, date);
    expect(agg.mentionsTotal).toBe(dayEvents.length);

    const bruteNegative = events.filter((e, i) => inDay(e) && sentiments[i % sentiments.length] === "negative").length;
    expect(agg.negative).toBe(bruteNegative);
    expect(agg.positive + agg.negative + agg.neutral + agg.mixed).toBe(dayEvents.length);

    const bruteBySource = dayEvents.reduce<Record<string, number>>((acc, e) => {
      acc[e.source] = (acc[e.source] ?? 0) + 1;
      return acc;
    }, {});
    expect(agg.bySource).toEqual(bruteBySource);

    const bruteMedia = dayEvents.reduce<Record<string, number>>((acc, e) => {
      if (e.mediaId !== null) acc[e.mediaId] = (acc[e.mediaId] ?? 0) + 1;
      return acc;
    }, {});
    for (const { mediaId, mentions } of agg.topMedia) {
      expect(bruteMedia[mediaId]).toBe(mentions);
    }
    expect(agg.topMedia.length).toBeLessThanOrEqual(5);
  });

  it("enrichment cache round trips and counts hits", async () => {
    if (db === undefined) throw new Error("no db");
    expect(await getCachedEnrichment(db, "sha256-miss")).toBeNull();
    await setCachedEnrichment(db, "sha256-hit", { sentiment: "positive", intent: "praise" });
    expect(await getCachedEnrichment(db, "sha256-hit")).toEqual({ sentiment: "positive", intent: "praise" });
    await getCachedEnrichment(db, "sha256-hit");
    const [row] = await db.execute(sql`select hit_count from enrichment_cache where content_hash = 'sha256-hit'`);
    expect(row).toMatchObject({ hit_count: 2 });
  });

  it("parks dead letters", async () => {
    if (db === undefined) throw new Error("no db");
    const id = await parkDeadLetter(
      db,
      { queue: "enrich", jobName: "enrich-batch", payload: { eventIds: ["fx-001"] }, error: "boom", attempts: 3 },
      NOW,
    );
    const [row] = await db.execute(sql`select queue, attempts, parked_at from dead_letters where id = ${id}`);
    expect(row).toMatchObject({ queue: "enrich", attempts: 3 });
  });

  it("stores the access token encrypted and round-trips it", async () => {
    if (db === undefined) throw new Error("no db");
    await upsertAccount(
      db,
      {
        id: FIXTURE_ACCOUNT_ID,
        igUserId: "1789000000000",
        username: "omahi.app",
        accessToken: "EAAG-live-user-token",
        tokenExpiresAt: new Date(NOW.getTime() + 55 * 86_400_000).toISOString(),
        connectedAt: NOW.toISOString(),
        status: "active",
      },
      KEY,
    );
    const [row] = await db.execute(sql`select access_token_encrypted from accounts where id = ${FIXTURE_ACCOUNT_ID}`);
    const stored = (row as { access_token_encrypted: string }).access_token_encrypted;
    expect(stored).not.toContain("EAAG");
    expect(await getAccountAccessToken(db, FIXTURE_ACCOUNT_ID, KEY)).toEqual({ ok: true, value: "EAAG-live-user-token" });
  });

  it("refuses to store a token without an encryption key", async () => {
    if (db === undefined) throw new Error("no db");
    await expect(
      upsertAccount(db, {
        id: FIXTURE_ACCOUNT_ID,
        igUserId: "1789000000000",
        username: "omahi.app",
        accessToken: "cleartext-token",
        tokenExpiresAt: null,
        connectedAt: NOW.toISOString(),
        status: "active",
      }),
    ).rejects.toThrow(/encryption key/);
  });

  it("retention deletes events past the window and cascades enrichments", async () => {
    if (db === undefined) throw new Error("no db");
    const events = buildFixtureEvents(NOW);
    const expected = events.filter((e) => Date.parse(e.occurredAt) < NOW.getTime() - 7 * 86_400_000).length;
    expect(expected).toBeGreaterThan(0);

    const deleted = await deleteExpiredMentionEvents(db, { retentionDays: 7, now: NOW });
    expect(deleted).toBe(expected);
    expect(await countEvents()).toBe(FIXTURE_COUNT - expected);

    const [row] = await db.execute(sql`select count(*)::int as n from enrichments`);
    expect(row).toMatchObject({ n: FIXTURE_COUNT - expected });
  });
});
