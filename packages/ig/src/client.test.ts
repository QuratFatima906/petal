import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  accountDemographicsShape,
  accountInsightsShape,
  businessDiscoveryShape,
  commentRepliesShape,
  graphAuthErrorShape,
  graphRateLimitErrorShape,
  hashtagRecentMediaShape,
  hashtagSearchShape,
  longLivedTokenShape,
  mediaCommentsShape,
  mediaInsightsShape,
  mentionedCommentShape,
  mentionedMediaShape,
  ownMediaListShape,
  pageIgAccountShape,
  taggedMediaShape,
} from "@petal/fixtures";
import {
  IgApiError,
  IgAuthError,
  igCommentId,
  igHashtagId,
  igMediaId,
  igUserId,
  RateLimitError,
  ValidationError,
} from "@petal/core";
import { createIgClient, type IgClientConfig } from "./client";
import { createCircuitBreaker } from "./circuit-breaker";
import { createTokenBucket } from "./rate-limiter";
import { GRAPH_API_VERSION, GRAPH_BASE_URL } from "./constants";

const USER_ID = igUserId("17841400000000000");
const BASE = `${GRAPH_BASE_URL}/${GRAPH_API_VERSION}`;

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

const instantSleep = () => Promise.resolve();

const makeClient = (overrides: Partial<IgClientConfig> = {}) =>
  createIgClient({
    accessToken: "test-user-token",
    igUserId: USER_ID,
    sleep: instantSleep,
    backoff: { baseMs: 1, random: () => 0 },
    bucBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
    platformBucket: createTokenBucket({ capacity: 1000, refillIntervalMs: 1 }),
    ...overrides,
  });

describe("owned lane endpoints", () => {
  it("lists own media, parsing the recorded shape and exposing the after cursor", async () => {
    let seenUrl = "";
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const result = await makeClient().listOwnMedia();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]?.id).toBe("17900000000000001");
    expect(result.value.items[0]?.caption).toContain("Omahi");
    expect(result.value.after).toBe("QVFIU...after");
    const url = new URL(seenUrl);
    expect(url.searchParams.get("access_token")).toBe("test-user-token");
    expect(url.searchParams.get("fields")).toContain("comments_count");
  });

  it("lists comments on own media with nested replies", async () => {
    server.use(
      http.get(`${BASE}/17900000000000001/comments`, () => HttpResponse.json(mediaCommentsShape)),
    );
    const result = await makeClient().listMediaComments(igMediaId("17900000000000001"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const comment = result.value.items[0];
    expect(comment?.text).toBe("Love that everything stays on my device.");
    expect(comment?.replies?.data[0]?.username).toBe("tabgarden");
  });

  it("lists replies for a single comment", async () => {
    server.use(
      http.get(`${BASE}/17800000000000101/replies`, () => HttpResponse.json(commentRepliesShape)),
    );
    const result = await makeClient().listCommentReplies(igCommentId("17800000000000101"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.text).toBe("Same! Sold me instantly.");
  });

  it("hydrates a mentioned media via per-ID field expansion, not a list edge", async () => {
    let fields = "";
    server.use(
      http.get(`${BASE}/${USER_ID}`, ({ request }) => {
        fields = new URL(request.url).searchParams.get("fields") ?? "";
        return HttpResponse.json(mentionedMediaShape);
      }),
    );
    const result = await makeClient().getMentionedMedia(igMediaId("17900000000000201"));
    expect(fields).toContain("mentioned_media.media_id(17900000000000201){");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caption).toContain("@omahi.app");
  });

  it("hydrates a mentioned comment via per-ID field expansion", async () => {
    let fields = "";
    server.use(
      http.get(`${BASE}/${USER_ID}`, ({ request }) => {
        fields = new URL(request.url).searchParams.get("fields") ?? "";
        return HttpResponse.json(mentionedCommentShape);
      }),
    );
    const result = await makeClient().getMentionedComment(igCommentId("17800000000000301"));
    expect(fields).toContain("mentioned_comment.comment_id(17800000000000301){");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.media?.id).toBe("17900000000000301");
  });

  it("lists tagged media with cursor-only pagination", async () => {
    server.use(http.get(`${BASE}/${USER_ID}/tags`, () => HttpResponse.json(taggedMediaShape)));
    const result = await makeClient().listTaggedMedia();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.username).toBe("desk.rituals");
    expect(result.value.after).toBe("TAG...a");
  });

  it("fetches per-media insights using views, never impressions", async () => {
    let metric = "";
    server.use(
      http.get(`${BASE}/17900000000000001/insights`, ({ request }) => {
        metric = new URL(request.url).searchParams.get("metric") ?? "";
        return HttpResponse.json(mediaInsightsShape);
      }),
    );
    const result = await makeClient().getMediaInsights(igMediaId("17900000000000001"));
    expect(metric).toContain("views");
    expect(metric).not.toContain("impressions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.values?.[0]?.value).toBe(1284);
  });

  it("fetches account insights as total_value metrics", async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/${USER_ID}/insights`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(accountInsightsShape);
      }),
    );
    const result = await makeClient().getAccountInsights();
    expect(params?.get("metric_type")).toBe("total_value");
    expect(params?.get("metric")).not.toContain("impressions");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.total_value?.value).toBe(340);
  });

  it("fetches demographics via follower_demographics with a breakdown", async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/${USER_ID}/insights`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(accountDemographicsShape);
      }),
    );
    const result = await makeClient().getAccountDemographics({ breakdown: "age" });
    expect(params?.get("metric")).toBe("follower_demographics");
    expect(params?.get("breakdown")).toBe("age");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const breakdown = result.value[0]?.total_value?.breakdowns?.[0];
    expect(breakdown?.results[1]?.value).toBe(480);
  });
});

describe("public lane and auxiliary endpoints", () => {
  it("resolves a hashtag id via ig_hashtag_search", async () => {
    server.use(http.get(`${BASE}/ig_hashtag_search`, () => HttpResponse.json(hashtagSearchShape)));
    const result = await makeClient().searchHashtag("omahi");
    expect(result).toEqual({ ok: true, value: "17841500000000001" });
  });

  it("returns a typed error when hashtag search comes back empty", async () => {
    server.use(http.get(`${BASE}/ig_hashtag_search`, () => HttpResponse.json({ data: [] })));
    const result = await makeClient().searchHashtag("nonexistent");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgApiError);
  });

  it("lists recent hashtag media without requesting username (L6)", async () => {
    let fields = "";
    server.use(
      http.get(`${BASE}/17841500000000001/recent_media`, ({ request }) => {
        fields = new URL(request.url).searchParams.get("fields") ?? "";
        return HttpResponse.json(hashtagRecentMediaShape);
      }),
    );
    const result = await makeClient().listHashtagRecentMedia(igHashtagId("17841500000000001"));
    expect(fields).not.toContain("username");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]?.username).toBeUndefined();
  });

  it("fetches a business discovery snapshot", async () => {
    server.use(http.get(`${BASE}/${USER_ID}`, () => HttpResponse.json(businessDiscoveryShape)));
    const result = await makeClient().getBusinessDiscovery("cyclebuddy.app");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.followers_count).toBe(15400);
    expect(result.value.media?.data[0]?.caption).toBe("Big v3 launch day!");
  });

  it("exchanges a still-valid long-lived token without attaching access_token", async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(`${BASE}/oauth/access_token`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(longLivedTokenShape);
      }),
    );
    const result = await makeClient().exchangeLongLivedToken({
      appId: "app-id",
      appSecret: "app-secret",
      token: "current-token",
    });
    expect(params?.get("grant_type")).toBe("fb_exchange_token");
    expect(params?.get("fb_exchange_token")).toBe("current-token");
    expect(params?.get("access_token")).toBeNull();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expires_in).toBe(5183944);
  });

  it("resolves the IG business account id from a page", async () => {
    server.use(http.get(`${BASE}/112233445566778`, () => HttpResponse.json(pageIgAccountShape)));
    const result = await makeClient().getIgBusinessAccountId("112233445566778");
    expect(result).toEqual({ ok: true, value: "17841400000000000" });
  });

  it("returns a typed error when a page has no linked IG account", async () => {
    server.use(http.get(`${BASE}/112233445566778`, () => HttpResponse.json({ id: "112233445566778" })));
    const result = await makeClient().getIgBusinessAccountId("112233445566778");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgApiError);
  });
});

describe("failure handling", () => {
  it("returns a typed ValidationError on a malformed response, not a crash", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => HttpResponse.json({ data: [{ id: 12345 }] })),
    );
    const result = await makeClient().listOwnMedia();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    if (result.error instanceof ValidationError) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("retries a 429 honoring Retry-After, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json(graphRateLimitErrorShape, {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const result = await makeClient().listOwnMedia();
    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
  });

  it("surfaces RateLimitError carrying retryAfterMs when 429s persist", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () =>
        HttpResponse.json(graphRateLimitErrorShape, {
          status: 429,
          headers: { "Retry-After": "7" },
        }),
      ),
    );
    const result = await makeClient().listOwnMedia();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(RateLimitError);
    if (result.error instanceof RateLimitError) {
      expect(result.error.retryAfterMs).toBe(7000);
    }
  });

  it("treats Graph code 4 with HTTP 400 as rate limiting too", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () =>
        HttpResponse.json(graphRateLimitErrorShape, { status: 400 }),
      ),
    );
    const result = await makeClient().listOwnMedia();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(RateLimitError);
  });

  it("maps an expired token (code 190) to IgAuthError without retrying", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        calls++;
        return HttpResponse.json(graphAuthErrorShape, { status: 401 });
      }),
    );
    const result = await makeClient().listOwnMedia();
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgAuthError);
  });

  it("retries 5xx and succeeds within the attempt budget", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        calls++;
        if (calls < 3) return HttpResponse.json({ error: { message: "oops" } }, { status: 500 });
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const result = await makeClient().listOwnMedia();
    expect(calls).toBe(3);
    expect(result.ok).toBe(true);
  });

  it("returns IgApiError with status after exhausting retries on 5xx", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () =>
        HttpResponse.json({ error: { message: "down" } }, { status: 503 }),
      ),
    );
    const result = await makeClient().listOwnMedia();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgApiError);
    if (result.error instanceof IgApiError) {
      expect(result.error.status).toBe(503);
    }
  });

  it("times out slow responses via the default AbortSignal plumbing", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, async () => {
        await delay(500);
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const client = makeClient({ timeoutMs: 25, maxAttempts: 2 });
    const result = await client.listOwnMedia();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgApiError);
  });

  it("respects a caller-provided AbortSignal", async () => {
    server.use(http.get(`${BASE}/${USER_ID}/media`, () => HttpResponse.json(ownMediaListShape)));
    const controller = new AbortController();
    controller.abort();
    const result = await makeClient().listOwnMedia({ signal: controller.signal });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(IgApiError);
    expect(result.error.message).toContain("aborted by caller");
  });
});

describe("rate limiter and breaker integration", () => {
  it("denies without any network call when the BUC bucket is empty", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        calls++;
        return HttpResponse.json(ownMediaListShape);
      }),
    );
    const client = makeClient({
      bucBucket: createTokenBucket({ capacity: 0, refillIntervalMs: 60_000, clock: () => new Date(0) }),
    });
    const result = await client.listOwnMedia();
    expect(calls).toBe(0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(RateLimitError);
  });

  it("business discovery draws from the Platform bucket, not the BUC bucket", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}`, () => {
        calls++;
        return HttpResponse.json(businessDiscoveryShape);
      }),
    );
    const client = makeClient({
      platformBucket: createTokenBucket({ capacity: 0, refillIntervalMs: 60_000, clock: () => new Date(0) }),
    });
    // Platform-limited call is denied client-side...
    const discovery = await client.getBusinessDiscovery("cyclebuddy.app");
    expect(discovery.ok).toBe(false);
    expect(calls).toBe(0);
    // ...while BUC-limited calls still flow.
    server.use(http.get(`${BASE}/${USER_ID}/tags`, () => HttpResponse.json(taggedMediaShape)));
    const tags = await client.listTaggedMedia();
    expect(tags.ok).toBe(true);
  });

  it("hashtag search draws from the Platform bucket", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/ig_hashtag_search`, () => {
        calls++;
        return HttpResponse.json(hashtagSearchShape);
      }),
    );
    const client = makeClient({
      platformBucket: createTokenBucket({ capacity: 0, refillIntervalMs: 60_000, clock: () => new Date(0) }),
    });
    const result = await client.searchHashtag("omahi");
    expect(calls).toBe(0);
    expect(result.ok).toBe(false);
  });

  it("opens the breaker after consecutive failures and reports state", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () => {
        calls++;
        return HttpResponse.json({ error: { message: "down" } }, { status: 500 });
      }),
    );
    const client = makeClient({
      maxAttempts: 1,
      breaker: createCircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 }),
    });
    expect(client.breakerState()).toBe("closed");
    await client.listOwnMedia();
    await client.listOwnMedia();
    expect(client.breakerState()).toBe("open");
    // Circuit open: no further network traffic, callers get a retryable error.
    const result = await client.listOwnMedia();
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(RateLimitError);
    expect(result.error.message).toContain("circuit breaker open");
  });

  it("captures Meta usage headers for adaptive throttling", async () => {
    server.use(
      http.get(`${BASE}/${USER_ID}/media`, () =>
        HttpResponse.json(ownMediaListShape, {
          headers: { "X-App-Usage": '{"call_count":11}' },
        }),
      ),
    );
    const client = makeClient();
    await client.listOwnMedia();
    expect(client.usage().appUsage).toBe('{"call_count":11}');
  });
});
