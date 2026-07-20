import { ValidationError } from "@petal/core";
import { recomputeDayAggregate, type Db } from "@petal/db";
import { z } from "zod";
import type { Logger } from "../logger";

/**
 * Aggregate consumer (plan WP7 / §6.1): parse the pinned producer payload,
 * then recompute the affected (account, UTC day) rollup from source. Recompute
 * -from-source is deliberately idempotent — replays, overlaps and job retries
 * all converge on identical `daily_aggregates` rows. The producer (WP6 enrich)
 * debounces on a deterministic `jobId: aggregate:${accountId}:${date}`.
 */

/**
 * Pinned aggregate job payload. WP6 produces this exact shape in parallel;
 * parsed at the worker boundary (plan §5.3 "parse, don't cast"), deliberately
 * NOT in @petal/core — it is a queue contract, not a domain type.
 */
export const aggregatePayloadSchema = z.object({
  accountId: z.string().min(1),
  /** The UTC day (YYYY-MM-DD) of the event's occurred_at. */
  date: z.iso.date(),
});
export type AggregatePayload = z.infer<typeof aggregatePayloadSchema>;

export type AggregateDeps = {
  readonly db: Db;
  readonly logger: Logger;
};

/** Structural slice of a BullMQ job — keeps the processor testable without Redis. */
export type AggregateJobLike = {
  readonly id?: string | undefined;
  readonly data: unknown;
};

export type AggregateOutcome = {
  readonly accountId: string;
  readonly date: string;
  readonly mentionsTotal: number;
};

export const createAggregateProcessor =
  (deps: AggregateDeps) =>
  async (job: AggregateJobLike): Promise<AggregateOutcome> => {
    const parsed = aggregatePayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      // Contract violation → typed error → job fails and retries (then DLQ).
      throw new ValidationError(
        "aggregate payload failed contract parse",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    const { accountId, date } = parsed.data;
    const log = deps.logger.child({ jobId: job.id ?? null, accountId });

    const agg = await recomputeDayAggregate(deps.db, accountId, date);

    log.info({ date, mentionsTotal: agg.mentionsTotal }, "daily aggregate recomputed");
    return { accountId, date, mentionsTotal: agg.mentionsTotal };
  };
