import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** One client per process; `close()` must run on graceful shutdown. */
export function createDb(databaseUrl: string, options?: { readonly max?: number }) {
  const sql = postgres(databaseUrl, { max: options?.max ?? 10, onnotice: () => undefined });
  const db = drizzle(sql, { schema });
  return { db, close: () => sql.end() };
}

export type Db = ReturnType<typeof createDb>["db"];
