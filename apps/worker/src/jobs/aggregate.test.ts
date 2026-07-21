import type { Enrichment, MentionEvent } from "@petal/core";
import {
  createDb,
  insertEnrichment,
  migrateDb,
  schema,
  upsertAccount,
  upsertMedia,
  upsertMentionEvent,
  type Db,
} from "@petal/db";
import { and, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";
import { silentLogger } from "../test-support";
import { createAggregateProcessor } from "./aggregate";

/**
 * Integration test for the aggregate consumer against dockerized Postgres.
 * Self-bootstraps a dedicated `petal_test_worker_agg` database so it never
 * races the worker's other integration suite's truncates (plan WP7 tests).
 * The recompute is asserted against hand-counted expectations, then re-run to
 * prove idempotency.
 */

const base = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:54329";

async function setup(): Promise<{ db: Db; close: () => Promise<void> } | null> {
  const admin = postgres(`${base}/petal`, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = 'petal_test_worker_agg'`;
    if (existing.length === 0) await admin.unsafe("create database petal_test_worker_agg");
  } catch {
    console.warn("[@petal/worker] Postgres unreachable — skipping aggregate integration test");
    return null;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => undefined);
  }
  const handle = createDb(`${base}/petal_test_worker_agg`, { max: 5 });
  await migrateDb(handle.db);
  return handle;
}

const testDb = await setup();
const db = testDb?.db;

const ACCOUNT_ID = "acct_agg_test";
const DAY_A = "2026-06-01";
const DAY_B = "2026-06-02";

const at = (day: string, hour: number): string =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`).toISOString();

const event = (
  n: number,
  source: MentionEvent["source"],
  occurredAt: string,
  mediaId: string | null,
): MentionEvent => ({
  id: `agg-ev-${String(n)}`,
  accountId: ACCOUNT_ID,
  source,
  igObjectId: `agg-obj-${String(n)}`,
  mediaId,
  authorUsername: `user_${String(n)}`,
  text: `sample mention ${String(n)}`,
  permalink: null,
  occurredAt,
  ingestedVia: "webhook",
  raw: {},
});

const enrichment = (
  mentionEventId: string,
  sentiment: Enrichment["sentiment"],
  intent: Enrichment["intent"],
): Enrichment => ({
  mentionEventId,
  sentiment,
  intent,
  confidence: 0.9,
  model: "test-model",
  promptVersion: "v1",
  latencyMs: 5,
  costUsd: 0,
  method: "llm",
});

async function readAggregate(date: string) {
  if (db === undefined) throw new Error("no db");
  const [row] = await db
    .select()
    .from(schema.dailyAggregates)
    .where(and(eq(schema.dailyAggregates.accountId, ACCOUNT_ID), eq(schema.dailyAggregates.date, date)))
    .limit(1);
  return row ?? null;
}

async function seed(): Promise<void> {
  if (db === undefined) throw new Error("no db");
  await db.execute(
    sql`truncate accounts, media, mention_events, enrichments, daily_aggregates cascade`,
  );
  await upsertAccount(db, {
    id: ACCOUNT_ID,
    igUserId: "1799000000001",
    username: "agg_test",
    accessToken: null,
    tokenExpiresAt: null,
    connectedAt: at(DAY_A, 0),
    status: "active",
  });
  await upsertMedia(db, {
    id: "media-A",
    accountId: ACCOUNT_ID,
    origin: "owned",
    caption: "aggregate test post",
    mediaType: "IMAGE",
    permalink: null,
    postedAt: at(DAY_A, 0),
    likeCount: 0,
    commentsCount: 0,
    raw: {},
  });

  // Day A: 3 events on media-A — 2 praise/positive, 1 complaint/negative.
  const a1 = event(1, "own_comment", at(DAY_A, 1), "media-A");
  const a2 = event(2, "own_comment", at(DAY_A, 2), "media-A");
  const a3 = event(3, "caption_mention", at(DAY_A, 3), "media-A");
  // Day B: 1 event, neutral question, no media.
  const b1 = event(4, "hashtag_media", at(DAY_B, 1), null);

  for (const e of [a1, a2, a3, b1]) await upsertMentionEvent(db, e);

  await insertEnrichment(db, enrichment(a1.id, "positive", "praise"));
  await insertEnrichment(db, enrichment(a2.id, "positive", "praise"));
  await insertEnrichment(db, enrichment(a3.id, "negative", "complaint"));
  await insertEnrichment(db, enrichment(b1.id, "neutral", "question"));
}

describe.skipIf(testDb === null)("aggregate consumer", () => {
  beforeAll(async () => {
    await seed();
  });

  const processor = createAggregateProcessor({ db: db as Db, logger: silentLogger });

  it("recomputes a day's rollup matching hand-counted expectations", async () => {
    const outcome = await processor({ id: "job-a", data: { accountId: ACCOUNT_ID, date: DAY_A } });
    expect(outcome).toEqual({ accountId: ACCOUNT_ID, date: DAY_A, mentionsTotal: 3 });

    const row = await readAggregate(DAY_A);
    expect(row).not.toBeNull();
    expect(row?.mentionsTotal).toBe(3);
    expect(row?.positive).toBe(2);
    expect(row?.negative).toBe(1);
    expect(row?.neutral).toBe(0);
    expect(row?.mixed).toBe(0);
    expect(row?.byIntent).toEqual({ praise: 2, complaint: 1 });
    expect(row?.bySource).toEqual({ own_comment: 2, caption_mention: 1 });
    expect(row?.topMedia).toEqual([{ mediaId: "media-A", mentions: 3 }]);
  });

  it("is idempotent — running twice yields identical rows", async () => {
    await processor({ id: "job-a-again", data: { accountId: ACCOUNT_ID, date: DAY_A } });
    const first = await readAggregate(DAY_A);
    await processor({ id: "job-a-thrice", data: { accountId: ACCOUNT_ID, date: DAY_A } });
    const second = await readAggregate(DAY_A);
    expect(second?.mentionsTotal).toBe(first?.mentionsTotal);
    expect(second?.positive).toBe(first?.positive);
    expect(second?.byIntent).toEqual(first?.byIntent);
    expect(second?.topMedia).toEqual(first?.topMedia);
  });

  it("recomputes a separate day independently", async () => {
    const outcome = await processor({ id: "job-b", data: { accountId: ACCOUNT_ID, date: DAY_B } });
    expect(outcome.mentionsTotal).toBe(1);
    const row = await readAggregate(DAY_B);
    expect(row?.neutral).toBe(1);
    expect(row?.bySource).toEqual({ hashtag_media: 1 });
    expect(row?.topMedia).toEqual([]);
  });

  it("writes a zeroed rollup for a day with no events", async () => {
    const outcome = await processor({ id: "job-empty", data: { accountId: ACCOUNT_ID, date: "2026-06-10" } });
    expect(outcome.mentionsTotal).toBe(0);
    const row = await readAggregate("2026-06-10");
    expect(row?.mentionsTotal).toBe(0);
    expect(row?.topMedia).toEqual([]);
  });

  it("rejects a payload that violates the pinned contract", async () => {
    await expect(processor({ id: "bad", data: { accountId: ACCOUNT_ID } })).rejects.toThrow(
      /aggregate payload failed contract parse/,
    );
    await expect(processor({ id: "bad2", data: { accountId: ACCOUNT_ID, date: "not-a-date" } })).rejects.toThrow();
  });
});
