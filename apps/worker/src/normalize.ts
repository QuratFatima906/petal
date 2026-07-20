import { z } from "zod";
import {
  assertNever,
  mentionEventSchema,
  mediaSchema,
  type Media,
  type MentionEvent,
} from "@petal/core";
import type { IngestJobPayload, PollItemSource } from "./ingest-contract";

/**
 * Maps both ingest lanes onto the frozen MentionEvent contract. Webhook
 * `field` values and poll sources converge on the same `source` union so
 * the two lanes overlap harmlessly on the (source, ig_object_id) upsert key.
 * Unknown webhook fields normalize to a skip — logged and acked upstream,
 * never a job failure.
 */

// ---------- tolerant boundary schemas (parse, don't cast — plan §5.3) ----------

/** Meta webhook `comments` / `live_comments` change value. */
const webhookCommentValueSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().optional(),
  media: z.looseObject({ id: z.string().min(1) }).optional(),
  from: z.looseObject({ id: z.string().optional(), username: z.string().optional() }).optional(),
});

/** Meta webhook `mentions` change value — ids only; text arrives via re-hydration. */
const webhookMentionValueSchema = z.looseObject({
  media_id: z.string().min(1),
  comment_id: z.string().min(1).optional(),
});

const embeddedMediaSchema = z.looseObject({
  id: z.string().min(1),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  like_count: z.number().optional(),
  comments_count: z.number().optional(),
});

/** Poller-produced comment item; the poller attaches the owning media as context. */
const pollCommentItemSchema = z.looseObject({
  id: z.string().min(1),
  text: z.string().optional(),
  username: z.string().optional(),
  timestamp: z.string().optional(),
  media: embeddedMediaSchema.optional(),
});

/** Poller-produced media item (tagged media, hydrated mentioned media, hashtag media). */
const pollMediaItemSchema = z.looseObject({
  id: z.string().min(1),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  username: z.string().optional(),
  like_count: z.number().optional(),
  comments_count: z.number().optional(),
});

// ---------- helpers ----------

const toIso = (value: string | undefined, fallback: string): string => {
  if (value === undefined) return new Date(fallback).toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback).toISOString() : parsed.toISOString();
};

const urlOrNull = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  return z.url().safeParse(value).success ? value : null;
};

const nameOrNull = (value: string | undefined): string | null =>
  value === undefined || value === "" ? null : value;

const asRaw = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };

export type NormalizeContext = {
  /** The db accounts.id row the event belongs to (not the ig_user_id). */
  readonly dbAccountId: string;
  /** Injected id factory (ULID at runtime, deterministic in tests). */
  readonly newId: () => string;
};

export type NormalizedIngest =
  | {
      readonly kind: "event";
      readonly event: MentionEvent;
      /** Present when the payload embeds a full owned-media object worth mirroring. */
      readonly media?: Media;
    }
  | { readonly kind: "skip"; readonly reason: string };

const skip = (reason: string): NormalizedIngest => ({ kind: "skip", reason });

type WebhookChange = Extract<IngestJobPayload["payload"], { kind: "webhook_change" }>;
type PollItem = Extract<IngestJobPayload["payload"], { kind: "poll_item" }>;

// ---------- webhook lane ----------

const normalizeWebhookChange = (
  payload: IngestJobPayload,
  change: WebhookChange,
  ctx: NormalizeContext,
): NormalizedIngest => {
  const { field, value } = change;
  switch (field) {
    case "comments":
    case "live_comments": {
      const parsed = webhookCommentValueSchema.safeParse(value);
      if (!parsed.success) return skip(`unparseable ${field} webhook value`);
      const v = parsed.data;
      return {
        kind: "event",
        event: mentionEventSchema.parse({
          id: ctx.newId(),
          accountId: ctx.dbAccountId,
          source: "own_comment",
          igObjectId: v.id,
          // Consumer nulls this out when no media row exists (FK safety).
          mediaId: v.media?.id ?? null,
          authorUsername: nameOrNull(v.from?.username),
          text: v.text ?? "",
          permalink: null,
          occurredAt: toIso(undefined, payload.receivedAt),
          ingestedVia: payload.lane,
          raw: asRaw(value),
        }),
      };
    }
    case "mentions": {
      const parsed = webhookMentionValueSchema.safeParse(value);
      if (!parsed.success) return skip("unparseable mentions webhook value");
      const v = parsed.data;
      const isComment = v.comment_id !== undefined;
      return {
        kind: "event",
        event: mentionEventSchema.parse({
          id: ctx.newId(),
          accountId: ctx.dbAccountId,
          source: isComment ? "comment_mention" : "caption_mention",
          igObjectId: v.comment_id ?? v.media_id,
          mediaId: null,
          authorUsername: null,
          // The mentions webhook carries ids only; the 5-minute re-hydration
          // poller fills text via the idempotent upsert (plan L11).
          text: "",
          permalink: null,
          occurredAt: toIso(undefined, payload.receivedAt),
          ingestedVia: payload.lane,
          raw: asRaw(value),
        }),
      };
    }
    default:
      // Unknown webhook fields are logged and acked without writing rows.
      return skip(`unknown webhook field "${field}"`);
  }
};

// ---------- poll lane ----------

const ownedMediaMirror = (
  media: z.infer<typeof embeddedMediaSchema>,
  dbAccountId: string,
): Media | undefined => {
  // Only a full object (type + timestamp) can satisfy the media contract;
  // an id-only reference is handled by the consumer's existence check.
  if (media.media_type === undefined || media.timestamp === undefined) return undefined;
  return mediaSchema.parse({
    id: media.id,
    accountId: dbAccountId,
    origin: "owned",
    caption: media.caption ?? null,
    mediaType: media.media_type,
    permalink: urlOrNull(media.permalink),
    postedAt: toIso(media.timestamp, media.timestamp),
    likeCount: media.like_count ?? 0,
    commentsCount: media.comments_count ?? 0,
    raw: asRaw(media),
  });
};

const normalizePollItem = (
  payload: IngestJobPayload,
  pollItem: PollItem,
  ctx: NormalizeContext,
): NormalizedIngest => {
  const { source, item } = pollItem;
  switch (source) {
    case "own_comment": {
      const parsed = pollCommentItemSchema.safeParse(item);
      if (!parsed.success) return skip("unparseable own_comment poll item");
      const v = parsed.data;
      const media = v.media === undefined ? undefined : ownedMediaMirror(v.media, ctx.dbAccountId);
      return {
        kind: "event",
        event: mentionEventSchema.parse({
          id: ctx.newId(),
          accountId: ctx.dbAccountId,
          source,
          igObjectId: v.id,
          mediaId: v.media?.id ?? null,
          authorUsername: nameOrNull(v.username),
          text: v.text ?? "",
          permalink: null,
          occurredAt: toIso(v.timestamp, payload.receivedAt),
          ingestedVia: payload.lane,
          raw: asRaw(item),
        }),
        ...(media === undefined ? {} : { media }),
      };
    }
    case "comment_mention": {
      const parsed = pollCommentItemSchema.safeParse(item);
      if (!parsed.success) return skip("unparseable comment_mention poll item");
      const v = parsed.data;
      return {
        kind: "event",
        event: mentionEventSchema.parse({
          id: ctx.newId(),
          accountId: ctx.dbAccountId,
          source,
          igObjectId: v.id,
          // The mentioning media is someone else's post — not mirrored (fixtures convention).
          mediaId: null,
          authorUsername: nameOrNull(v.username),
          text: v.text ?? "",
          permalink: null,
          occurredAt: toIso(v.timestamp, payload.receivedAt),
          ingestedVia: payload.lane,
          raw: asRaw(item),
        }),
      };
    }
    case "caption_mention":
    case "hashtag_media": {
      const parsed = pollMediaItemSchema.safeParse(item);
      if (!parsed.success) return skip(`unparseable ${source} poll item`);
      const v = parsed.data;
      return {
        kind: "event",
        event: mentionEventSchema.parse({
          id: ctx.newId(),
          accountId: ctx.dbAccountId,
          source,
          igObjectId: v.id,
          mediaId: null,
          // Hashtag endpoints never return username (plan L6); tags/mentions may.
          authorUsername: nameOrNull(v.username),
          text: v.caption ?? "",
          permalink: urlOrNull(v.permalink),
          occurredAt: toIso(v.timestamp, payload.receivedAt),
          ingestedVia: payload.lane,
          raw: asRaw(item),
        }),
      };
    }
    default:
      return assertNever(source);
  }
};

export const normalizeIngestPayload = (
  payload: IngestJobPayload,
  ctx: NormalizeContext,
): NormalizedIngest => {
  const inner = payload.payload;
  switch (inner.kind) {
    case "webhook_change":
      return normalizeWebhookChange(payload, inner, ctx);
    case "poll_item":
      return normalizePollItem(payload, inner, ctx);
    default:
      return assertNever(inner);
  }
};

export type { PollItemSource };
