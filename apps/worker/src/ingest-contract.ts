import { z } from "zod";

/**
 * The pinned ingest-job contract shared with the webhook receiver in
 * apps/web. The shape is frozen: queue "ingest", job name "ingest",
 * producer options attempts 5 / exponential backoff 1000ms. apps/web is
 * built against this exact payload — do not rename, add or drop fields.
 * Deliberately local to the worker (not in @petal/core) per the WP5 spec.
 */

export const INGEST_QUEUE = "ingest";
export const INGEST_JOB_NAME = "ingest";

/** Producer job options for every `ingest` job (plan §6.1). */
export const INGEST_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
} as const;

export const pollItemSourceSchema = z.enum([
  "own_comment",
  "caption_mention",
  "comment_mention",
  "hashtag_media",
]);
export type PollItemSource = z.infer<typeof pollItemSourceSchema>;

export const ingestPayloadSchema = z.object({
  /** Instagram professional account id (ig_user_id) the item belongs to. */
  accountId: z.string().min(1),
  /** Maps to mention_events.ingested_via. */
  lane: z.enum(["webhook", "poll"]),
  /** ISO-8601 UTC — webhook arrival / poller fetch time. */
  receivedAt: z.iso.datetime({ offset: true }),
  payload: z.discriminatedUnion("kind", [
    /** One element of the Meta webhook body's entry[].changes[], verbatim (produced by apps/web). */
    z.object({ kind: z.literal("webhook_change"), field: z.string(), value: z.unknown() }),
    /** Produced by the worker's own pollers. */
    z.object({ kind: z.literal("poll_item"), source: pollItemSourceSchema, item: z.unknown() }),
  ]),
});
export type IngestJobPayload = z.infer<typeof ingestPayloadSchema>;
