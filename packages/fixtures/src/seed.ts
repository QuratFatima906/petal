import { type MentionEvent } from "@petal/core";
import { buildFixtureEvents } from "./dataset";

/**
 * The seeder pushes every fixture through the SAME upsert path production
 * uses (plan WP1). The db package (WP2) supplies the real upsert keyed on
 * (source, ig_object_id); tests and demo mode can supply an in-memory one.
 * Running the seed twice must yield identical row counts — idempotency
 * belongs to the upsert, not the seeder.
 */
export type UpsertMentionEvent = (event: MentionEvent) => Promise<unknown> | unknown;

export async function seedFixtures(now: Date, upsert: UpsertMentionEvent): Promise<number> {
  const events = buildFixtureEvents(now);
  for (const event of events) {
    await upsert(event);
  }
  return events.length;
}
