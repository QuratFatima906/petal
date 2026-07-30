import {
  createDb,
  migrateDb,
  schema,
  upsertAccount,
  type Db,
} from "@petal/db";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { silentLogger } from "../test-support";
import { createAlertProcessor, type AlertDeps } from "./alert";

/**
 * Integration test for the alert consumer against dockerized Postgres.
 * Self-bootstraps a dedicated `petal_test_worker_alert` database, seeds
 * controlled aggregate patterns, then asserts the correct rule outcomes.
 */

const base = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:54329";

async function setup(): Promise<{ db: Db; close: () => Promise<void> } | null> {
  const admin = postgres(`${base}/petal`, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = 'petal_test_worker_alert'`;
    if (existing.length === 0) await admin.unsafe("create database petal_test_worker_alert");
  } catch {
    console.warn("[@petal/worker] Postgres unreachable — skipping alert integration test");
    return null;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => undefined);
  }
  const handle = createDb(`${base}/petal_test_worker_alert`, { max: 5 });
  await migrateDb(handle.db);
  return handle;
}

const testDb = await setup();
const db = testDb?.db;

const ACCOUNT_ID = "acct_alert_test";
const NOW = new Date("2026-07-20T12:00:00.000Z");
const DAY = (offset: number): string => {
  const d = new Date(NOW.getTime() + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
};

/** Seed an aggregate row for a specific date with given sentiment counts. */
async function seedAggregate(date: string, total: number, negative: number): Promise<void> {
  if (db === undefined) throw new Error("no db");
  const neutral = total - negative;
  await db
    .insert(schema.dailyAggregates)
    .values({
      accountId: ACCOUNT_ID,
      date,
      mentionsTotal: total,
      positive: 0,
      negative,
      neutral: Math.max(0, neutral),
      mixed: 0,
      byIntent: {},
      bySource: {},
      topMedia: [],
    })
    .onConflictDoUpdate({
      target: [schema.dailyAggregates.accountId, schema.dailyAggregates.date],
      set: { mentionsTotal: total, negative, neutral: Math.max(0, neutral), updatedAt: new Date() },
    });
}

/** Insert an alert rule row. */
async function seedRule(kind: string, params: Record<string, number>, enabled = true): Promise<string> {
  if (db === undefined) throw new Error("no db");
  const id = `rule-${kind}-${Date.now()}`;
  await db.insert(schema.alertRules).values({
    id,
    accountId: ACCOUNT_ID,
    kind: kind as "volume_spike" | "negative_share",
    params,
    enabled,
  });
  return id;
}

function makeDeps(overrides?: Partial<AlertDeps>): AlertDeps {
  const httpPost = overrides?.httpPost ?? (() => {
    return Promise.resolve({ ok: true });
  });

  return {
    db: db as Db,
    logger: silentLogger,
    clock: () => NOW,
    slackWebhookUrl: overrides?.slackWebhookUrl,
    httpPost,
    ...overrides,
  };
}

describe.skipIf(testDb === null)("alert consumer", () => {
  beforeAll(async () => {
    if (db === undefined) return;
    await db.execute(sql`truncate accounts, alert_rules, alerts, daily_aggregates cascade`);
    await upsertAccount(db, {
      id: ACCOUNT_ID,
      igUserId: "1799000000001",
      username: "alert_test",
      accessToken: null,
      tokenExpiresAt: null,
      connectedAt: NOW.toISOString(),
      status: "active",
    });
  });

  beforeEach(async () => {
    if (db === undefined) return;
    await db.execute(sql`truncate alert_rules, alerts, daily_aggregates cascade`);
  });

  it("skips evaluation when no active account exists", async () => {
    if (db === undefined) return;
    // Create a disconnected account instead.
    await db.execute(sql`truncate accounts, alert_rules, alerts, daily_aggregates cascade`);
    await upsertAccount(db, {
      id: "other_acct",
      igUserId: "other",
      username: "disconnected",
      accessToken: null,
      tokenExpiresAt: null,
      connectedAt: NOW.toISOString(),
      status: "disconnected",
    });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.evaluatedCount).toBe(0);
    expect(outcome.firedCount).toBe(0);
  });

  it("skips evaluation when no enabled rules exist", async () => {
    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.evaluatedCount).toBe(0);
    expect(outcome.firedCount).toBe(0);
  });

  it("skips evaluation when no aggregate data exists", async () => {
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.evaluatedCount).toBe(0);
    expect(outcome.firedCount).toBe(0);
  });

  it("fires a volume_spike alert when last 24h exceeds multiplier × trailing avg", async () => {
    // 7 days of low activity (10 events/day avg).
    for (let i = 7; i >= 1; i--) {
      await seedAggregate(DAY(-i), 10, 1);
    }
    // Today: spike to 30 events (3× average, well above 2× threshold).
    await seedAggregate(DAY(0), 30, 2);
    const ruleId = await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(1);
    expect(outcome.outcomes[0]).toMatchObject({ kind: "fired" });
    if (outcome.outcomes[0]?.kind === "fired") {
      expect(outcome.outcomes[0].summary).toContain("30 mentions");
      expect(outcome.outcomes[0].deliveredSlack).toBe(true);
    }

    // Verify alert was persisted.
    const rows = await (db as Db).select().from(schema.alerts).where(eq(schema.alerts.ruleId, ruleId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deliveredSlack).toBe(true);
    expect(rows[0]?.summary).toContain("30 mentions");
  });

  it("does not fire volume_spike below min events", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    // Only 5 events today — below min 10.
    await seedAggregate(DAY(0), 5, 2);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(0);
  });

  it("does not fire volume_spike below multiplier threshold", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 20, 1);
    // 30 today is only 1.5× the 20 avg — below 2× threshold.
    await seedAggregate(DAY(0), 30, 2);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(0);
  });

  it("fires a negative_share alert when negative crosses threshold", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    // 50% negative today (well above 30% threshold).
    await seedAggregate(DAY(0), 20, 10);
    await seedRule("negative_share", { share: 30, min: 5, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(1);
    expect(outcome.outcomes[0]).toMatchObject({ kind: "fired" });
    if (outcome.outcomes[0]?.kind === "fired") {
      expect(outcome.outcomes[0].summary).toContain("50% negative");
    }
  });

  it("respects cooldown — does not refire within the cooldown window", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    await seedAggregate(DAY(0), 30, 2);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 24 }); // 24h cooldown

    // Fire once.
    const first = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(first.firedCount).toBe(1);

    // Run again immediately — should be in cooldown.
    const second = await createAlertProcessor(makeDeps())({ id: "j2", data: {} });
    expect(second.firedCount).toBe(0);
    expect(second.outcomes[0]?.kind).toBe("skipped-cooldown");
  });

  it("records alert without Slack delivery when webhook fails", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    await seedAggregate(DAY(0), 30, 2);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const deps = makeDeps({
      slackWebhookUrl: "https://hooks.slack.com/test",
      httpPost: async () => ({ ok: false }),
    });
    const outcome = await createAlertProcessor(deps)({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(1);
    if (outcome.outcomes[0]?.kind === "fired") {
      expect(outcome.outcomes[0].deliveredSlack).toBe(false);
    }

    // Alert still recorded.
    const rows = await (db as Db).select().from(schema.alerts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deliveredSlack).toBe(false);
  });

  it("records alert without Slack when no webhook URL is configured", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    await seedAggregate(DAY(0), 30, 2);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });

    const deps = makeDeps({ slackWebhookUrl: undefined });
    const outcome = await createAlertProcessor(deps)({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(1);
    if (outcome.outcomes[0]?.kind === "fired") {
      expect(outcome.outcomes[0].deliveredSlack).toBe(false);
    }
  });

  it("evaluates both rule kinds in a single pass", async () => {
    for (let i = 7; i >= 1; i--) await seedAggregate(DAY(-i), 10, 1);
    // Today triggers both: volume spike (30 > 2×10) and negative share (40% > 30%).
    await seedAggregate(DAY(0), 30, 12);
    await seedRule("volume_spike", { mult: 2, min: 10, cool: 0 });
    await seedRule("negative_share", { share: 30, min: 5, cool: 0 });

    const outcome = await createAlertProcessor(makeDeps())({ id: "j1", data: {} });
    expect(outcome.firedCount).toBe(2);
    expect(outcome.outcomes.filter((o) => o.kind === "fired")).toHaveLength(2);
  });
});
