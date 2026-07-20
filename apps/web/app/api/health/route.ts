import { healthResponseSchema } from "@petal/core";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";
import { checkHealth, type HealthReport } from "../../../lib/health";
import { getQueueDepths, pingRedis } from "../../../lib/queues";
import { tryLoadServerEnv } from "../../../lib/server-env";

// Evaluated per request; probes Postgres + Redis, so never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health contract (plan §7): `{ db, redis, queueDepths }`. A down dependency
 * is reported as a boolean / `{}`, never a 500 — the endpoint must answer even
 * when Postgres or Redis is unreachable.
 */
export async function GET(): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  const report: HealthReport =
    env === null
      ? { db: false, redis: false, queueDepths: {} }
      : await checkHealth({
          pingDb: async () => {
            await getDb(env.DATABASE_URL).execute(sql`select 1`);
            return true;
          },
          pingRedis: () => pingRedis(env.REDIS_URL),
          queueDepths: () => getQueueDepths(env.REDIS_URL),
        });
  return NextResponse.json(healthResponseSchema.parse({ data: report }));
}
