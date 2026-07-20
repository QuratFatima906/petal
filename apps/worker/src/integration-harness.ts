import postgres from "postgres";
import { sql } from "drizzle-orm";
import { createDb, migrateDb, type Db } from "@petal/db";

/**
 * Same pattern as packages/db's harness: dockerized Postgres via
 * PETAL_TEST_PG_URL, a dedicated database created on the fly, loud skip when
 * unreachable. Uses its own `petal_test_worker` database so parallel turbo
 * runs never race the @petal/db suite's truncates.
 */

const base = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:54329";

async function setup(): Promise<{ db: Db; close: () => Promise<void> } | null> {
  const admin = postgres(`${base}/petal`, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = 'petal_test_worker'`;
    if (existing.length === 0) await admin.unsafe("create database petal_test_worker");
  } catch {
    console.warn(
      "[@petal/worker] Postgres unreachable — skipping integration tests (docker compose up -d postgres)",
    );
    return null;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => undefined);
  }
  const handle = createDb(`${base}/petal_test_worker`, { max: 5 });
  await migrateDb(handle.db);
  return handle;
}

export const testDb = await setup();

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`truncate accounts, media, mention_events, enrichments, enrichment_cache, daily_aggregates, hashtags, alert_rules, alerts, dead_letters cascade`,
  );
}
