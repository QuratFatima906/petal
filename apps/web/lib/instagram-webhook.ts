import { z } from "zod";

/**
 * Tolerant parse of a Meta webhook delivery (plan §5.3: parse, don't cast —
 * but stay loose so unknown fields pass through verbatim to the ingest job).
 * Field names verified against Meta webhook docs, docs/meta-api-verify.md §2–3.
 */
export const webhookChangeSchema = z.looseObject({
  field: z.string(),
  value: z.unknown(),
});

export const webhookEntrySchema = z.looseObject({
  id: z.string(),
  // Messaging-style deliveries carry no `changes`; the route logs and acks those.
  changes: z.array(webhookChangeSchema).optional(),
});

export const webhookDeliverySchema = z.looseObject({
  object: z.string(),
  entry: z.array(webhookEntrySchema),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
