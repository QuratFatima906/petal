import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { igUserId } from "@petal/core";
import { schema, upsertAccount } from "@petal/db";
import { GRAPH_API_VERSION, GRAPH_BASE_URL, createIgClient, createTokenBucket } from "@petal/ig";
import { mediaCommentsShape, ownMediaListShape, webhookDeliveryShape } from "@petal/fixtures";
import { testDb, truncateAll } from "./integration-harness";
import { ingestPayloadSchema, type IngestJobPayload } from "./ingest-contract";
import { createIngestProcessor } from "./jobs/ingest";
import { pollMentionsAndTags, pollOwnComments, type PollDeps } from "./jobs/poll";
import { createDbPollStore } from "./store";
import { silentLogger } from "./test-support";

/**
 * WP5 "done when": with msw fixtures, a full poll cycle populates the DB and
 * enqueues enrichment exactly once per new item. Also covers webhook/poll
 * lane overlap (no duplicate rows) and deletion mirroring end to end.
 */

const IG_USER_ID = "17841400000000000";
const ACCOUNT_ID = "acct_worker_it";
const BASE = `${GRAPH_BASE_URL}/${GRAPH_API_VERSION}`;
const NOW = new Date("2026-07-20T12:00:00.000Z");

const server = setupServer();

const makeProcessor = (db: NonNullable<typeof testDb>["db"]) => {
  const enriched: string[] = [];
  const processor = createIngestProcessor({
    db,
    logger: silentLogger,
    newId: () => ulid(NOW.getTime()),
    enqueueEnrich: ({ mentionEventId }) => {
      enriched.push(mentionEventId);
      return Promise.resolve();
    },
  });
  return { processor, enriched };
};

const webhookPayload = (field: string, value: unknown): IngestJobPayload =>
  ingestPayloadSchema.parse({
    accountId: IG_USER_ID,
    lane: "webhook",
    receivedAt: NOW.toISOString(),
    payload: { kind: "webhook_change", field, value },
  });

const pollPayload = (source: string, item: unknown): IngestJobPayload =>
  ingestPayloadSchema.parse({
    accountId: IG_USER_ID,
    lane: "poll",
    receivedAt: NOW.toISOString(),
    payload: { kind: "poll_item", source, item },
  });

const makePollDeps = (
  db: NonNullable<typeof testDb>["db"],
  enqueueIngest: PollDeps["enqueueIngest"],
): PollDeps => ({
  ig: createIgClient({
    accessToken: "test-token",
    igUserId: igUserId(IG_USER_ID),
    sleep: () => Promise.resolve(),
    backoff: { baseMs: 1, random: () => 0 },
    bucBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
    platformBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
  }),
  igUserId: IG_USER_ID,
  store: createDbPollStore(db, ACCOUNT_ID),
  clock: () => NOW,
  logger: silentLogger,
  enqueueIngest,
});

describe.skipIf(testDb === null)("@petal/worker integration", () => {
  const db = testDb?.db;
  if (db === undefined) return;

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "error" });
  });
  afterAll(async () => {
    server.close();
    await testDb?.close();
  });

  beforeEach(async () => {
    server.resetHandlers();
    await truncateAll(db);
    await upsertAccount(db, {
      id: ACCOUNT_ID,
      igUserId: IG_USER_ID,
      username: "omahi.app",
      accessToken: null,
      tokenExpiresAt: null,
      connectedAt: NOW.toISOString(),
      status: "active",
    });
  });

  it("webhook and poll lanes overlap without duplicate rows; enrich fires once", async () => {
    const { processor, enriched } = makeProcessor(db);
    const change = webhookDeliveryShape.entry[0].changes[0];

    // Webhook delivery, twice (duplicate delivery).
    const first = await processor({ id: "j1", data: webhookPayload(change.field, change.value) });
    const second = await processor({ id: "j2", data: webhookPayload(change.field, change.value) });
    expect(first).toMatchObject({ kind: "upserted", inserted: true });
    expect(second).toMatchObject({ kind: "upserted", inserted: false });
    expect(enriched).toHaveLength(1);

    // The poll lane fetches the same comment.
    const overlap = await processor({
      id: "j3",
      data: pollPayload("own_comment", {
        id: change.value.id,
        text: change.value.text,
        username: "cyclesyncedlife",
        timestamp: "2026-07-20T11:59:00+0000",
        media: ownMediaListShape.data[0],
      }),
    });
    expect(overlap).toMatchObject({ kind: "upserted", inserted: false });
    expect(enriched).toHaveLength(1);

    const rows = await db.select().from(schema.mentionEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ingestedVia).toBe("webhook"); // first writer wins the provenance
  });

  it("a full poll cycle populates the DB and enqueues enrichment exactly once per new item", async () => {
    server.use(
      http.get(`${BASE}/${IG_USER_ID}/media`, () => HttpResponse.json(ownMediaListShape)),
      http.get(`${BASE}/17900000000000001/comments`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        return HttpResponse.json(after === null ? mediaCommentsShape : { data: [] });
      }),
    );
    const { processor, enriched } = makeProcessor(db);
    // The poller enqueues; the consumer drains — same path production takes.
    const queued: IngestJobPayload[] = [];
    const deps = makePollDeps(db, (payload) => {
      queued.push(payload);
      return Promise.resolve();
    });

    const stats = await pollOwnComments(deps);
    expect(stats.enqueued).toBe(2); // comment + reply
    for (const [i, payload] of queued.entries()) await processor({ id: `poll-${i}`, data: payload });

    const rows = await db.select().from(schema.mentionEvents);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ingestedVia === "poll" && r.source === "own_comment")).toBe(true);
    expect(enriched).toHaveLength(2);

    // The owned media was mirrored, so events carry the FK.
    const mediaRows = await db.select().from(schema.media);
    expect(mediaRows).toHaveLength(1);
    expect(rows.every((r) => r.mediaId === "17900000000000001")).toBe(true);

    // Second cycle: the watermark stops at the known newest comment — nothing new.
    const queuedAgain: IngestJobPayload[] = [];
    const depsAgain = makePollDeps(db, (payload) => {
      queuedAgain.push(payload);
      return Promise.resolve();
    });
    const statsAgain = await pollOwnComments(depsAgain);
    expect(statsAgain.enqueued).toBe(0);
    expect(enriched).toHaveLength(2);
    expect(await db.select().from(schema.mentionEvents)).toHaveLength(2);
  });

  it("logs and acks unknown webhook fields without writing rows", async () => {
    const { processor, enriched } = makeProcessor(db);
    const outcome = await processor({
      id: "j-unknown",
      data: webhookPayload("story_insights", { impressions: 5 }),
    });
    expect(outcome).toMatchObject({ kind: "skipped" });
    expect(await db.select().from(schema.mentionEvents)).toHaveLength(0);
    expect(enriched).toHaveLength(0);
  });

  it("rejects a malformed payload with a typed error (job retries)", async () => {
    const { processor } = makeProcessor(db);
    await expect(processor({ id: "j-bad", data: { nope: true } })).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("mirrors deletions end to end: a 404 on re-hydration removes the row", async () => {
    const { processor } = makeProcessor(db);
    // Seed a known comment mention through the normal ingest path.
    await processor({
      id: "j-seed",
      data: webhookPayload("mentions", { media_id: "m-x", comment_id: "c-gone" }),
    });
    expect(await db.select().from(schema.mentionEvents)).toHaveLength(1);

    server.use(
      http.get(`${BASE}/${IG_USER_ID}`, () =>
        HttpResponse.json(
          { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 } },
          { status: 404 },
        ),
      ),
      http.get(`${BASE}/${IG_USER_ID}/tags`, () => HttpResponse.json({ data: [] })),
    );
    const deps = makePollDeps(db, () => Promise.resolve());
    const stats = await pollMentionsAndTags(deps);

    expect(stats.deleted).toBe(1);
    expect(await db.select().from(schema.mentionEvents)).toHaveLength(0);
  });

  it("re-hydration refreshes a webhook-discovered mention through the same upsert (no new row)", async () => {
    const { processor, enriched } = makeProcessor(db);
    await processor({
      id: "j-seed",
      data: webhookPayload("mentions", { media_id: "m-y", comment_id: "17800000000000301" }),
    });
    expect(enriched).toHaveLength(1);

    // Hydrated item flows back in via the poll lane.
    const outcome = await processor({
      id: "j-hydrate",
      data: pollPayload("comment_mention", {
        id: "17800000000000301",
        text: "@omahi.app my phase card disappeared after the last update.",
        timestamp: "2026-07-19T09:44:00+0000",
        media: { id: "17900000000000301" },
      }),
    });
    expect(outcome).toMatchObject({ kind: "upserted", inserted: false });

    const [row] = await db
      .select()
      .from(schema.mentionEvents)
      .where(eq(schema.mentionEvents.igObjectId, "17800000000000301"));
    expect(row?.text).toContain("phase card"); // text filled in by hydration
    expect(enriched).toHaveLength(1); // still exactly one enrichment
  });
});
