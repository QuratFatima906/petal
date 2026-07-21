import { alertRulePatchSchema, alertRuleSchema } from "@petal/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, mapError, unavailable } from "../../../../lib/api-response";
import { getDb } from "../../../../lib/db";
import { getActiveAccount, updateAlertRule } from "../../../../lib/queries";
import { tryLoadServerEnv } from "../../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchResponseSchema = z.object({ data: alertRuleSchema });

/** Enable/disable and tune an alert rule (plan §7). Returns the updated rule. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  if (env === null) return unavailable();
  try {
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const patch = alertRulePatchSchema.parse(body);
    const db = getDb(env.DATABASE_URL);
    const account = await getActiveAccount(db);
    const rule = account === null ? null : await updateAlertRule(db, account.id, id, patch);
    if (rule === null) return errorResponse(404, "not_found", "Alert rule not found.");
    return NextResponse.json(patchResponseSchema.parse({ data: rule }));
  } catch (error) {
    return mapError(error);
  }
}
