import { z } from "zod";

/** Domain unions and the unified listening record (plan §1, §6). Parse, don't cast. */

export const sentimentSchema = z.enum(["positive", "negative", "neutral", "mixed"]);
export type Sentiment = z.infer<typeof sentimentSchema>;

export const intentSchema = z.enum(["complaint", "praise", "question", "purchase_intent", "spam", "other"]);
export type Intent = z.infer<typeof intentSchema>;

export const mentionSourceSchema = z.enum(["own_comment", "caption_mention", "comment_mention", "hashtag_media"]);
export type MentionSource = z.infer<typeof mentionSourceSchema>;

export const ingestedViaSchema = z.enum(["webhook", "poll"]);
export type IngestedVia = z.infer<typeof ingestedViaSchema>;

export const enrichMethodSchema = z.enum(["llm", "lexicon"]);
export type EnrichMethod = z.infer<typeof enrichMethodSchema>;

export const mentionEventSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  source: mentionSourceSchema,
  igObjectId: z.string().min(1),
  mediaId: z.string().min(1).nullable(),
  authorUsername: z.string().min(1).nullable(),
  text: z.string(),
  permalink: z.url().nullable(),
  occurredAt: z.iso.datetime(),
  ingestedVia: ingestedViaSchema,
  raw: z.record(z.string(), z.unknown()),
});
export type MentionEvent = z.infer<typeof mentionEventSchema>;

export const enrichmentSchema = z.object({
  mentionEventId: z.string().min(1),
  sentiment: sentimentSchema,
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  method: enrichMethodSchema,
});
export type Enrichment = z.infer<typeof enrichmentSchema>;

export const mediaSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  origin: z.enum(["owned", "hashtag"]),
  caption: z.string().nullable(),
  mediaType: z.string().min(1),
  permalink: z.url().nullable(),
  postedAt: z.iso.datetime(),
  likeCount: z.number().int().nonnegative(),
  commentsCount: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.unknown()),
});
export type Media = z.infer<typeof mediaSchema>;
