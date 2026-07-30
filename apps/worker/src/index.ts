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
import { createAggregateProcessor } from "./jobs/aggregate";
import { createAnthropicClassifier, createLexiconClassifier } from "@petal/ai";
import { createIngestProcessor } from "./jobs/ingest";
import {
  AGGREGATE_JOB_NAME,
  aggregateJobId,
  createDbEnrichStore,
  createEnrichProcessor,
} from "./jobs/enrich";
import { createAlertProcessor } from "./jobs/alert";
import { createRetentionProcessor } from "./jobs/retention";
import { pollHashtags, pollMentionsAndTags, pollOwnComments, type PollDeps } from "./jobs/poll";
import { createDbPollStore, getActiveAccount } from "./store";
import { migrateDb } from "@petal/db";

/**
 * Worker boot: wires all six queues, the §6.1 repeatable schedules, and all
 * six processors — ingest, poll, enrich, aggregate, alert, and retention.
 */

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const { db, close: closeDb } = createDb(env.DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(connection);
await registerSchedules(queues);

// Run pending migrations at boot (plan §10).
await migrateDb(db);

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

// Aggregate consumer (WP7): recompute the affected (account, UTC day) rollup.
const aggregateProcessor = createAggregateProcessor({ db, logger });
const aggregateWorker = new Worker(
  "aggregate",
  async (job) => {
    await aggregateProcessor({ id: job.id, data: job.data });
  },
  { connection, concurrency: 3 },
);

// Enrich consumer (WP6): cache lookup → LLM structured output → write + cache,
// with lexicon degradation. Uses the real Anthropic client when a key is
// present and demo mode is off, else the offline lexicon scorer.
const enrichClassifier =
  env.ANTHROPIC_API_KEY !== undefined && !env.DEMO_MODE
    ? createAnthropicClassifier({ apiKey: env.ANTHROPIC_API_KEY })
    : createLexiconClassifier();
const enrichProcessor = createEnrichProcessor({
  store: createDbEnrichStore(db, systemClock),
  logger,
  classifier: enrichClassifier,
  budgetUsd: env.ENRICH_DAILY_BUDGET_USD,
  clock: systemClock,
  enqueueAggregate: async (job) => {
    await queues.aggregate.add(AGGREGATE_JOB_NAME, job, { jobId: aggregateJobId(job.accountId, job.date) });
  },
});
const enrichWorker = new Worker(
  "enrich",
  async (job) => {
    await enrichProcessor({
      id: job.id,
      data: job.data,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? ENRICH_JOB_OPTIONS.attempts,
    });
  },
  { connection, concurrency: 5 },
);

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
aggregateWorker.on("failed", parkOnFinalFailure("aggregate"));
enrichWorker.on("failed", parkOnFinalFailure("enrich"));

// Alert consumer (WP9): evaluate rules over aggregates, deliver to Slack.
const alertProcessor = createAlertProcessor({
  db,
  logger,
  clock: systemClock,
  slackWebhookUrl: env.SLACK_WEBHOOK_URL,
  httpPost: async (url, body) => {
    const resp = await fetch(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    return { ok: resp.ok };
  },
});
const alertWorker = new Worker("alert", async (job) => alertProcessor({ id: job.id, data: job.data }), {
  connection,
  concurrency: 1,
});

// Retention consumer (WP10): purge events past the retention window (plan §6.1).
const retentionProcessor = createRetentionProcessor({ db, logger, retentionDays: env.RETENTION_DAYS, clock: systemClock });
const retentionWorker = new Worker("retention", async (job) => retentionProcessor({ id: job.id, data: job.data }), {
  connection,
  concurrency: 1,
});

alertWorker.on("failed", parkOnFinalFailure("alert"));
retentionWorker.on("failed", parkOnFinalFailure("retention"));

logger.info(
  { queues: Object.keys(queues), consumers: ["ingest", "poll", "aggregate", "enrich", "alert", "retention"] },
  "worker up — all queues, consumers, and schedules registered",
);

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  await Promise.allSettled([
    ingestWorker.close(),
    pollWorker.close(),
    aggregateWorker.close(),
    enrichWorker.close(),
    alertWorker.close(),
    retentionWorker.close(),
  ]);
  await closeQueues(queues);
  await connection.quit().catch(() => undefined);
  await closeDb();
  logger.info("shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
