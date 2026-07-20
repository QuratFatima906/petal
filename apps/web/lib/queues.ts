import { Queue } from "bullmq";

/**
 * Read-only BullMQ handles for the health endpoint. Queue names mirror plan
 * §6.1; the worker owns producing/consuming. Handles are cached as a lazy
 * singleton so importing this module never opens a Redis connection (next
 * build imports routes before the runtime env exists).
 */
export const QUEUE_NAMES = ["ingest", "enrich", "aggregate", "poll", "alert", "retention"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

let queues: Readonly<Record<QueueName, Queue>> | undefined;

function getQueues(redisUrl: string): Readonly<Record<QueueName, Queue>> {
  queues ??= Object.fromEntries(
    QUEUE_NAMES.map((name) => [name, new Queue(name, { connection: { url: redisUrl } })]),
  ) as Record<QueueName, Queue>;
  return queues;
}

/** Waiting + active + delayed per queue — a coarse backlog depth (plan §7). */
export async function getQueueDepths(redisUrl: string): Promise<Record<string, number>> {
  const qs = getQueues(redisUrl);
  const entries = await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const counts = await qs[name].getJobCounts("waiting", "active", "delayed");
      const depth = (counts["waiting"] ?? 0) + (counts["active"] ?? 0) + (counts["delayed"] ?? 0);
      return [name, depth] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** A successful job-count read against Redis stands in for a ping — it round-trips to the server. */
export async function pingRedis(redisUrl: string): Promise<boolean> {
  await getQueues(redisUrl).ingest.getJobCounts("waiting");
  return true;
}
