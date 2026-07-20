import { Queue } from "bullmq";
import { z } from "zod";

/**
 * Producer side of the pinned `ingest` job contract (plan §6.1). The worker
 * consumes this exact shape; do not rename, add, or drop fields.
 */
export const INGEST_QUEUE_NAME = "ingest";
export const INGEST_JOB_NAME = "ingest";

/** Pinned producer job options: 5 attempts with exponential backoff from 1s. */
export const INGEST_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
} as const;

export const ingestJobPayloadSchema = z.object({
  /** Instagram professional account id (ig_user_id) — webhook `entry[].id`. */
  accountId: z.string().min(1),
  /** Maps to `mention_events.ingested_via`; the webhook route always sends "webhook". */
  lane: z.enum(["webhook", "poll"]),
  /** ISO-8601 UTC timestamp of when the delivery arrived. */
  receivedAt: z.iso.datetime(),
  payload: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("webhook_change"),
      field: z.string(),
      value: z.unknown(),
    }),
    z.object({
      kind: z.literal("poll_item"),
      source: z.enum(["own_comment", "caption_mention", "comment_mention", "hashtag_media"]),
      item: z.unknown(),
    }),
  ]),
});

export type IngestJobPayload = z.infer<typeof ingestJobPayloadSchema>;

let queue: Queue | undefined;

// Lazy singleton so importing the route module never opens a Redis connection
// (next build imports routes; tests stub bullmq entirely).
function getIngestQueue(redisUrl: string): Queue {
  queue ??= new Queue(INGEST_QUEUE_NAME, { connection: { url: redisUrl } });
  return queue;
}

/** Validates the payload against the pinned contract, then enqueues it. */
export async function enqueueIngestJob(redisUrl: string, payload: IngestJobPayload): Promise<void> {
  const parsed = ingestJobPayloadSchema.parse(payload);
  await getIngestQueue(redisUrl).add(INGEST_JOB_NAME, parsed, INGEST_JOB_OPTIONS);
}
