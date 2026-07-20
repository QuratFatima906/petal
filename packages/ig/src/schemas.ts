import { z } from "zod";
import {
  igCommentId,
  igHashtagId,
  igMediaId,
  igUserId,
  type IgCommentId,
  type IgHashtagId,
  type IgMediaId,
  type IgUserId,
} from "@petal/core";

/**
 * Zod schemas for every Graph API response WP3 consumes — parse, don't cast
 * (plan §5.3). Field surface verified 2026-07-20 in docs/meta-api-verify.md §4.
 * IDs are branded at the boundary so they cannot be cross-wired downstream.
 */

const mediaId = z.string().transform((v): IgMediaId => igMediaId(v));
const commentId = z.string().transform((v): IgCommentId => igCommentId(v));
const userId = z.string().transform((v): IgUserId => igUserId(v));
const hashtagId = z.string().transform((v): IgHashtagId => igHashtagId(v));

export const pagingSchema = z.object({
  cursors: z
    .object({
      before: z.string().optional(),
      after: z.string().optional(),
    })
    .optional(),
  next: z.string().optional(),
  previous: z.string().optional(),
});

export const mediaItemSchema = z.object({
  id: mediaId,
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_url: z.string().optional(),
  permalink: z.string().optional(),
  timestamp: z.string().optional(),
  like_count: z.number().optional(),
  comments_count: z.number().optional(),
  /** Present on /media and /tags; never returned by hashtag edges (plan L6). */
  username: z.string().optional(),
});
export type IgMediaItem = z.infer<typeof mediaItemSchema>;

export const mediaListSchema = z.object({
  data: z.array(mediaItemSchema),
  paging: pagingSchema.optional(),
});
export type IgMediaList = z.infer<typeof mediaListSchema>;

export const replySchema = z.object({
  id: commentId,
  text: z.string().optional(),
  username: z.string().optional(),
  timestamp: z.string().optional(),
  like_count: z.number().optional(),
});
export type IgReply = z.infer<typeof replySchema>;

export const commentSchema = replySchema.extend({
  replies: z
    .object({
      data: z.array(replySchema),
      paging: pagingSchema.optional(),
    })
    .optional(),
});
export type IgComment = z.infer<typeof commentSchema>;

export const commentListSchema = z.object({
  data: z.array(commentSchema),
  paging: pagingSchema.optional(),
});
export type IgCommentList = z.infer<typeof commentListSchema>;

export const replyListSchema = z.object({
  data: z.array(replySchema),
  paging: pagingSchema.optional(),
});
export type IgReplyList = z.infer<typeof replyListSchema>;

/** Hydration response for `?fields=mentioned_media.media_id(...){...}` — not a list edge. */
export const mentionedMediaSchema = z.object({
  mentioned_media: mediaItemSchema,
  id: userId,
});
export type IgMentionedMedia = z.infer<typeof mentionedMediaSchema>;

/** Hydration response for `?fields=mentioned_comment.comment_id(...){...}`. */
export const mentionedCommentSchema = z.object({
  mentioned_comment: replySchema.extend({
    media: z.object({ id: mediaId }).optional(),
  }),
  id: userId,
});
export type IgMentionedComment = z.infer<typeof mentionedCommentSchema>;

export const businessDiscoverySchema = z.object({
  business_discovery: z.object({
    id: userId,
    username: z.string(),
    followers_count: z.number().optional(),
    media_count: z.number().optional(),
    biography: z.string().optional(),
    website: z.string().optional(),
    media: mediaListSchema.optional(),
  }),
  id: userId,
});
export type IgBusinessDiscovery = z.infer<typeof businessDiscoverySchema>;

const insightBreakdownSchema = z.object({
  dimension_keys: z.array(z.string()).optional(),
  results: z.array(
    z.object({
      dimension_values: z.array(z.string()),
      value: z.number(),
    }),
  ),
});

export const insightMetricSchema = z.object({
  name: z.string(),
  period: z.string(),
  values: z.array(z.object({ value: z.number(), end_time: z.string().optional() })).optional(),
  total_value: z
    .object({
      value: z.number().optional(),
      breakdowns: z.array(insightBreakdownSchema).optional(),
    })
    .optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  id: z.string().optional(),
});
export type IgInsightMetric = z.infer<typeof insightMetricSchema>;

export const insightsSchema = z.object({
  data: z.array(insightMetricSchema),
  paging: pagingSchema.optional(),
});
export type IgInsights = z.infer<typeof insightsSchema>;

export const hashtagSearchSchema = z.object({
  data: z.array(z.object({ id: hashtagId })),
});
export type IgHashtagSearch = z.infer<typeof hashtagSearchSchema>;

/** Long-lived User token exchange response — only works while the token is still valid (verify doc §8). */
export const longLivedTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});
export type IgLongLivedToken = z.infer<typeof longLivedTokenSchema>;

/** `/{page-id}?fields=instagram_business_account` — resolves the IG business account id. */
export const pageIgAccountSchema = z.object({
  id: z.string(),
  instagram_business_account: z.object({ id: userId }).optional(),
});
export type IgPageAccount = z.infer<typeof pageIgAccountSchema>;

/** Graph error envelope; `code` distinguishes throttling (4/17/32/613) from auth (102/190). */
export const graphErrorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    fbtrace_id: z.string().optional(),
  }),
});
export type GraphErrorEnvelope = z.infer<typeof graphErrorEnvelopeSchema>;
