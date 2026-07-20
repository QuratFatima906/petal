import { type z } from "zod";
import {
  err,
  IgApiError,
  IgAuthError,
  ok,
  RateLimitError,
  ValidationError,
  type IgCommentId,
  type IgHashtagId,
  type IgMediaId,
  type IgUserId,
  type Result,
} from "@petal/core";
import { backoffDelayMs, type BackoffConfig } from "./backoff";
import { type Clock, systemClock } from "./clock";
import { createCircuitBreaker, type BreakerState, type CircuitBreaker } from "./circuit-breaker";
import {
  AUTH_ERROR_CODES,
  BUC_BUCKET_DEFAULTS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  GRAPH_API_VERSION,
  GRAPH_BASE_URL,
  PLATFORM_BUCKET_DEFAULTS,
  RATE_LIMIT_ERROR_CODES,
} from "./constants";
import { type Page } from "./pagination";
import { createTokenBucket, type TokenBucket } from "./rate-limiter";
import {
  businessDiscoverySchema,
  commentListSchema,
  graphErrorEnvelopeSchema,
  hashtagSearchSchema,
  insightsSchema,
  longLivedTokenSchema,
  mediaListSchema,
  mentionedCommentSchema,
  mentionedMediaSchema,
  pageIgAccountSchema,
  replyListSchema,
  type IgBusinessDiscovery,
  type IgComment,
  type IgInsightMetric,
  type IgLongLivedToken,
  type IgMediaItem,
  type IgMentionedComment,
  type IgMentionedMedia,
  type IgReply,
} from "./schemas";

/** Every expected failure of a client call; unexpected failures still throw (plan §5.3). */
export type IgClientError = RateLimitError | IgAuthError | IgApiError | ValidationError;

export type IgClientConfig = {
  /** Long-lived Facebook **User** access token — not a Page token (verify doc §8). */
  readonly accessToken: string;
  /** The connected IG professional account, resolved via `/{page-id}?fields=instagram_business_account`. */
  readonly igUserId: IgUserId;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly fetchImpl?: typeof fetch;
  readonly clock?: Clock;
  /** Injected so tests can skip real waiting between retries. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly backoff?: BackoffConfig;
  /** BUC-class bucket: media, comments, mentions hydration, tags, insights (plan §13). */
  readonly bucBucket?: TokenBucket;
  /** Platform-class bucket: business discovery + hashtag search only (plan §13). */
  readonly platformBucket?: TokenBucket;
  readonly breaker?: CircuitBreaker;
};

export type RequestOptions = {
  readonly signal?: AbortSignal;
};

export type ListOptions = RequestOptions & {
  readonly after?: string;
  readonly limit?: number;
};

/** Raw usage headers Meta returns for adaptive throttling (plan §13). */
export type UsageSnapshot = {
  readonly appUsage?: string;
  readonly businessUseCaseUsage?: string;
};

const MEDIA_FIELDS = "id,caption,media_type,permalink,timestamp,like_count,comments_count,username";
const COMMENT_FIELDS = "id,text,username,timestamp,like_count";
const COMMENT_WITH_REPLIES_FIELDS = `${COMMENT_FIELDS},replies{${COMMENT_FIELDS}}`;
const MENTIONED_MEDIA_FIELDS = "id,caption,media_type,timestamp,like_count,comments_count";
const MENTIONED_COMMENT_FIELDS = "id,text,timestamp,like_count,media{id}";
const BUSINESS_DISCOVERY_FIELDS =
  "id,username,followers_count,media_count,biography,website," +
  "media{id,caption,media_type,timestamp,like_count,comments_count}";
/** Hashtag edges cannot return `username` (plan L6) — do not request it. */
const HASHTAG_MEDIA_FIELDS = "id,caption,media_type,permalink,timestamp";
/** `views`, not `impressions` — deprecated/removed (verify doc §4). */
const DEFAULT_MEDIA_INSIGHT_METRICS = "views,reach,likes,comments,shares,saved,total_interactions";
const DEFAULT_ACCOUNT_INSIGHT_METRICS = "views,reach,accounts_engaged,total_interactions";

const listPage = <T>(items: readonly T[], after: string | undefined): Page<T> =>
  after === undefined ? { items } : { items, after };

const afterCursor = (
  paging: { cursors?: { after?: string | undefined } | undefined } | undefined,
): string | undefined => paging?.cursors?.after;

const retryAfterMsFromHeader = (res: Response): number | undefined => {
  const header = res.headers.get("retry-after");
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
};

export type IgClient = {
  readonly listOwnMedia: (options?: ListOptions) => Promise<Result<Page<IgMediaItem>, IgClientError>>;
  readonly listMediaComments: (
    mediaId: IgMediaId,
    options?: ListOptions,
  ) => Promise<Result<Page<IgComment>, IgClientError>>;
  readonly listCommentReplies: (
    commentId: IgCommentId,
    options?: ListOptions,
  ) => Promise<Result<Page<IgReply>, IgClientError>>;
  readonly getMentionedMedia: (
    mediaId: IgMediaId,
    options?: RequestOptions,
  ) => Promise<Result<IgMentionedMedia["mentioned_media"], IgClientError>>;
  readonly getMentionedComment: (
    commentId: IgCommentId,
    options?: RequestOptions,
  ) => Promise<Result<IgMentionedComment["mentioned_comment"], IgClientError>>;
  readonly listTaggedMedia: (options?: ListOptions) => Promise<Result<Page<IgMediaItem>, IgClientError>>;
  readonly getBusinessDiscovery: (
    username: string,
    options?: RequestOptions,
  ) => Promise<Result<IgBusinessDiscovery["business_discovery"], IgClientError>>;
  readonly getMediaInsights: (
    mediaId: IgMediaId,
    options?: RequestOptions & { readonly metrics?: string },
  ) => Promise<Result<readonly IgInsightMetric[], IgClientError>>;
  readonly getAccountInsights: (
    options?: RequestOptions & { readonly metrics?: string; readonly period?: string },
  ) => Promise<Result<readonly IgInsightMetric[], IgClientError>>;
  readonly getAccountDemographics: (
    options?: RequestOptions & {
      readonly metric?: "follower_demographics" | "engaged_audience_demographics";
      readonly breakdown?: string;
      readonly timeframe?: string;
    },
  ) => Promise<Result<readonly IgInsightMetric[], IgClientError>>;
  readonly searchHashtag: (query: string, options?: RequestOptions) => Promise<Result<IgHashtagId, IgClientError>>;
  readonly listHashtagRecentMedia: (
    hashtagId: IgHashtagId,
    options?: ListOptions,
  ) => Promise<Result<Page<IgMediaItem>, IgClientError>>;
  readonly exchangeLongLivedToken: (
    params: { readonly appId: string; readonly appSecret: string; readonly token: string },
    options?: RequestOptions,
  ) => Promise<Result<IgLongLivedToken, IgClientError>>;
  readonly getIgBusinessAccountId: (
    pageId: string,
    options?: RequestOptions,
  ) => Promise<Result<IgUserId, IgClientError>>;
  readonly breakerState: () => BreakerState;
  readonly usage: () => UsageSnapshot;
};

export const createIgClient = (config: IgClientConfig): IgClient => {
  const baseUrl = config.baseUrl ?? GRAPH_BASE_URL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const fetchImpl = config.fetchImpl ?? fetch;
  const clock = config.clock ?? systemClock;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const bucBucket = config.bucBucket ?? createTokenBucket({ ...BUC_BUCKET_DEFAULTS, clock });
  const platformBucket = config.platformBucket ?? createTokenBucket({ ...PLATFORM_BUCKET_DEFAULTS, clock });
  const breaker = config.breaker ?? createCircuitBreaker({ clock });

  let lastUsage: UsageSnapshot = {};

  const buildUrl = (path: string, params: Readonly<Record<string, string>>, includeToken: boolean): string => {
    const url = new URL(`${baseUrl}/${GRAPH_API_VERSION}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (includeToken) url.searchParams.set("access_token", config.accessToken);
    return url.toString();
  };

  const recordUsage = (res: Response): void => {
    const appUsage = res.headers.get("x-app-usage");
    const businessUseCaseUsage = res.headers.get("x-business-use-case-usage");
    lastUsage = {
      ...(appUsage === null ? {} : { appUsage }),
      ...(businessUseCaseUsage === null ? {} : { businessUseCaseUsage }),
    };
  };

  const request = async <S extends z.ZodType>(
    schema: S,
    path: string,
    params: Readonly<Record<string, string>>,
    bucket: TokenBucket,
    options: RequestOptions & { readonly includeToken?: boolean } = {},
  ): Promise<Result<z.output<S>, IgClientError>> => {
    // Bucket before breaker: a budget denial must not consume the half-open
    // probe slot. Once the breaker gate is acquired, every terminal path below
    // records an outcome so a probe can never be left dangling.
    const taken = bucket.take();
    if (!taken.ok) {
      // Client-side budget exhausted — surfaced as the same retryable class the
      // platform would use, so callers have one backoff path (plan §13).
      return err(new RateLimitError("client-side rate budget exhausted", taken.retryAfterMs));
    }
    const gate = breaker.tryAcquire();
    if (!gate.ok) {
      return err(new RateLimitError("circuit breaker open; retry after cooldown", gate.retryAfterMs));
    }

    const url = buildUrl(path, params, options.includeToken ?? true);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      try {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
        res = await fetchImpl(url, { signal });
      } catch (cause) {
        if (options.signal?.aborted === true) {
          // Conservative: counts as a failure so a canceled half-open probe
          // re-opens the circuit instead of leaving it undecided.
          breaker.recordFailure();
          return err(new IgApiError(`request to ${path} aborted by caller`, 0));
        }
        breaker.recordFailure();
        if (attempt + 1 >= maxAttempts) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          return err(new IgApiError(`network failure calling ${path}: ${detail}`, 0));
        }
        await sleep(backoffDelayMs(attempt, config.backoff));
        continue;
      }

      recordUsage(res);

      if (res.ok) {
        const json: unknown = await res.json().catch(() => undefined);
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          // The service answered — healthy for breaker purposes. A malformed
          // API response is an expected failure, never a crash.
          breaker.recordSuccess();
          return err(
            new ValidationError(
              `malformed Graph response from ${path}`,
              parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            ),
          );
        }
        breaker.recordSuccess();
        return ok(parsed.data);
      }

      const body: unknown = await res.json().catch(() => undefined);
      const envelope = graphErrorEnvelopeSchema.safeParse(body);
      const igCode = envelope.success ? envelope.data.error.code : undefined;
      const message = (envelope.success ? envelope.data.error.message : undefined) ?? `Graph API ${res.status}`;

      if (res.status === 429 || (igCode !== undefined && RATE_LIMIT_ERROR_CODES.includes(igCode))) {
        const retryAfterMs = retryAfterMsFromHeader(res);
        // Throttling is budget pressure, not service failure — the limiter and
        // backoff own it; the breaker only counts real failures.
        if (attempt + 1 >= maxAttempts) {
          breaker.recordSuccess();
          return err(
            new RateLimitError(message, retryAfterMs ?? backoffDelayMs(attempt, config.backoff)),
          );
        }
        await sleep(backoffDelayMs(attempt, config.backoff, retryAfterMs));
        continue;
      }

      if (igCode !== undefined && AUTH_ERROR_CODES.includes(igCode)) {
        // Expired/invalid token: not retryable, flip account to token_expired
        // upstream. The service is up, so the breaker stays closed.
        breaker.recordSuccess();
        return err(new IgAuthError(message));
      }

      if (res.status >= 500) {
        breaker.recordFailure();
        if (attempt + 1 >= maxAttempts) {
          return err(igCode === undefined ? new IgApiError(message, res.status) : new IgApiError(message, res.status, igCode));
        }
        await sleep(backoffDelayMs(attempt, config.backoff));
        continue;
      }

      // Any other 4xx: the service answered; not retryable.
      breaker.recordSuccess();
      return err(igCode === undefined ? new IgApiError(message, res.status) : new IgApiError(message, res.status, igCode));
    }

    // The loop always returns; this is unreachable by construction.
    return err(new IgApiError(`retry loop exhausted for ${path}`, 0));
  };

  const listParams = (fields: string, options: ListOptions): Record<string, string> => ({
    fields,
    ...(options.after === undefined ? {} : { after: options.after }),
    ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
  });

  return {
    listOwnMedia: async (options = {}) => {
      const res = await request(mediaListSchema, `/${config.igUserId}/media`, listParams(MEDIA_FIELDS, options), bucBucket, options);
      return res.ok ? ok(listPage(res.value.data, afterCursor(res.value.paging))) : res;
    },

    listMediaComments: async (mediaId, options = {}) => {
      const res = await request(
        commentListSchema,
        `/${mediaId}/comments`,
        listParams(COMMENT_WITH_REPLIES_FIELDS, options),
        bucBucket,
        options,
      );
      return res.ok ? ok(listPage(res.value.data, afterCursor(res.value.paging))) : res;
    },

    listCommentReplies: async (commentId, options = {}) => {
      const res = await request(
        replyListSchema,
        `/${commentId}/replies`,
        listParams(COMMENT_FIELDS, options),
        bucBucket,
        options,
      );
      return res.ok ? ok(listPage(res.value.data, afterCursor(res.value.paging))) : res;
    },

    getMentionedMedia: async (mediaId, options = {}) => {
      // Per-ID field expansion on /{ig-user-id} — hydration only, never a list
      // edge; the media id must already be known from a `mentions` webhook (L11).
      const res = await request(
        mentionedMediaSchema,
        `/${config.igUserId}`,
        { fields: `mentioned_media.media_id(${mediaId}){${MENTIONED_MEDIA_FIELDS}}` },
        bucBucket,
        options,
      );
      return res.ok ? ok(res.value.mentioned_media) : res;
    },

    getMentionedComment: async (commentId, options = {}) => {
      const res = await request(
        mentionedCommentSchema,
        `/${config.igUserId}`,
        { fields: `mentioned_comment.comment_id(${commentId}){${MENTIONED_COMMENT_FIELDS}}` },
        bucBucket,
        options,
      );
      return res.ok ? ok(res.value.mentioned_comment) : res;
    },

    listTaggedMedia: async (options = {}) => {
      const res = await request(mediaListSchema, `/${config.igUserId}/tags`, listParams(MEDIA_FIELDS, options), bucBucket, options);
      return res.ok ? ok(listPage(res.value.data, afterCursor(res.value.paging))) : res;
    },

    getBusinessDiscovery: async (username, options = {}) => {
      const res = await request(
        businessDiscoverySchema,
        `/${config.igUserId}`,
        { fields: `business_discovery.username(${username}){${BUSINESS_DISCOVERY_FIELDS}}` },
        platformBucket,
        options,
      );
      return res.ok ? ok(res.value.business_discovery) : res;
    },

    getMediaInsights: async (mediaId, options = {}) => {
      const res = await request(
        insightsSchema,
        `/${mediaId}/insights`,
        { metric: options.metrics ?? DEFAULT_MEDIA_INSIGHT_METRICS },
        bucBucket,
        options,
      );
      return res.ok ? ok(res.value.data) : res;
    },

    getAccountInsights: async (options = {}) => {
      const res = await request(
        insightsSchema,
        `/${config.igUserId}/insights`,
        {
          metric: options.metrics ?? DEFAULT_ACCOUNT_INSIGHT_METRICS,
          period: options.period ?? "day",
          metric_type: "total_value",
        },
        bucBucket,
        options,
      );
      return res.ok ? ok(res.value.data) : res;
    },

    getAccountDemographics: async (options = {}) => {
      const res = await request(
        insightsSchema,
        `/${config.igUserId}/insights`,
        {
          metric: options.metric ?? "follower_demographics",
          period: "lifetime",
          metric_type: "total_value",
          breakdown: options.breakdown ?? "age",
          timeframe: options.timeframe ?? "this_month",
        },
        bucBucket,
        options,
      );
      return res.ok ? ok(res.value.data) : res;
    },

    searchHashtag: async (query, options = {}) => {
      const res = await request(
        hashtagSearchSchema,
        "/ig_hashtag_search",
        { user_id: config.igUserId, q: query },
        platformBucket,
        options,
      );
      if (!res.ok) return res;
      const first = res.value.data[0];
      return first === undefined ? err(new IgApiError(`no hashtag id returned for "${query}"`, 404)) : ok(first.id);
    },

    listHashtagRecentMedia: async (hashtagId, options = {}) => {
      const res = await request(
        mediaListSchema,
        `/${hashtagId}/recent_media`,
        { user_id: config.igUserId, ...listParams(HASHTAG_MEDIA_FIELDS, options) },
        platformBucket,
        options,
      );
      return res.ok ? ok(listPage(res.value.data, afterCursor(res.value.paging))) : res;
    },

    exchangeLongLivedToken: async (params, options = {}) => {
      // Only works while the current token is still valid — an expired token
      // cannot be exchanged, forcing full re-auth (verify doc §8).
      return request(
        longLivedTokenSchema,
        "/oauth/access_token",
        {
          grant_type: "fb_exchange_token",
          client_id: params.appId,
          client_secret: params.appSecret,
          fb_exchange_token: params.token,
        },
        platformBucket,
        { ...options, includeToken: false },
      );
    },

    getIgBusinessAccountId: async (pageId, options = {}) => {
      const res = await request(
        pageIgAccountSchema,
        `/${pageId}`,
        { fields: "instagram_business_account" },
        bucBucket,
        options,
      );
      if (!res.ok) return res;
      const account = res.value.instagram_business_account;
      return account === undefined
        ? err(new IgApiError(`page ${pageId} has no linked instagram_business_account`, 200))
        : ok(account.id);
    },

    breakerState: () => breaker.state(),
    usage: () => lastUsage,
  };
};
