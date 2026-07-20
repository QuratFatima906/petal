import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  hashtagRecentMediaShape,
  mediaCommentsShape,
  mentionedCommentShape,
  ownMediaListShape,
  taggedMediaShape,
} from "@petal/fixtures";
import { igUserId } from "@petal/core";
import {
  GRAPH_API_VERSION,
  GRAPH_BASE_URL,
  createCircuitBreaker,
  createIgClient,
  createTokenBucket,
  type IgClientConfig,
} from "@petal/ig";
import { ingestPayloadSchema, type IngestJobPayload } from "../ingest-contract";
import { makeMemoryStore, silentLogger } from "../test-support";
import { pollHashtags, pollMentionsAndTags, pollOwnComments, type PollDeps } from "./poll";

const USER_ID = "17841400000000000";
const BASE = `${GRAPH_BASE_URL}/${GRAPH_API_VERSION}`;
const NOW = new Date("2026-07-18T20:00:00.000Z");

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const makeIg = (overrides: Partial<IgClientConfig> = {}) =>
  createIgClient({
    accessToken: "test-token",
    igUserId: igUserId(USER_ID),
    sleep: () => Promise.resolve(),
    backoff: { baseMs: 1, random: () => 0 },
    bucBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
    platformBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
    ...overrides,
  });

type Captured = { payloads: IngestJobPayload[] };

const makeDeps = (
  overrides: Partial<PollDeps> = {},
): { deps: PollDeps; captured: Captured; state: ReturnType<typeof makeMemoryStore>["state"] } => {
  const captured: Captured = { payloads: [] };
  const { store, state } = makeMemoryStore();
  const deps: PollDeps = {
    ig: makeIg(),
    igUserId: USER_ID,
    store,
    clock: () => NOW,
    logger: silentLogger,
    enqueueIngest: (payload) => {
      captured.payloads.push(payload);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, captured, state };
};

describe("pollOwnComments", () => {
  it("enqueues one validated ingest job per new comment and reply, with media context", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => HttpResponse.json(ownMediaListShape)),
      http.get(`${BASE}/17900000000000001/comments`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        return HttpResponse.json(after === null ? mediaCommentsShape : { data: [] });
      }),
    );
    const { deps, captured } = makeDeps();
    const stats = await pollOwnComments(deps);

    expect(stats.aborted).toBeUndefined();
    expect(stats.enqueued).toBe(2); // the comment + its embedded reply
    for (const p of captured.payloads) {
      expect(() => ingestPayloadSchema.parse(p)).not.toThrow();
      expect(p.lane).toBe("poll");
      expect(p.accountId).toBe(USER_ID);
      expect(p.payload.kind).toBe("poll_item");
      if (p.payload.kind !== "poll_item") continue;
      expect(p.payload.source).toBe("own_comment");
      const item = p.payload.item as { media?: { id?: string } };
      expect(item.media?.id).toBe("17900000000000001");
    }
  });

  it("advances the watermark: stops at the first already-seen comment id and fetches no further pages", async () => {
    let secondPageHits = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => HttpResponse.json(ownMediaListShape)),
      http.get(`${BASE}/17900000000000001/comments`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        if (after !== null) {
          secondPageHits++;
          return HttpResponse.json({ data: [] });
        }
        return HttpResponse.json({
          data: [
            { id: "c-new", text: "newest", timestamp: "2026-07-18T19:00:00+0000" },
            { id: "c-known", text: "already seen", timestamp: "2026-07-18T10:00:00+0000" },
            { id: "c-older-new", text: "never reached", timestamp: "2026-07-18T09:00:00+0000" },
          ],
          paging: { cursors: { after: "PAGE2" } },
        });
      }),
    );
    const { deps, captured, state } = makeDeps();
    state.known.set("own_comment", new Set(["c-known"]));

    const stats = await pollOwnComments(deps);

    expect(stats.enqueued).toBe(1);
    expect(captured.payloads).toHaveLength(1);
    const only = captured.payloads[0];
    expect(only?.payload.kind === "poll_item" && (only.payload.item as { id: string }).id).toBe("c-new");
    expect(secondPageHits).toBe(0);
  });

  it("aborts the cycle when the client-side rate budget is exhausted", async () => {
    let requests = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        requests++;
        return HttpResponse.json(ownMediaListShape);
      }),
      http.get(`${BASE}/17900000000000001/comments`, () => {
        requests++;
        return HttpResponse.json(mediaCommentsShape);
      }),
    );
    const { deps, captured } = makeDeps({
      ig: makeIg({ bucBucket: createTokenBucket({ capacity: 1, refillIntervalMs: 3_600_000 }) }),
    });

    const stats = await pollOwnComments(deps);

    expect(requests).toBe(1); // media list spent the only token; comments never hit the network
    expect(stats.aborted).toBe("RateLimitError");
    expect(captured.payloads).toHaveLength(0);
  });

  it("makes zero requests while the circuit breaker is open", async () => {
    let requests = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        requests++;
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const breaker = createCircuitBreaker({ failureThreshold: 1, clock: () => NOW });
    breaker.recordFailure(); // open
    const { deps } = makeDeps({ ig: makeIg({ breaker }) });

    const stats = await pollOwnComments(deps);

    expect(requests).toBe(0);
    expect(stats.aborted).toBe("RateLimitError");
  });
});

describe("pollMentionsAndTags", () => {
  it("re-hydrates known mention ids and enqueues tagged media as caption mentions", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}`, ({ request }) => {
        const fields = new URL(request.url).searchParams.get("fields") ?? "";
        expect(fields).toContain("mentioned_comment.comment_id(17800000000000301)");
        return HttpResponse.json(mentionedCommentShape);
      }),
      http.get(`${BASE}/${USER_ID}/tags`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        return HttpResponse.json(after === null ? taggedMediaShape : { data: [] });
      }),
    );
    const { deps, captured, state } = makeDeps();
    state.commentMentionIds.push("17800000000000301");

    const stats = await pollMentionsAndTags(deps);

    expect(stats.aborted).toBeUndefined();
    expect(stats.enqueued).toBe(2);
    const sources = captured.payloads.map((p) => (p.payload.kind === "poll_item" ? p.payload.source : "?"));
    expect(sources.sort()).toEqual(["caption_mention", "comment_mention"]);
  });

  it("mirrors deletions: a re-fetch that 404s removes the mirrored row", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}`, () =>
        HttpResponse.json(
          { error: { message: "Unsupported get request.", type: "GraphMethodException", code: 100 } },
          { status: 404 },
        ),
      ),
      http.get(`${BASE}/${USER_ID}/tags`, () => HttpResponse.json({ data: [] })),
    );
    const { deps, captured, state } = makeDeps();
    state.captionMentionMediaIds.push("gone-media-id");

    const stats = await pollMentionsAndTags(deps);

    expect(stats.deleted).toBe(1);
    expect(state.deletions).toEqual([{ source: "caption_mention", ids: ["gone-media-id"] }]);
    expect(captured.payloads).toHaveLength(0);
  });

  it("stops the cycle on a rate limit instead of hammering the API", async () => {
    const { deps, captured, state } = makeDeps({
      ig: makeIg({ bucBucket: createTokenBucket({ capacity: 0, refillIntervalMs: 3_600_000 }) }),
    });
    state.captionMentionMediaIds.push("m-1", "m-2");

    const stats = await pollMentionsAndTags(deps);

    expect(stats.aborted).toBe("RateLimitError");
    expect(captured.payloads).toHaveLength(0);
  });
});

describe("pollHashtags", () => {
  it("polls active hashtags within the 24h recency window and marks them polled", async () => {
    server.use(
      http.get(`${BASE}/17841500000000001/recent_media`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        return HttpResponse.json(after === null ? hashtagRecentMediaShape : { data: [] });
      }),
    );
    const { deps, captured, state } = makeDeps();
    state.hashtags.push({ id: "17841500000000001", name: "omahi" });

    const stats = await pollHashtags(deps);

    expect(stats.enqueued).toBe(1);
    expect(captured.payloads[0]?.payload.kind === "poll_item" && captured.payloads[0].payload.source).toBe(
      "hashtag_media",
    );
    expect(state.polledHashtags).toEqual([{ id: "17841500000000001", at: NOW }]);
  });

  it("filters out media older than the 24h window", async () => {
    server.use(
      http.get(`${BASE}/17841500000000001/recent_media`, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after");
        return HttpResponse.json(
          after === null
            ? {
                data: [
                  { id: "fresh", caption: "in window", timestamp: "2026-07-18T10:00:00+0000" },
                  { id: "stale", caption: "out of window", timestamp: "2026-07-16T10:00:00+0000" },
                ],
              }
            : { data: [] },
        );
      }),
    );
    const { deps, captured, state } = makeDeps();
    state.hashtags.push({ id: "17841500000000001", name: "omahi" });

    const stats = await pollHashtags(deps);

    expect(stats.enqueued).toBe(1);
    const item = captured.payloads[0]?.payload.kind === "poll_item" ? captured.payloads[0].payload.item : undefined;
    expect((item as { id: string }).id).toBe("fresh");
  });
});
