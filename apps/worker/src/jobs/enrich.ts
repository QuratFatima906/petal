import {
  EnrichmentError,
  ValidationError,
  intentSchema,
  mentionEventSchema,
  sentimentSchema,
  type Enrichment,
  type Intent,
  type MentionEvent,
  type Sentiment,
} from "@petal/core";
import {
  getCachedEnrichment,
  insertEnrichment,
  parkDeadLetter,
  schema,
  setCachedEnrichment,
  type Db,
  type ParkDeadLetterInput,
} from "@petal/db";
import {
  LEXICON_MODEL,
  LEXICON_VERSION,
  PROMPT_VERSION,
  contentHash,
  lexiconScore,
  normalizeText,
  type Classification,
  type Classifier,
  type ClassifyResult,
} from "@petal/ai";
import { gte, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "@petal/ig";
import type { Logger } from "../logger";

/**
 * The enrich consumer (plan §6.1, §9, §13). Receives one `{ mentionEventId }`,
 * loads the event row at process time (the payload carries no text), then:
 * normalize → cache lookup → LLM (structured output) → write enrichment + cache.
 * The pipeline degrades but never stalls — budget breach, malformed model
 * output, an empty re-hydrating row, or a final-attempt failure all fall back
 * to the keyword lexicon flagged `method: "lexicon"`. After every successful
 * write it enqueues the pinned aggregate job.
 */

// ---------- pinned aggregate-job contract (WP7 consumes this exact shape) ----------
// Defined locally in apps/worker per the contract note; NOT added to @petal/core.
export const AGGREGATE_QUEUE = "aggregate";
export const AGGREGATE_JOB_NAME = "aggregate";

export const aggregateJobSchema = z.object({
  accountId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AggregateJob = z.infer<typeof aggregateJobSchema>;

/** Deterministic per-day debounce key so a busy day recomputes once. */
export const aggregateJobId = (accountId: string, date: string): string => `aggregate:${accountId}:${date}`;

// ---------- payload ----------

export const enrichPayloadSchema = z.object({ mentionEventId: z.string().min(1) });

// ---------- store seam (keeps the processor unit-testable without Postgres) ----------

/** The LLM-derived result kept in the enrichment cache (skips the model on a hit). */
export type CachedClassification = {
  readonly sentiment: Sentiment;
  readonly intent: Intent;
  readonly confidence: number;
  readonly model: string;
};

const cachedClassificationSchema = z.object({
  sentiment: sentimentSchema,
  intent: intentSchema,
  confidence: z.number().min(0).max(1),
  model: z.string().min(1),
});

export type EnrichStore = {
  loadEvent(mentionEventId: string): Promise<MentionEvent | null>;
  getCached(hash: string): Promise<CachedClassification | null>;
  setCached(hash: string, value: CachedClassification): Promise<void>;
  writeEnrichment(enrichment: Enrichment): Promise<void>;
  /** Sum of `cost_usd` written on the UTC day of `now` — the daily budget gate. */
  dailyCostUsd(now: Date): Promise<number>;
  park(input: ParkDeadLetterInput): Promise<void>;
};

const utcDayStart = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Production store backed by @petal/db repositories + a couple of direct reads. */
export const createDbEnrichStore = (db: Db, clock: Clock): EnrichStore => ({
  loadEvent: async (mentionEventId) => {
    const [row] = await db
      .select()
      .from(schema.mentionEvents)
      .where(eq(schema.mentionEvents.id, mentionEventId))
      .limit(1);
    if (row === undefined) return null;
    return mentionEventSchema.parse({
      id: row.id,
      accountId: row.accountId,
      source: row.source,
      igObjectId: row.igObjectId,
      mediaId: row.mediaId,
      authorUsername: row.authorUsername,
      text: row.text,
      permalink: row.permalink,
      occurredAt: row.occurredAt.toISOString(),
      ingestedVia: row.ingestedVia,
      raw: row.raw,
    });
  },
  getCached: async (hash) => {
    const result = await getCachedEnrichment(db, hash);
    if (result === null) return null;
    const parsed = cachedClassificationSchema.safeParse(result);
    return parsed.success ? parsed.data : null;
  },
  setCached: (hash, value) => setCachedEnrichment(db, hash, { ...value }),
  writeEnrichment: (enrichment) => insertEnrichment(db, enrichment),
  dailyCostUsd: async (now) => {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${schema.enrichments.costUsd}), 0)` })
      .from(schema.enrichments)
      .where(gte(schema.enrichments.createdAt, utcDayStart(now)));
    return Number(row?.total ?? 0);
  },
  park: (input) => parkDeadLetter(db, input, clock()).then(() => undefined),
});

// ---------- processor ----------

export type EnqueueAggregate = (job: AggregateJob) => Promise<void>;

export type EnrichDeps = {
  readonly store: EnrichStore;
  readonly logger: Logger;
  readonly classifier: Classifier;
  readonly budgetUsd: number;
  readonly clock: Clock;
  readonly enqueueAggregate: EnqueueAggregate;
};

/** Structural slice of a BullMQ job — keeps the processor testable without Redis. */
export type EnrichJobLike = {
  readonly id?: string | undefined;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly maxAttempts: number;
};

export type EnrichOutcome = { readonly kind: EnrichKind; readonly method?: "llm" | "lexicon" };
type EnrichKind =
  | "cache-hit"
  | "llm"
  | "budget-lexicon"
  | "malformed-lexicon"
  | "empty-lexicon"
  | "final-failure-lexicon"
  | "final-failure-parked"
  | "bad-payload-parked";

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };

const utcDate = (occurredAt: string): string => occurredAt.slice(0, 10);

const buildEnrichment = (
  mentionEventId: string,
  c: Classification,
  opts: { method: "llm" | "lexicon"; model: string; promptVersion: string; costUsd: number; latencyMs: number },
): Enrichment => ({
  mentionEventId,
  sentiment: c.sentiment,
  intent: c.intent,
  confidence: c.confidence,
  model: opts.model,
  promptVersion: opts.promptVersion,
  latencyMs: opts.latencyMs,
  costUsd: opts.costUsd,
  method: opts.method,
});

export const createEnrichProcessor =
  (deps: EnrichDeps) =>
  async (job: EnrichJobLike): Promise<EnrichOutcome> => {
    const isFinalAttempt = job.attemptsMade + 1 >= job.maxAttempts;

    const parsed = enrichPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      const err = new ValidationError(
        "enrich payload failed contract parse",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      );
      // No id to fall back on: retry until the final attempt, then park.
      if (!isFinalAttempt) throw err;
      await deps.store.park({
        queue: "enrich",
        jobName: "enrich",
        payload: asRecord(job.data),
        error: err.message,
        attempts: job.attemptsMade + 1,
      });
      return { kind: "bad-payload-parked" };
    }

    const { mentionEventId } = parsed.data;
    const log = deps.logger.child({ jobId: job.id ?? null, mentionEventId });

    try {
      return await runPipeline(deps, mentionEventId, isFinalAttempt, log);
    } catch (err) {
      // Non-final attempts retry via BullMQ backoff; the final attempt degrades
      // (park + lexicon) so the pipeline never stalls (plan §6.1).
      if (!isFinalAttempt) throw err;
      return handleFinalFailure(deps, mentionEventId, err, job.attemptsMade + 1, log);
    }
  };

async function runPipeline(
  deps: EnrichDeps,
  mentionEventId: string,
  isFinalAttempt: boolean,
  log: Logger,
): Promise<EnrichOutcome> {
  const startMs = deps.clock().getTime();

  const event = await deps.store.loadEvent(mentionEventId);
  if (event === null) {
    // Retryable: likely a race with the ingest upsert. Parks on final attempt
    // (handleFinalFailure) — with no text there is nothing to lexicon-score.
    throw new EnrichmentError(`no mention_event row for ${mentionEventId}`);
  }

  const normalized = normalizeText(event.text);

  // Empty-text wrinkle (plan §9, known issue): `mentions`-webhook rows are
  // inserted with EMPTY text and enrich fires on insert; the 5-min re-hydrator
  // fills text later via upsert (inserted:false → no re-enqueue). So a retryable
  // error here gives BullMQ's 3-attempt backoff time for the re-hydrator to run.
  // On the FINAL attempt with still-empty text we write a neutral/low-confidence
  // lexicon result instead of parking — the item is real, just textless for now.
  if (normalized === "") {
    if (!isFinalAttempt) throw new EnrichmentError("empty text — awaiting re-hydrator");
    return degradeToLexicon(deps, event, startMs, "empty-lexicon", log);
  }

  const hash = contentHash(normalized, PROMPT_VERSION);

  const cached = await deps.store.getCached(hash);
  if (cached !== null) {
    // Cache hit skips the model entirely (plan §9).
    const enrichment = buildEnrichment(
      mentionEventId,
      { sentiment: cached.sentiment, intent: cached.intent, confidence: cached.confidence },
      { method: "llm", model: cached.model, promptVersion: PROMPT_VERSION, costUsd: 0, latencyMs: elapsed(deps, startMs) },
    );
    await deps.store.writeEnrichment(enrichment);
    await enqueueAggregate(deps, event);
    log.info({ source: event.source, textLength: normalized.length, cache: "hit", costUsd: 0 }, "enrichment written");
    return { kind: "cache-hit", method: "llm" };
  }

  // Budget hard stop (plan §13): once today's LLM spend exceeds the daily
  // budget, no more model calls that day — degrade to the lexicon.
  const spent = await deps.store.dailyCostUsd(deps.clock());
  if (spent >= deps.budgetUsd) {
    log.warn({ spentUsd: spent, budgetUsd: deps.budgetUsd }, "daily LLM budget exhausted — lexicon fallback");
    return degradeToLexicon(deps, event, startMs, "budget-lexicon", log);
  }

  // Model path: malformed output retries once, then degrades (plan §9).
  const classifyResult = await classifyWithOneRetry(deps.classifier, normalized);
  if (classifyResult === null) {
    log.warn({ source: event.source }, "model output malformed twice — lexicon fallback");
    return degradeToLexicon(deps, event, startMs, "malformed-lexicon", log);
  }

  const classification = classifyResult.results[0];
  if (classification === undefined) {
    return degradeToLexicon(deps, event, startMs, "malformed-lexicon", log);
  }

  const enrichment = buildEnrichment(mentionEventId, classification, {
    method: "llm",
    model: classifyResult.model,
    promptVersion: PROMPT_VERSION,
    costUsd: classifyResult.costUsd,
    latencyMs: elapsed(deps, startMs),
  });
  await deps.store.writeEnrichment(enrichment);
  await deps.store.setCached(hash, {
    sentiment: classification.sentiment,
    intent: classification.intent,
    confidence: classification.confidence,
    model: classifyResult.model,
  });
  await enqueueAggregate(deps, event);
  log.info(
    { source: event.source, textLength: normalized.length, cache: "miss", costUsd: enrichment.costUsd },
    "enrichment written",
  );
  return { kind: "llm", method: "llm" };
}

/** Runs the model once; on malformed output retries once; returns null if still malformed. */
async function classifyWithOneRetry(classifier: Classifier, text: string): Promise<ClassifyResult | null> {
  try {
    return await classifier.classify([text]);
  } catch (err) {
    if (!(err instanceof EnrichmentError)) throw err; // network/unexpected → bubble up (retry/park)
    try {
      return await classifier.classify([text]);
    } catch (err2) {
      if (!(err2 instanceof EnrichmentError)) throw err2;
      return null; // malformed twice → caller degrades to lexicon
    }
  }
}

async function degradeToLexicon(
  deps: EnrichDeps,
  event: MentionEvent,
  startMs: number,
  kind: Extract<EnrichKind, "empty-lexicon" | "budget-lexicon" | "malformed-lexicon">,
  log: Logger,
): Promise<EnrichOutcome> {
  const classification = lexiconScore(event.text);
  const enrichment = buildEnrichment(event.id, classification, {
    method: "lexicon",
    model: LEXICON_MODEL,
    promptVersion: LEXICON_VERSION,
    costUsd: 0,
    latencyMs: elapsed(deps, startMs),
  });
  await deps.store.writeEnrichment(enrichment);
  await enqueueAggregate(deps, event);
  log.info({ source: event.source, method: "lexicon", reason: kind }, "enrichment written (lexicon)");
  return { kind, method: "lexicon" };
}

async function handleFinalFailure(
  deps: EnrichDeps,
  mentionEventId: string,
  err: unknown,
  attempts: number,
  log: Logger,
): Promise<EnrichOutcome> {
  const message = err instanceof Error ? err.message : String(err);
  await deps.store.park({
    queue: "enrich",
    jobName: "enrich",
    payload: { mentionEventId },
    error: message,
    attempts,
  });
  // Best-effort lexicon fallback so the pipeline degrades rather than stalls
  // (plan §6.1: final failure → dead_letters AND a lexicon result).
  try {
    const event = await deps.store.loadEvent(mentionEventId);
    if (event !== null) {
      await degradeToLexicon(deps, event, deps.clock().getTime(), "malformed-lexicon", log);
      log.warn({ error: message, attempts }, "enrich final failure — parked + lexicon fallback");
      return { kind: "final-failure-lexicon", method: "lexicon" };
    }
  } catch (cause) {
    log.error({ cause }, "lexicon fallback after final failure also failed");
  }
  log.warn({ error: message, attempts }, "enrich final failure — parked (no event to fall back on)");
  return { kind: "final-failure-parked" };
}

async function enqueueAggregate(deps: EnrichDeps, event: MentionEvent): Promise<void> {
  const job = aggregateJobSchema.parse({ accountId: event.accountId, date: utcDate(event.occurredAt) });
  await deps.enqueueAggregate(job);
}

const elapsed = (deps: EnrichDeps, startMs: number): number => Math.max(0, deps.clock().getTime() - startMs);
