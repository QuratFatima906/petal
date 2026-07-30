import { describe, expect, it, vi } from "vitest";
import { EnrichmentError, mentionEventSchema, type Enrichment, type MentionEvent } from "@petal/core";
import type { Classifier, ClassifyResult } from "@petal/ai";
import { silentLogger } from "../test-support";
import {
  aggregateJobId,
  aggregateJobSchema,
  createEnrichProcessor,
  type AggregateJob,
  type CachedClassification,
  type EnrichDeps,
  type EnrichJobLike,
  type EnrichStore,
} from "./enrich";

/** Fixed clock so latency is deterministic and never calls `new Date()`. */
const clock = () => new Date("2026-07-21T00:00:00.000Z");

const makeEvent = (text = "Love this, gorgeous design"): MentionEvent =>
  mentionEventSchema.parse({
    id: "evt-1",
    accountId: "acct-1",
    source: "own_comment",
    igObjectId: "ig-1",
    mediaId: null,
    authorUsername: "user",
    text,
    permalink: null,
    occurredAt: "2026-07-20T10:00:00.000Z",
    ingestedVia: "webhook",
    raw: {},
  });

type StoreState = {
  event: MentionEvent | null;
  cache: Map<string, CachedClassification>;
  enrichments: Enrichment[];
  setCached: { hash: string; value: CachedClassification }[];
  dailyCost: number;
  parked: { queue: string; payload: Record<string, unknown>; error: string; attempts: number }[];
};

const makeStore = (seed: Partial<StoreState> = {}): { store: EnrichStore; state: StoreState } => {
  const state: StoreState = {
    event: seed.event ?? makeEvent(),
    cache: seed.cache ?? new Map(),
    enrichments: [],
    setCached: [],
    dailyCost: seed.dailyCost ?? 0,
    parked: [],
  };
  const store: EnrichStore = {
    loadEvent: () => Promise.resolve(state.event),
    getCached: (hash) => Promise.resolve(state.cache.get(hash) ?? null),
    setCached: (hash, value) => {
      state.setCached.push({ hash, value });
      return Promise.resolve();
    },
    writeEnrichment: (e) => {
      state.enrichments.push(e);
      return Promise.resolve();
    },
    dailyCostUsd: () => Promise.resolve(state.dailyCost),
    park: (input) => {
      state.parked.push({ queue: input.queue, payload: input.payload, error: input.error, attempts: input.attempts });
      return Promise.resolve();
    },
  };
  return { store, state };
};

const llmResult = (costUsd = 0.0002): ClassifyResult => ({
  results: [{ sentiment: "positive", intent: "praise", confidence: 0.92 }],
  costUsd,
  model: "claude-haiku-4-5",
});

const stubClassifier = (classify: Classifier["classify"]): Classifier => ({ model: "claude-haiku-4-5", classify });

const makeDeps = (
  store: EnrichStore,
  classify: Classifier["classify"],
): { deps: EnrichDeps; aggregates: AggregateJob[] } => {
  const aggregates: AggregateJob[] = [];
  const deps: EnrichDeps = {
    store,
    logger: silentLogger,
    classifier: stubClassifier(classify),
    budgetUsd: 2,
    clock,
    enqueueAggregate: (job) => {
      aggregates.push(job);
      return Promise.resolve();
    },
  };
  return { deps, aggregates };
};

const job = (data: unknown, attemptsMade = 0, maxAttempts = 3): EnrichJobLike => ({
  id: "job-1",
  data,
  attemptsMade,
  maxAttempts,
});

describe("aggregate contract", () => {
  it("validates the pinned {accountId, date} shape", () => {
    expect(aggregateJobSchema.safeParse({ accountId: "a", date: "2026-07-20" }).success).toBe(true);
    expect(aggregateJobSchema.safeParse({ accountId: "a", date: "20-07-2026" }).success).toBe(false);
    expect(aggregateJobSchema.safeParse({ accountId: "", date: "2026-07-20" }).success).toBe(false);
  });

  it("derives a deterministic debounce jobId", () => {
    expect(aggregateJobId("acct-1", "2026-07-20")).toBe("aggregate:acct-1:2026-07-20");
  });
});

describe("enrich processor", () => {
  it("cache hit skips the model and enqueues aggregate with the pinned shape", async () => {
    const { store, state } = makeStore({
      cache: new Map(),
    });
    // Seed the cache under the exact hash the pipeline will compute.
    const { deps, aggregates } = makeDeps(store, vi.fn());
    // First run to discover the hash is overkill; instead seed via a pass-through:
    const cached: CachedClassification = { sentiment: "mixed", intent: "question", confidence: 0.7, model: "claude-haiku-4-5" };
    // Compute the hash the same way the pipeline does by monkey-patching getCached once.
    let seenHash = "";
    store.getCached = (hash) => {
      seenHash = hash;
      return Promise.resolve(cached);
    };

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }));

    expect(outcome.kind).toBe("cache-hit");
    expect(deps.classifier.classify).not.toHaveBeenCalled();
    expect(seenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.enrichments).toHaveLength(1);
    expect(state.enrichments[0]).toMatchObject({ sentiment: "mixed", intent: "question", method: "llm", costUsd: 0 });
    expect(aggregates).toEqual([{ accountId: "acct-1", date: "2026-07-20" }]);
  });

  it("writes an llm enrichment and caches it on a cache miss", async () => {
    const { store, state } = makeStore();
    const classify = vi.fn(async () => llmResult(0.0003));
    const { deps, aggregates } = makeDeps(store, classify);

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }));

    expect(outcome).toEqual({ kind: "llm", method: "llm" });
    expect(classify).toHaveBeenCalledTimes(1);
    expect(state.enrichments[0]).toMatchObject({ method: "llm", costUsd: 0.0003, model: "claude-haiku-4-5" });
    expect(state.setCached).toHaveLength(1);
    expect(aggregates).toHaveLength(1);
  });

  it("flips to the lexicon when the daily budget is exhausted", async () => {
    const { store, state } = makeStore({ dailyCost: 5 });
    const classify = vi.fn(async () => llmResult());
    const { deps, aggregates } = makeDeps(store, classify);

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }));

    expect(outcome.kind).toBe("budget-lexicon");
    expect(classify).not.toHaveBeenCalled();
    expect(state.enrichments[0]?.method).toBe("lexicon");
    expect(aggregates).toHaveLength(1);
  });

  it("retries malformed output once, then falls back to the lexicon", async () => {
    const { store, state } = makeStore();
    const classify = vi.fn(async () => {
      throw new EnrichmentError("malformed");
    });
    const { deps } = makeDeps(store, classify);

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }));

    expect(outcome.kind).toBe("malformed-lexicon");
    expect(classify).toHaveBeenCalledTimes(2);
    expect(state.enrichments[0]?.method).toBe("lexicon");
  });

  it("recovers when the retry after a malformed response succeeds", async () => {
    const { store, state } = makeStore();
    const classify = vi
      .fn<Classifier["classify"]>()
      .mockRejectedValueOnce(new EnrichmentError("malformed"))
      .mockResolvedValueOnce(llmResult());
    const { deps } = makeDeps(store, classify);

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }));

    expect(outcome.kind).toBe("llm");
    expect(classify).toHaveBeenCalledTimes(2);
    expect(state.enrichments[0]?.method).toBe("llm");
  });

  it("throws (retryable) on empty text before the final attempt — gives the re-hydrator time", async () => {
    const { store, state } = makeStore({ event: makeEvent("   ") });
    const classify = vi.fn(async () => llmResult());
    const { deps } = makeDeps(store, classify);

    await expect(createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }, 0, 3))).rejects.toBeInstanceOf(
      EnrichmentError,
    );
    expect(state.enrichments).toHaveLength(0);
    expect(state.parked).toHaveLength(0);
    expect(classify).not.toHaveBeenCalled();
  });

  it("writes a neutral low-confidence lexicon result on the final attempt with still-empty text", async () => {
    const { store, state } = makeStore({ event: makeEvent("   ") });
    const { deps, aggregates } = makeDeps(store, vi.fn());

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }, 2, 3));

    expect(outcome.kind).toBe("empty-lexicon");
    expect(state.enrichments[0]).toMatchObject({ sentiment: "neutral", method: "lexicon", confidence: 0.2 });
    expect(state.parked).toHaveLength(0);
    expect(aggregates).toHaveLength(1);
  });

  it("on final-attempt failure parks a dead letter AND writes a lexicon result", async () => {
    const { store, state } = makeStore();
    const classify = vi.fn(async () => {
      throw new Error("network down"); // not an EnrichmentError → bubbles up
    });
    const { deps, aggregates } = makeDeps(store, classify);

    const outcome = await createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }, 2, 3));

    expect(outcome.kind).toBe("final-failure-lexicon");
    expect(state.parked).toHaveLength(1);
    expect(state.parked[0]).toMatchObject({ queue: "enrich", payload: { mentionEventId: "evt-1" }, attempts: 3 });
    expect(state.enrichments[0]?.method).toBe("lexicon");
    expect(aggregates).toHaveLength(1);
  });

  it("rethrows on a non-final failure so BullMQ retries", async () => {
    const { store } = makeStore();
    const classify = vi.fn(async () => {
      throw new Error("transient");
    });
    const { deps } = makeDeps(store, classify);

    await expect(createEnrichProcessor(deps)(job({ mentionEventId: "evt-1" }, 0, 3))).rejects.toThrow("transient");
  });

  it("parks a malformed payload on the final attempt", async () => {
    const { store, state } = makeStore();
    const { deps } = makeDeps(store, vi.fn());

    const outcome = await createEnrichProcessor(deps)(job({ wrong: "shape" }, 2, 3));

    expect(outcome.kind).toBe("bad-payload-parked");
    expect(state.parked).toHaveLength(1);
    expect(state.enrichments).toHaveLength(0);
  });
});
