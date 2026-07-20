import {
  alertsResponseSchema,
  mentionDetailResponseSchema,
  mentionsResponseSchema,
  statsOverviewResponseSchema,
  type Enrichment,
  type MentionEvent,
} from "@petal/core";
import {
  insertEnrichment,
  schema,
  upsertAccount,
  upsertDailyAggregate,
  upsertMedia,
  upsertMentionEvent,
  type Db,
} from "@petal/db";
import { beforeAll, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "../../lib/test-harness";

/**
 * Route-handler integration tests (plan WP7): request → typed, schema-valid
 * response against seeded Postgres fixtures. Overview deltas are asserted
 * against hand-computed values; every endpoint is also checked on an empty DB.
 */

const PG_BASE = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:54329";
process.env.DATABASE_URL = `${PG_BASE}/petal_test_web`;
process.env.REDIS_URL = "redis://localhost:6379";
process.env.LOG_LEVEL = "fatal";

const { GET: statsGet } = await import("./stats/overview/route");
const { GET: mentionsGet } = await import("./mentions/route");
const { GET: mentionDetailGet } = await import("./mentions/[id]/route");
const { GET: alertsGet } = await import("./alerts/route");
const { PATCH: alertRulePatch } = await import("./alert-rules/[id]/route");

const db = testDb?.db;
const ACCOUNT_ID = "acct_web";
const NOW = new Date();

const day = (n: number): string => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const ts = (n: number, hour: number): string => `${day(n)}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const REQ = "https://petal.test";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const event = (
  id: string,
  source: MentionEvent["source"],
  igObjectId: string,
  mediaId: string | null,
  author: string | null,
  text: string,
  occurredAt: string,
): MentionEvent => ({
  id,
  accountId: ACCOUNT_ID,
  source,
  igObjectId,
  mediaId,
  authorUsername: author,
  text,
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

async function seed(database: Db): Promise<void> {
  await truncateAll(database);
  await upsertAccount(database, {
    id: ACCOUNT_ID,
    igUserId: "1789000000009",
    username: "omahi.app",
    accessToken: null,
    tokenExpiresAt: null,
    connectedAt: ts(-14, 0),
    status: "active",
  });
  for (const [id, caption] of [
    ["media-1", "Post one"],
    ["media-2", "Post two"],
  ] as const) {
    await upsertMedia(database, {
      id,
      accountId: ACCOUNT_ID,
      origin: "owned",
      caption,
      mediaType: "IMAGE",
      permalink: null,
      postedAt: ts(-14, 0),
      likeCount: 0,
      commentsCount: 0,
      raw: {},
    });
  }

  // daily_aggregates: current window (last 7d) = day(-1), day(-2); prior window = day(-8).
  await upsertDailyAggregate(database, {
    accountId: ACCOUNT_ID,
    date: day(-1),
    mentionsTotal: 10,
    positive: 5,
    negative: 3,
    neutral: 2,
    mixed: 0,
    byIntent: { purchase_intent: 4, complaint: 3, praise: 3 },
    bySource: { own_comment: 10 },
    topMedia: [
      { mediaId: "media-1", mentions: 6 },
      { mediaId: "media-2", mentions: 4 },
    ],
  });
  await upsertDailyAggregate(database, {
    accountId: ACCOUNT_ID,
    date: day(-2),
    mentionsTotal: 5,
    positive: 4,
    negative: 1,
    neutral: 0,
    mixed: 0,
    byIntent: { purchase_intent: 1, praise: 4 },
    bySource: { own_comment: 5 },
    topMedia: [{ mediaId: "media-1", mentions: 5 }],
  });
  await upsertDailyAggregate(database, {
    accountId: ACCOUNT_ID,
    date: day(-8),
    mentionsTotal: 8,
    positive: 6,
    negative: 2,
    neutral: 0,
    mixed: 0,
    byIntent: { purchase_intent: 2, praise: 6 },
    bySource: { own_comment: 8 },
    topMedia: [{ mediaId: "media-1", mentions: 8 }],
  });

  // mention_events + enrichments for the feed / detail endpoints.
  const events: readonly [MentionEvent, Enrichment][] = [
    [
      event("ev-neg", "own_comment", "obj-neg", "media-1", "maya_reads", "the phase seems off by a day", ts(-1, 10)),
      enrichment("ev-neg", "negative", "complaint"),
    ],
    [
      event("ev-pos", "own_comment", "obj-pos", "media-1", "lena.codes", "love that it's local only", ts(-2, 9)),
      enrichment("ev-pos", "positive", "praise"),
    ],
    [
      event("ev-q", "hashtag_media", "obj-q", null, null, "does this sync across devices?", ts(-3, 8)),
      enrichment("ev-q", "neutral", "question"),
    ],
    [
      event("ev-buy", "caption_mention", "obj-buy", "media-2", "noorulain_x", "okay where do i get this", ts(-1, 11)),
      enrichment("ev-buy", "positive", "purchase_intent"),
    ],
  ];
  for (const [ev, en] of events) {
    await upsertMentionEvent(database, ev);
    await insertEnrichment(database, en);
  }

  await database.insert(schema.alertRules).values([
    { id: "rule-vol", accountId: ACCOUNT_ID, kind: "volume_spike", params: { factor: 2, minEvents: 10 }, enabled: true },
    { id: "rule-neg", accountId: ACCOUNT_ID, kind: "negative_share", params: { threshold: 0.3, minEvents: 5 }, enabled: false },
  ]);
  await database.insert(schema.alerts).values({
    id: "alert-1",
    ruleId: "rule-vol",
    firedAt: new Date(ts(-1, 12)),
    summary: "Volume spike detected",
    payload: {},
    deliveredSlack: true,
  });
}

describe.skipIf(testDb === null)("query API routes (seeded)", () => {
  beforeAll(async () => {
    if (db === undefined) throw new Error("no db");
    await seed(db);
  });

  it("GET /api/stats/overview computes totals and deltas from daily_aggregates", async () => {
    const res = await statsGet(new Request(`${REQ}/api/stats/overview?days=7`));
    expect(res.status).toBe(200);
    const { data } = statsOverviewResponseSchema.parse(await res.json());

    expect(data.totals.mentions).toBe(15);
    expect(data.totals.purchaseIntent).toBe(5);
    expect(data.totals.negativeShare).toBeCloseTo(0.267, 3);

    expect(data.deltas.mentionsPct).toBeCloseTo(87.5, 5);
    expect(data.deltas.negativeSharePts).toBeCloseTo(1.7, 5);
    expect(data.deltas.purchaseIntent).toBe(3);

    expect(data.series).toHaveLength(7);
    expect(data.series.find((p) => p.date === day(-1))?.total).toBe(10);
    expect(data.series.find((p) => p.date === day(-2))?.total).toBe(5);

    expect(data.byIntent.purchase_intent).toBe(5);
    expect(data.byIntent.praise).toBe(7);
    expect(data.byIntent.complaint).toBe(3);

    expect(data.topMedia).toEqual([
      { mediaId: "media-1", caption: "Post one", mentions: 11 },
      { mediaId: "media-2", caption: "Post two", mentions: 4 },
    ]);
  });

  it("GET /api/mentions returns the joined, newest-first feed", async () => {
    const res = await mentionsGet(new Request(`${REQ}/api/mentions`));
    expect(res.status).toBe(200);
    const { data } = mentionsResponseSchema.parse(await res.json());
    expect(data.items).toHaveLength(4);
    expect(data.nextCursor).toBeNull();
    expect(data.items[0]?.event.id).toBe("ev-buy"); // newest occurred_at
    expect(data.items[0]?.enrichment?.intent).toBe("purchase_intent");
  });

  it.each([
    ["sentiment=negative", "sentiment=negative", ["ev-neg"]],
    ["intent=question", "intent=question", ["ev-q"]],
    ["source=hashtag_media", "source=hashtag_media", ["ev-q"]],
    ["q=sync", "q=sync", ["ev-q"]],
    ["combined negative+praise (no match)", "sentiment=negative&intent=praise", []],
  ])("GET /api/mentions filters by %s", async (_name, qs, expectedIds) => {
    const res = await mentionsGet(new Request(`${REQ}/api/mentions?${qs}`));
    const { data } = mentionsResponseSchema.parse(await res.json());
    expect(data.items.map((i) => i.event.id)).toEqual(expectedIds);
  });

  it("GET /api/mentions paginates with a cursor", async () => {
    const first = await mentionsGet(new Request(`${REQ}/api/mentions?limit=2`));
    const page1 = mentionsResponseSchema.parse(await first.json()).data;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const second = await mentionsGet(
      new Request(`${REQ}/api/mentions?limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? "")}`),
    );
    const page2 = mentionsResponseSchema.parse(await second.json()).data;
    expect(page2.items).toHaveLength(2);
    const ids = [...page1.items, ...page2.items].map((i) => i.event.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("GET /api/mentions rejects an invalid filter value", async () => {
    const res = await mentionsGet(new Request(`${REQ}/api/mentions?sentiment=bogus`));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("invalid_request");
  });

  it("GET /api/mentions/:id returns full event + enrichment + media context", async () => {
    const res = await mentionDetailGet(new Request(`${REQ}/api/mentions/ev-neg`), params("ev-neg"));
    expect(res.status).toBe(200);
    const { data } = mentionDetailResponseSchema.parse(await res.json());
    expect(data.event.id).toBe("ev-neg");
    expect(data.enrichment?.sentiment).toBe("negative");
    expect(data.media?.id).toBe("media-1");
    expect(data.media?.caption).toBe("Post one");
  });

  it("GET /api/mentions/:id 404s for an unknown id", async () => {
    const res = await mentionDetailGet(new Request(`${REQ}/api/mentions/nope`), params("nope"));
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("not_found");
  });

  it("GET /api/alerts lists rules and fired alerts", async () => {
    const res = await alertsGet();
    expect(res.status).toBe(200);
    const { data } = alertsResponseSchema.parse(await res.json());
    expect(data.rules).toHaveLength(2);
    expect(data.fired).toHaveLength(1);
    expect(data.fired[0]?.id).toBe("alert-1");
    expect(data.fired[0]?.deliveredSlack).toBe(true);
  });

  it("PATCH /api/alert-rules/:id enables a rule", async () => {
    const res = await alertRulePatch(
      new Request(`${REQ}/api/alert-rules/rule-neg`, { method: "PATCH", body: JSON.stringify({ enabled: true }) }),
      params("rule-neg"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: string; enabled: boolean } };
    expect(json.data.id).toBe("rule-neg");
    expect(json.data.enabled).toBe(true);
  });

  it("PATCH /api/alert-rules/:id tunes params", async () => {
    const res = await alertRulePatch(
      new Request(`${REQ}/api/alert-rules/rule-vol`, {
        method: "PATCH",
        body: JSON.stringify({ params: { factor: 3, minEvents: 12 } }),
      }),
      params("rule-vol"),
    );
    const json = (await res.json()) as { data: { params: Record<string, number> } };
    expect(json.data.params).toEqual({ factor: 3, minEvents: 12 });
  });

  it("PATCH /api/alert-rules/:id 404s for an unknown rule", async () => {
    const res = await alertRulePatch(
      new Request(`${REQ}/api/alert-rules/ghost`, { method: "PATCH", body: JSON.stringify({ enabled: true }) }),
      params("ghost"),
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/alert-rules/:id rejects an empty patch", async () => {
    const res = await alertRulePatch(
      new Request(`${REQ}/api/alert-rules/rule-vol`, { method: "PATCH", body: JSON.stringify({}) }),
      params("rule-vol"),
    );
    expect(res.status).toBe(400);
  });
});

describe.skipIf(testDb === null)("query API routes (empty DB)", () => {
  beforeAll(async () => {
    if (db === undefined) throw new Error("no db");
    await truncateAll(db);
  });

  it("overview returns a zeroed but well-formed series", async () => {
    const res = await statsGet(new Request(`${REQ}/api/stats/overview?days=7`));
    const { data } = statsOverviewResponseSchema.parse(await res.json());
    expect(data.totals.mentions).toBe(0);
    expect(data.series).toHaveLength(7);
    expect(data.deltas.mentionsPct).toBeNull();
    expect(data.topMedia).toEqual([]);
  });

  it("mentions feed is empty", async () => {
    const res = await mentionsGet(new Request(`${REQ}/api/mentions`));
    const { data } = mentionsResponseSchema.parse(await res.json());
    expect(data.items).toEqual([]);
    expect(data.nextCursor).toBeNull();
  });

  it("alerts are empty", async () => {
    const res = await alertsGet();
    const { data } = alertsResponseSchema.parse(await res.json());
    expect(data.rules).toEqual([]);
    expect(data.fired).toEqual([]);
  });

  it("mention detail 404s", async () => {
    const res = await mentionDetailGet(new Request(`${REQ}/api/mentions/ev-neg`), params("ev-neg"));
    expect(res.status).toBe(404);
  });
});
