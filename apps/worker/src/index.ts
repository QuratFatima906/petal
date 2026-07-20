import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { ulid } from "ulid";
import { igUserId, loadEnv } from "@petal/core";
import { createDb, parkDeadLetter } from "@petal/db";
import { createIgClient, systemClock, type IgClient } from "@petal/ig";
import { createLogger } from "./logger";
import { INGEST_JOB_NAME, INGEST_JOB_OPTIONS, type IngestJobPayload } from "./ingest-contract";
import {
  ENRICH_JOB_OPTIONS,
  POLL_JOB_NAMES,
  closeQueues,
  createQueues,
  registerSchedules,
} from "./queues";
import { createIngestProcessor } from "./jobs/ingest";
import { pollHashtags, pollMentionsAndTags, pollOwnComments, type PollDeps } from "./jobs/poll";
import { createDbPollStore, getActiveAccount } from "./store";

/**
 * Worker boot: wires all six queues and the §6.1 repeatable schedules, but
 * registers processors only for `ingest` and `poll`. The enrich, aggregate,
 * alert and retention consumers land in WP6/WP7/WP9 — their jobs queue up
 * untouched until then.
 */

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const { db, close: closeDb } = createDb(env.DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(connection);
await registerSchedules(queues);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };

const enqueueIngest = async (payload: IngestJobPayload): Promise<void> => {
  await queues.ingest.add(INGEST_JOB_NAME, payload, INGEST_JOB_OPTIONS);
};

const ingestProcessor = createIngestProcessor({
  db,
  logger,
  newId: () => ulid(),
  enqueueEnrich: async ({ mentionEventId }) => {
    await queues.enrich.add("enrich", { mentionEventId }, ENRICH_JOB_OPTIONS);
  },
});

// One client per process so the rate limiter and circuit breaker state
// survive across poll jobs (plan §13).
let igClient: IgClient | undefined;
const getIgClient = (accessToken: string, accountIgUserId: string): IgClient => {
  igClient ??= createIgClient({ accessToken, igUserId: igUserId(accountIgUserId) });
  return igClient;
};

const pollProcessor = async (job: Job): Promise<void> => {
  const log = logger.child({ jobId: job.id ?? null, pollJob: job.name });
  if (env.DEMO_MODE) {
    log.debug("demo mode — polling disabled");
    return;
  }
  if (env.IG_ACCESS_TOKEN === undefined) {
    log.warn("IG_ACCESS_TOKEN missing — polling skipped");
    return;
  }
  const account = await getActiveAccount(db);
  if (account === null) {
    log.info("no active account connected — polling skipped");
    return;
  }
  const deps: PollDeps = {
    ig: getIgClient(env.IG_ACCESS_TOKEN, account.igUserId),
    igUserId: account.igUserId,
    store: createDbPollStore(db, account.id),
    clock: systemClock,
    logger: log,
    enqueueIngest,
  };
  switch (job.name) {
    case POLL_JOB_NAMES.mentionsTags:
      await pollMentionsAndTags(deps);
      return;
    case POLL_JOB_NAMES.ownComments:
      await pollOwnComments(deps);
      return;
    case POLL_JOB_NAMES.hashtags:
      await pollHashtags(deps);
      return;
    default:
      // Unknown poll job names are logged and acked, never crashed on.
      log.warn("unknown poll job name — ignored");
  }
};

const ingestWorker = new Worker(
  "ingest",
  async (job) => {
    await ingestProcessor({ id: job.id, data: job.data });
  },
  { connection, concurrency: 5 },
);

const pollWorker = new Worker("poll", pollProcessor, { connection, concurrency: 1 });

/** Jobs exhausting their attempts park in dead_letters (plan §6.1 / §13). */
const parkOnFinalFailure =
  (queueName: string) =>
  (job: Job | undefined, error: Error): void => {
    if (job === undefined) return;
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    void parkDeadLetter(
      db,
      {
        queue: queueName,
        jobName: job.name,
        payload: asRecord(job.data),
        error: error.message,
        attempts: job.attemptsMade,
      },
      systemClock(),
    ).catch((cause: unknown) => {
      logger.error({ jobId: job.id ?? null, cause }, "failed to park dead letter");
    });
  };

ingestWorker.on("failed", parkOnFinalFailure("ingest"));
pollWorker.on("failed", parkOnFinalFailure("poll"));

logger.info(
  { queues: Object.keys(queues), consumers: ["ingest", "poll"] },
  "worker up — queues wired, schedules registered",
);

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  await Promise.allSettled([ingestWorker.close(), pollWorker.close()]);
  await closeQueues(queues);
  await connection.quit().catch(() => undefined);
  await closeDb();
  logger.info("shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
