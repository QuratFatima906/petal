import { createDb, migrateDb, type Db } from "@petal/db";
import { sql } from "drizzle-orm";
import postgres from "postgres";

/**
 * Route-handler integration tests run against the dockerized Postgres from the
 * repo's docker-compose.yml, in a dedicated `petal_test_web` database created
 * on the fly. Its own database name keeps parallel turbo runs from racing the
 * @petal/db and @petal/worker suites' truncates. Loud skip when unreachable.
 */

const base = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:54329";

async function setup(): Promise<{ db: Db; close: () => Promise<void> } | null> {
  const admin = postgres(`${base}/petal`, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = 'petal_test_web'`;
    if (existing.length === 0) await admin.unsafe("create database petal_test_web");
  } catch {
    console.warn("[@petal/web] Postgres unreachable — skipping route integration tests (docker compose up -d postgres)");
    return null;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => undefined);
  }
  const handle = createDb(`${base}/petal_test_web`, { max: 5 });
  await migrateDb(handle.db);
  return handle;
}

export const testDb = await setup();

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`truncate accounts, media, mention_events, enrichments, enrichment_cache, daily_aggregates, hashtags, alert_rules, alerts, dead_letters cascade`,
  );
}
