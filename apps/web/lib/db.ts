import { createDb, type Db } from "@petal/db";

/**
 * Lazy singleton Postgres handle for route handlers. Importing this module
 * must never open a connection (next build imports route modules before the
 * runtime environment exists), so the client is created on first query.
 */
let handle: { db: Db; close: () => Promise<void> } | undefined;

export function getDb(databaseUrl: string): Db {
  handle ??= createDb(databaseUrl);
  return handle.db;
}
