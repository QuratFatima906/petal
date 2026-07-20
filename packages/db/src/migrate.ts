import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client";

/** Applies committed SQL migrations; used by tests and the deploy release step. */
export async function migrateDb(db: Db): Promise<void> {
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  await migrate(db, { migrationsFolder });
}
