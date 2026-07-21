import { statsOverviewQuerySchema, statsOverviewResponseSchema } from "@petal/core";
import { NextResponse } from "next/server";
import { mapError, unavailable } from "../../../../lib/api-response";
import { getDb } from "../../../../lib/db";
import { emptyStatsOverview, getActiveAccount, getStatsOverview } from "../../../../lib/queries";
import { tryLoadServerEnv } from "../../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 7-day (or `?days=`) overview computed from `daily_aggregates` (plan §7):
 * totals, per-day series, intent breakdown, top media, deltas vs the prior
 * window. Empty DB → a zeroed but well-formed `days`-long series.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  if (env === null) return unavailable();
  try {
    const { days } = statsOverviewQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const now = new Date();
    const db = getDb(env.DATABASE_URL);
    const account = await getActiveAccount(db);
    const data =
      account === null ? emptyStatsOverview(days, now) : await getStatsOverview(db, account.id, days, now);
    return NextResponse.json(statsOverviewResponseSchema.parse({ data }));
  } catch (error) {
    return mapError(error);
  }
}
