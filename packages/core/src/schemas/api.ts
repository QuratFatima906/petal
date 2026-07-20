import { z } from "zod";
import { enrichmentSchema, intentSchema, mentionEventSchema, mentionSourceSchema, sentimentSchema } from "./mention-event";

/**
 * Internal API contracts (plan §7). Route handlers and the web client both
 * import these; responses are { data } or { error: { code, message } }.
 */

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiData = <T extends z.ZodType>(data: T) => z.object({ data });

export const healthResponseSchema = apiData(
  z.object({
    db: z.boolean(),
    redis: z.boolean(),
    queueDepths: z.record(z.string(), z.number().int().nonnegative()),
  }),
);
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const statsOverviewQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

const dayPointSchema = z.object({
  date: z.iso.date(),
  total: z.number().int().nonnegative(),
  positive: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative(),
  mixed: z.number().int().nonnegative(),
});

export const statsOverviewResponseSchema = apiData(
  z.object({
    totals: z.object({
      mentions: z.number().int().nonnegative(),
      negativeShare: z.number().min(0).max(1),
      purchaseIntent: z.number().int().nonnegative(),
    }),
    deltas: z.object({
      mentionsPct: z.number().nullable(),
      negativeSharePts: z.number().nullable(),
      purchaseIntent: z.number().int().nullable(),
    }),
    series: z.array(dayPointSchema),
    byIntent: z.record(intentSchema, z.number().int().nonnegative()),
    topMedia: z
      .array(z.object({ mediaId: z.string(), caption: z.string().nullable(), mentions: z.number().int().nonnegative() }))
      .max(5),
  }),
);
export type StatsOverviewResponse = z.infer<typeof statsOverviewResponseSchema>;

export const mentionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sentiment: sentimentSchema.optional(),
  intent: intentSchema.optional(),
  source: mentionSourceSchema.optional(),
  q: z.string().optional(),
});
export type MentionsQuery = z.infer<typeof mentionsQuerySchema>;

export const feedItemSchema = z.object({
  event: mentionEventSchema,
  enrichment: enrichmentSchema.nullable(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const mentionsResponseSchema = apiData(
  z.object({
    items: z.array(feedItemSchema),
    nextCursor: z.string().nullable(),
  }),
);
export type MentionsResponse = z.infer<typeof mentionsResponseSchema>;

export const mentionDetailResponseSchema = apiData(
  z.object({
    event: mentionEventSchema,
    enrichment: enrichmentSchema.nullable(),
    media: z
      .object({ id: z.string(), caption: z.string().nullable(), permalink: z.url().nullable(), postedAt: z.iso.datetime() })
      .nullable(),
  }),
);
export type MentionDetailResponse = z.infer<typeof mentionDetailResponseSchema>;

export const alertRuleSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["volume_spike", "negative_share"]),
  params: z.record(z.string(), z.number()),
  enabled: z.boolean(),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

export const alertSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  firedAt: z.iso.datetime(),
  summary: z.string(),
  deliveredSlack: z.boolean(),
});
export type Alert = z.infer<typeof alertSchema>;

export const alertsResponseSchema = apiData(
  z.object({ rules: z.array(alertRuleSchema), fired: z.array(alertSchema) }),
);
export type AlertsResponse = z.infer<typeof alertsResponseSchema>;

export const alertRulePatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    params: z.record(z.string(), z.number()).optional(),
  })
  .refine((v) => v.enabled !== undefined || v.params !== undefined, { message: "empty patch" });
export type AlertRulePatch = z.infer<typeof alertRulePatchSchema>;
