import { mentionsQuerySchema, mentionsResponseSchema } from "@petal/core";
import { listMentions } from "@petal/db";
import { NextResponse } from "next/server";
import { mapError, unavailable } from "../../../lib/api-response";
import { getDb } from "../../../lib/db";
import { getActiveAccount } from "../../../lib/queries";
import { tryLoadServerEnv } from "../../../lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cursor-paginated mentions feed (plan §7): event + enrichment joined, filtered
 * by sentiment / intent / source / free text, with a `nextCursor`. Empty DB →
 * an empty page.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const env = tryLoadServerEnv();
  if (env === null) return unavailable();
  try {
    const query = mentionsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = getDb(env.DATABASE_URL);
    const account = await getActiveAccount(db);
    const result = account === null ? { items: [], nextCursor: null } : await listMentions(db, account.id, query);
    return NextResponse.json(mentionsResponseSchema.parse({ data: result }));
  } catch (error) {
    return mapError(error);
  }
}
