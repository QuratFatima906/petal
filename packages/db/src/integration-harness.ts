import postgres from "postgres";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "./client";
import { migrateDb } from "./migrate";

/**
 * Integration tests run against the dockerized Postgres from the repo's
 * docker-compose.yml, in a dedicated `petal_test` database created on the
 * fly. When Postgres is unreachable (e.g. a CI job without the service) the
 * suites skip loudly instead of failing — see the WP2 note in PROGRESS.md.
 */

const base = process.env["PETAL_TEST_PG_URL"] ?? "postgres://petal:petal@localhost:5432";

async function setup(): Promise<{ db: Db; close: () => Promise<void> } | null> {
  const admin = postgres(`${base}/petal`, { max: 1, connect_timeout: 3, onnotice: () => undefined });
  try {
    const existing = await admin`select 1 from pg_database where datname = 'petal_test'`;
    if (existing.length === 0) await admin.unsafe("create database petal_test");
  } catch {
    console.warn("[@petal/db] Postgres unreachable — skipping integration tests (docker compose up -d postgres)");
    return null;
  } finally {
    await admin.end({ timeout: 1 }).catch(() => undefined);
  }
  const handle = createDb(`${base}/petal_test`, { max: 5 });
  await migrateDb(handle.db);
  return handle;
}

export const testDb = await setup();

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(
    sql`truncate accounts, media, mention_events, enrichments, enrichment_cache, daily_aggregates, hashtags, alert_rules, alerts, dead_letters cascade`,
  );
}
