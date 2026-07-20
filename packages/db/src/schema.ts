import type { IngestedVia, Intent, MentionSource, Sentiment, EnrichMethod } from "@petal/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for every table in plan §6. Unions are stored as text and
 * typed with the frozen @petal/core unions; rows never leave this package
 * unparsed (repositories map them back to core types).
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  igUserId: text("ig_user_id").notNull().unique(),
  username: text("username").notNull(),
  accessTokenEncrypted: text("access_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"active" | "token_expired" | "disconnected">().notNull(),
  ...timestamps,
});

export const media = pgTable("media", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  origin: text("origin").$type<"owned" | "hashtag">().notNull(),
  caption: text("caption"),
  mediaType: text("media_type").notNull(),
  permalink: text("permalink"),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
  likeCount: integer("like_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

export const mentionEvents = pgTable(
  "mention_events",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    source: text("source").$type<MentionSource>().notNull(),
    igObjectId: text("ig_object_id").notNull(),
    mediaId: text("media_id").references(() => media.id),
    authorUsername: text("author_username"),
    text: text("text").notNull(),
    permalink: text("permalink"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ingestedVia: text("ingested_via").$type<IngestedVia>().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("mention_events_source_ig_object_id_uq").on(t.source, t.igObjectId),
    index("mention_events_account_occurred_idx").on(t.accountId, t.occurredAt.desc()),
    index("mention_events_account_source_occurred_idx").on(t.accountId, t.source, t.occurredAt.desc()),
  ],
);

export const enrichments = pgTable("enrichments", {
  mentionEventId: text("mention_event_id")
    .primaryKey()
    .references(() => mentionEvents.id, { onDelete: "cascade" }),
  sentiment: text("sentiment").$type<Sentiment>().notNull(),
  intent: text("intent").$type<Intent>().notNull(),
  confidence: real("confidence").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
  method: text("method").$type<EnrichMethod>().notNull(),
  ...timestamps,
});

export const enrichmentCache = pgTable("enrichment_cache", {
  contentHash: text("content_hash").primaryKey(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  ...timestamps,
});

export const dailyAggregates = pgTable(
  "daily_aggregates",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    date: date("date").notNull(),
    mentionsTotal: integer("mentions_total").notNull().default(0),
    positive: integer("positive").notNull().default(0),
    negative: integer("negative").notNull().default(0),
    neutral: integer("neutral").notNull().default(0),
    mixed: integer("mixed").notNull().default(0),
    byIntent: jsonb("by_intent").$type<Partial<Record<Intent, number>>>().notNull().default({}),
    bySource: jsonb("by_source").$type<Partial<Record<MentionSource, number>>>().notNull().default({}),
    topMedia: jsonb("top_media").$type<{ mediaId: string; mentions: number }[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

export const hashtags = pgTable("hashtags", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  ...timestamps,
});

export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  kind: text("kind").$type<"volume_spike" | "negative_share">().notNull(),
  params: jsonb("params").$type<Record<string, number>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id")
    .notNull()
    .references(() => alertRules.id),
  firedAt: timestamp("fired_at", { withTimezone: true }).notNull(),
  summary: text("summary").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  deliveredSlack: boolean("delivered_slack").notNull().default(false),
  ...timestamps,
});

export const deadLetters = pgTable("dead_letters", {
  id: text("id").primaryKey(),
  queue: text("queue").notNull(),
  jobName: text("job_name").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error").notNull(),
  attempts: integer("attempts").notNull(),
  parkedAt: timestamp("parked_at", { withTimezone: true }).notNull(),
  ...timestamps,
});
