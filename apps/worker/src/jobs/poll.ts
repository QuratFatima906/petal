import { IgApiError, IgAuthError, RateLimitError, igCommentId, igHashtagId, igMediaId } from "@petal/core";
import type { IgClient, IgComment, IgMediaItem, Clock } from "@petal/ig";
import type { Logger } from "../logger";
import { ingestPayloadSchema, type IngestJobPayload, type PollItemSource } from "../ingest-contract";
import type { PollStore } from "../store";

/**
 * The poll lane (plan §6.1): reconciliation for the best-effort webhook
 * lane. Pollers never write mention rows directly — every fetched item is
 * enqueued as an `ingest` job (lane "poll") through the same normalize →
 * upsert path webhooks use. The one direct write is deletion mirroring:
 * a re-fetch 404/disappearance removes the mirrored row (plan §13).
 *
 * Watermarks are "stop at an already-seen comment id" — `/comments` has no
 * timestamp filter, so `since=` is not an option. Caption/comment mentions
 * cannot be discovered by polling (per-ID hydration only, plan L11); the
 * poller merely re-hydrates known mention ids.
 */

export type PollLimits = {
  /** Own media scanned per cycle. */
  readonly maxMediaPerCycle: number;
  /** Comment pages fetched per media before giving up on the watermark. */
  readonly maxCommentPagesPerMedia: number;
  /** Pages of /tags per cycle. */
  readonly maxTagPages: number;
  /** Pages of hashtag recent_media per hashtag. */
  readonly maxHashtagPages: number;
  /** Known mention ids re-hydrated per cycle (most recent first). */
  readonly rehydrateLimit: number;
};

export const DEFAULT_POLL_LIMITS: PollLimits = {
  maxMediaPerCycle: 25,
  maxCommentPagesPerMedia: 10,
  maxTagPages: 3,
  maxHashtagPages: 3,
  rehydrateLimit: 50,
};

export type PollDeps = {
  readonly ig: IgClient;
  /** Instagram professional account id — the pinned contract's accountId. */
  readonly igUserId: string;
  readonly store: PollStore;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly enqueueIngest: (payload: IngestJobPayload) => Promise<void>;
  readonly limits?: Partial<PollLimits>;
};

export type PollStats = {
  readonly enqueued: number;
  readonly deleted: number;
  /** Set when the cycle stopped early (limiter exhausted / breaker open / auth). */
  readonly aborted?: string;
};

/** Limiter exhaustion and breaker-open both surface as RateLimitError — the cycle yields. */
const isCycleStop = (error: unknown): boolean =>
  error instanceof RateLimitError || error instanceof IgAuthError;

/** A re-fetch 404 (or Graph code 100 "object does not exist") means the item disappeared. */
const isDisappearance = (error: unknown): boolean =>
  error instanceof IgApiError && (error.status === 404 || error.igCode === 100);

const pollPayload = (
  igUserId: string,
  receivedAt: string,
  source: PollItemSource,
  item: unknown,
): IngestJobPayload =>
  // Validated against the pinned contract before every queue.add.
  ingestPayloadSchema.parse({
    accountId: igUserId,
    lane: "poll",
    receivedAt,
    payload: { kind: "poll_item", source, item },
  });

type Cycle = {
  enqueued: number;
  deleted: number;
  aborted?: string;
};

const finish = (cycle: Cycle, log: Logger, name: string): PollStats => {
  const stats: PollStats = {
    enqueued: cycle.enqueued,
    deleted: cycle.deleted,
    ...(cycle.aborted === undefined ? {} : { aborted: cycle.aborted }),
  };
  log.info({ pollJob: name, ...stats }, "poll cycle finished");
  return stats;
};

// ---------- owned media comments (every 15 min) ----------

export async function pollOwnComments(deps: PollDeps): Promise<PollStats> {
  const limits = { ...DEFAULT_POLL_LIMITS, ...deps.limits };
  const log = deps.logger.child({ accountId: deps.igUserId });
  const cycle: Cycle = { enqueued: 0, deleted: 0 };
  const receivedAt = deps.clock().toISOString();

  const mediaPage = await deps.ig.listOwnMedia({ limit: limits.maxMediaPerCycle });
  if (!mediaPage.ok) {
    cycle.aborted = mediaPage.error.name;
    log.warn({ error: mediaPage.error.name }, "own media listing failed; poll cycle aborted");
    return finish(cycle, log, "own-comments");
  }

  // Sequential per media — bounded concurrency by construction (plan §5.4).
  for (const media of mediaPage.value.items.slice(0, limits.maxMediaPerCycle)) {
    const outcome = await drainNewComments(deps, media, receivedAt, limits, cycle);
    if (outcome !== "done") {
      cycle.aborted = outcome.stop;
      break;
    }
  }
  return finish(cycle, log, "own-comments");
}

type MediaOutcome = "done" | { readonly stop: string };

async function drainNewComments(
  deps: PollDeps,
  media: IgMediaItem,
  receivedAt: string,
  limits: PollLimits,
  cycle: Cycle,
): Promise<MediaOutcome> {
  let after: string | undefined;
  for (let page = 0; page < limits.maxCommentPagesPerMedia; page++) {
    const res = await deps.ig.listMediaComments(igMediaId(media.id), {
      ...(after === undefined ? {} : { after }),
    });
    if (!res.ok) {
      if (isCycleStop(res.error)) return { stop: res.error.name };
      // A single broken media must not sink the cycle; move on.
      deps.logger.warn(
        { accountId: deps.igUserId, mediaId: media.id, error: res.error.name },
        "comment fetch failed for media; skipping",
      );
      return "done";
    }

    const comments = res.value.items;
    const ids = comments.flatMap((c: IgComment) => [c.id, ...(c.replies?.data.map((r) => r.id) ?? [])]);
    const known = await deps.store.knownIgObjectIds("own_comment", ids);

    for (const comment of comments) {
      // Newest-first: the first already-seen id is the watermark — stop here.
      if (known.has(comment.id)) return "done";
      const { replies, ...commentFields } = comment;
      await deps.enqueueIngest(
        pollPayload(deps.igUserId, receivedAt, "own_comment", { ...commentFields, media }),
      );
      cycle.enqueued++;
      for (const reply of replies?.data ?? []) {
        if (known.has(reply.id)) continue;
        await deps.enqueueIngest(
          pollPayload(deps.igUserId, receivedAt, "own_comment", { ...reply, media }),
        );
        cycle.enqueued++;
      }
    }

    after = res.value.after;
    if (after === undefined) return "done";
  }
  return "done";
}

// ---------- mention re-hydration + /tags (every 5 min) ----------

export async function pollMentionsAndTags(deps: PollDeps): Promise<PollStats> {
  const limits = { ...DEFAULT_POLL_LIMITS, ...deps.limits };
  const log = deps.logger.child({ accountId: deps.igUserId });
  const cycle: Cycle = { enqueued: 0, deleted: 0 };
  const receivedAt = deps.clock().toISOString();

  const refs = await deps.store.listKnownMentionRefs(limits.rehydrateLimit);

  // Re-hydration only: a mention id we never saw via webhook is a permanently
  // missed mention — accepted gap (plan L11).
  for (const mediaId of refs.captionMentionMediaIds) {
    const res = await deps.ig.getMentionedMedia(igMediaId(mediaId));
    if (res.ok) {
      await deps.enqueueIngest(pollPayload(deps.igUserId, receivedAt, "caption_mention", res.value));
      cycle.enqueued++;
      continue;
    }
    if (isCycleStop(res.error)) {
      cycle.aborted = res.error.name;
      return finish(cycle, log, "mentions-tags");
    }
    if (isDisappearance(res.error)) {
      cycle.deleted += await deps.store.deleteMirrored("caption_mention", [mediaId]);
    }
  }

  for (const commentId of refs.commentMentionIds) {
    const res = await deps.ig.getMentionedComment(igCommentId(commentId));
    if (res.ok) {
      await deps.enqueueIngest(pollPayload(deps.igUserId, receivedAt, "comment_mention", res.value));
      cycle.enqueued++;
      continue;
    }
    if (isCycleStop(res.error)) {
      cycle.aborted = res.error.name;
      return finish(cycle, log, "mentions-tags");
    }
    if (isDisappearance(res.error)) {
      cycle.deleted += await deps.store.deleteMirrored("comment_mention", [commentId]);
    }
  }

  // Tagged media (`/tags`) — the pollable slice of the mention surface.
  let after: string | undefined;
  for (let page = 0; page < limits.maxTagPages; page++) {
    const res = await deps.ig.listTaggedMedia({ ...(after === undefined ? {} : { after }) });
    if (!res.ok) {
      if (isCycleStop(res.error)) cycle.aborted = res.error.name;
      else log.warn({ error: res.error.name }, "tagged media fetch failed");
      break;
    }
    for (const item of res.value.items) {
      await deps.enqueueIngest(pollPayload(deps.igUserId, receivedAt, "caption_mention", item));
      cycle.enqueued++;
    }
    after = res.value.after;
    if (after === undefined) break;
  }

  return finish(cycle, log, "mentions-tags");
}

// ---------- active hashtags (hourly, 24h recency window) ----------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pollHashtags(deps: PollDeps): Promise<PollStats> {
  const limits = { ...DEFAULT_POLL_LIMITS, ...deps.limits };
  const log = deps.logger.child({ accountId: deps.igUserId });
  const cycle: Cycle = { enqueued: 0, deleted: 0 };
  const now = deps.clock();
  const receivedAt = now.toISOString();
  const windowStart = now.getTime() - DAY_MS;

  const hashtags = await deps.store.listActiveHashtags();
  for (const hashtag of hashtags) {
    let after: string | undefined;
    for (let page = 0; page < limits.maxHashtagPages; page++) {
      const res = await deps.ig.listHashtagRecentMedia(igHashtagId(hashtag.id), {
        ...(after === undefined ? {} : { after }),
      });
      if (!res.ok) {
        if (isCycleStop(res.error)) {
          cycle.aborted = res.error.name;
          return finish(cycle, log, "hashtags");
        }
        log.warn({ hashtagId: hashtag.id, error: res.error.name }, "hashtag fetch failed; skipping");
        break;
      }
      for (const item of res.value.items) {
        // recent_media only returns the last 24h anyway (plan L3); the window
        // check keeps overlap between hourly runs cheap and explicit.
        const ts = item.timestamp === undefined ? undefined : new Date(item.timestamp).getTime();
        if (ts !== undefined && (Number.isNaN(ts) || ts < windowStart)) continue;
        await deps.enqueueIngest(pollPayload(deps.igUserId, receivedAt, "hashtag_media", item));
        cycle.enqueued++;
      }
      after = res.value.after;
      if (after === undefined) break;
    }
    await deps.store.markHashtagPolled(hashtag.id, now);
  }

  return finish(cycle, log, "hashtags");
}
