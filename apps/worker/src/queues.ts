import { Queue, type JobsOptions } from "bullmq";
import type IORedis from "ioredis";

/**
 * Queue topology from plan §6.1. All six queues and their repeatable
 * schedules are registered at boot; WP5 only implements the `ingest` and
 * `poll` consumers — enrich/aggregate/alert/retention jobs simply wait for
 * their consumers (WP6/WP7/WP9), nothing consumes them destructively.
 */

export const QUEUE_NAMES = ["ingest", "enrich", "aggregate", "poll", "alert", "retention"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** enrich: attempts 3; final failure parks in dead_letters + lexicon fallback (WP6). */
export const ENRICH_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
} as const satisfies JobsOptions;

export const POLL_JOB_NAMES = {
  /** Mention re-hydration + `/tags`, every 5 minutes. */
  mentionsTags: "poll:mentions-tags",
  /** Owned media comments, every 15 minutes. */
  ownComments: "poll:own-comments",
  /** Active hashtags hourly, 24h recency window. */
  hashtags: "poll:hashtags",
} as const;
export type PollJobName = (typeof POLL_JOB_NAMES)[keyof typeof POLL_JOB_NAMES];

export type RepeatableSchedule = {
  readonly queue: QueueName;
  readonly jobName: string;
  /** Scheduler id doubles as the singleton key — one repeatable per job name. */
  readonly schedulerId: string;
  readonly repeat: { readonly every: number } | { readonly pattern: string };
};

const MINUTE_MS = 60_000;

/** Repeatable schedules from plan §6.1 — singleton per job name via the scheduler id. */
export const REPEATABLE_SCHEDULES: readonly RepeatableSchedule[] = [
  {
    queue: "poll",
    jobName: POLL_JOB_NAMES.mentionsTags,
    schedulerId: POLL_JOB_NAMES.mentionsTags,
    repeat: { every: 5 * MINUTE_MS },
  },
  {
    queue: "poll",
    jobName: POLL_JOB_NAMES.ownComments,
    schedulerId: POLL_JOB_NAMES.ownComments,
    repeat: { every: 15 * MINUTE_MS },
  },
  {
    queue: "poll",
    jobName: POLL_JOB_NAMES.hashtags,
    schedulerId: POLL_JOB_NAMES.hashtags,
    repeat: { every: 60 * MINUTE_MS },
  },
  {
    queue: "alert",
    jobName: "alert:evaluate",
    schedulerId: "alert:evaluate",
    repeat: { every: 10 * MINUTE_MS },
  },
  {
    queue: "retention",
    jobName: "retention:purge",
    schedulerId: "retention:purge",
    // Daily, off-peak UTC (plan §6.1 "repeatable, daily").
    repeat: { pattern: "0 3 * * *" },
  },
];

export type Queues = Readonly<Record<QueueName, Queue>>;

export const createQueues = (connection: IORedis): Queues => {
  const make = (name: QueueName, defaultJobOptions?: JobsOptions): Queue =>
    new Queue(name, {
      connection,
      ...(defaultJobOptions === undefined ? {} : { defaultJobOptions }),
    });
  return {
    // Producer options for ingest live on each add() (pinned contract), the
    // defaults here are the same values so foreign producers inherit them.
    ingest: make("ingest", { attempts: 5, backoff: { type: "exponential", delay: 1000 } }),
    enrich: make("enrich", ENRICH_JOB_OPTIONS),
    aggregate: make("aggregate"),
    poll: make("poll"),
    alert: make("alert"),
    retention: make("retention"),
  };
};

/** Upserts every repeatable schedule; idempotent across restarts. */
export const registerSchedules = async (queues: Queues): Promise<void> => {
  for (const s of REPEATABLE_SCHEDULES) {
    await queues[s.queue].upsertJobScheduler(s.schedulerId, s.repeat, {
      name: s.jobName,
      data: {},
      opts: { removeOnComplete: 20, removeOnFail: 50 },
    });
  }
};

export const closeQueues = async (queues: Queues): Promise<void> => {
  await Promise.all(Object.values(queues).map((q) => q.close()));
};
