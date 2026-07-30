import { deleteExpiredMentionEvents, type Db } from "@petal/db";
import type { Logger } from "../logger";

/**
 * Retention consumer (plan WP10 / §6.1): purge mention_events (and their
 * enrichments via FK cascade) older than `RETENTION_DAYS`. Runs daily via the
 * `retention:purge` repeatable schedule.
 *
 * Compliance: Meta platform terms and GDPR-like obligations require data to
 * be deleted after a reasonable period (plan §13, L7).
 */

export type RetentionDeps = {
  readonly db: Db;
  readonly logger: Logger;
  readonly retentionDays: number;
  readonly clock: () => Date;
};

/** Structural slice of a BullMQ job — keeps the processor testable without Redis. */
export type RetentionJobLike = {
  readonly id?: string | undefined;
  readonly data: unknown;
};

export type RetentionOutcome = {
  readonly deletedCount: number;
};

export const createRetentionProcessor =
  (deps: RetentionDeps) =>
  async (_job: RetentionJobLike): Promise<RetentionOutcome> => {
    const log = deps.logger.child({ jobId: _job.id ?? null });
    const now = deps.clock();
    const deletedCount = await deleteExpiredMentionEvents(deps.db, {
      retentionDays: deps.retentionDays,
      now,
    });
    log.info({ deletedCount, retentionDays: deps.retentionDays }, "retention purge complete");
    return { deletedCount };
  };
