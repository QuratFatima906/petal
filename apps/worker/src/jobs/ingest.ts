import { ValidationError } from "@petal/core";
import { upsertMedia, upsertMentionEvent, type Db } from "@petal/db";
import type { Logger } from "../logger";
import { ingestPayloadSchema } from "../ingest-contract";
import { normalizeIngestPayload } from "../normalize";
import { getAccountByIgUserId, mediaExists } from "../store";

/**
 * The ingest consumer: parse the pinned contract → normalize → idempotent
 * upsert → enqueue enrichment ONLY for newly inserted rows. Both lanes
 * (webhook and poll) flow through here, so duplicates collapse on the
 * (source, ig_object_id) key and enrichment fires exactly once per item.
 */

export type EnqueueEnrich = (job: { readonly mentionEventId: string }) => Promise<void>;

export type IngestDeps = {
  readonly db: Db;
  readonly logger: Logger;
  readonly newId: () => string;
  readonly enqueueEnrich: EnqueueEnrich;
};

/** Structural slice of a BullMQ job — keeps the processor unit-testable without Redis. */
export type IngestJobLike = {
  readonly id?: string | undefined;
  readonly data: unknown;
};

export type IngestOutcome =
  | { readonly kind: "upserted"; readonly inserted: boolean; readonly mentionEventId: string }
  | { readonly kind: "skipped"; readonly reason: string };

export const createIngestProcessor =
  (deps: IngestDeps) =>
  async (job: IngestJobLike): Promise<IngestOutcome> => {
    const parsed = ingestPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      // Contract violation → typed error → job fails and retries (then DLQ).
      throw new ValidationError(
        "ingest payload failed contract parse",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
    }
    const payload = parsed.data;
    const log = deps.logger.child({ jobId: job.id ?? null, accountId: payload.accountId });

    const account = await getAccountByIgUserId(deps.db, payload.accountId);
    if (account === null) {
      // Likely a race with account connection — retryable, parks in DLQ if it never resolves.
      throw new ValidationError(`no account row for ig_user_id ${payload.accountId}`);
    }

    const normalized = normalizeIngestPayload(payload, { dbAccountId: account.id, newId: deps.newId });
    if (normalized.kind === "skip") {
      // Unknown webhook fields et al: log + ack, never a failure (pinned contract).
      log.info({ lane: payload.lane, reason: normalized.reason }, "ingest item skipped");
      return { kind: "skipped", reason: normalized.reason };
    }

    if (normalized.media !== undefined) await upsertMedia(deps.db, normalized.media);

    let event = normalized.event;
    if (event.mediaId !== null && normalized.media === undefined && !(await mediaExists(deps.db, event.mediaId))) {
      // FK safety: an id-only media reference with no mirrored row stays in `raw`.
      event = { ...event, mediaId: null };
    }

    const { inserted } = await upsertMentionEvent(deps.db, event);
    if (inserted) await deps.enqueueEnrich({ mentionEventId: event.id });

    log.info(
      {
        lane: payload.lane,
        source: event.source,
        igObjectId: event.igObjectId,
        inserted,
        textLength: event.text.length,
      },
      "ingest item upserted",
    );
    return { kind: "upserted", inserted, mentionEventId: event.id };
  };
