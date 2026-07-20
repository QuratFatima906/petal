import { alertsResponseSchema } from "@petal/core";
import { NextResponse } from "next/server";
import { mapError, unavailable } from "../../../lib/api-response";
import { getDb } from "../../../lib/db";
import { getActiveAccount, listAlertRules, listFiredAlerts } from "../../../lib/queries";
import { tryLoadServerEnv } from "../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fired alerts + tunable rules for the connected account (plan §7). */
const FIRED_LIMIT = 50;

export async function GET(): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  if (env === null) return unavailable();
  try {
    const db = getDb(env.DATABASE_URL);
    const account = await getActiveAccount(db);
    const [rules, fired] =
      account === null
        ? [[], []]
        : await Promise.all([listAlertRules(db, account.id), listFiredAlerts(db, account.id, FIRED_LIMIT)]);
    return NextResponse.json(alertsResponseSchema.parse({ data: { rules, fired } }));
  } catch (error) {
    return mapError(error);
  }
}
