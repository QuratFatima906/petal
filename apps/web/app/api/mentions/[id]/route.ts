import { mentionDetailResponseSchema } from "@petal/core";
import { NextResponse } from "next/server";
import { errorResponse, mapError, unavailable } from "../../../../lib/api-response";
import { getDb } from "../../../../lib/db";
import { getActiveAccount, getMentionDetail } from "../../../../lib/queries";
import { tryLoadServerEnv } from "../../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full event + enrichment + linked media context for one mention (plan §7). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  if (env === null) return unavailable();
  try {
    const { id } = await context.params;
    const db = getDb(env.DATABASE_URL);
    const account = await getActiveAccount(db);
    const detail = account === null ? null : await getMentionDetail(db, account.id, id);
    if (detail === null) return errorResponse(404, "not_found", "Mention not found.");
    return NextResponse.json(mentionDetailResponseSchema.parse({ data: detail }));
  } catch (error) {
    return mapError(error);
  }
}
