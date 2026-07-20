/**
 * Version pin and client-side budgets. Endpoint surface, limits and token
 * model verified 2026-07-20 in `docs/meta-api-verify.md`; re-verify at each
 * quarterly Meta release.
 */

/** Graph API version pinned per docs/meta-api-verify.md §1 (v25.0 released 2026-02-18). */
export const GRAPH_API_VERSION = "v25.0";

/** All non-test calls target this host; tests point msw at the same URL. */
export const GRAPH_BASE_URL = "https://graph.facebook.com";

/** Every outbound call carries an explicit timeout (plan §5.4). */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Retryable failures (timeout, 429, 5xx) get this many total attempts. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * BUC bucket defaults — Meta's cap is `4800 × impressions` per rolling 24h per
 * IG account (developers.facebook.com/docs/graph-api/overview/rate-limiting/,
 * checked 2026-07-20). A fresh account has near-zero impressions, so the
 * default budget is deliberately tiny: 2880/day, burst 30.
 */
export const BUC_BUCKET_DEFAULTS = {
  capacity: 30,
  refillIntervalMs: 30_000,
} as const;

/**
 * Platform bucket defaults — business_discovery + hashtag search share the
 * app-level `200 × daily active users` per rolling hour budget (same doc,
 * checked 2026-07-20). A single-tenant app has ~1 DAU: 60/hour, burst 10.
 */
export const PLATFORM_BUCKET_DEFAULTS = {
  capacity: 10,
  refillIntervalMs: 60_000,
} as const;

/** Graph error codes that signal throttling despite `type: "OAuthException"`. */
export const RATE_LIMIT_ERROR_CODES: readonly number[] = [4, 17, 32, 613];

/** Graph error codes that require re-auth — an expired token cannot be exchanged (verify doc §8). */
export const AUTH_ERROR_CODES: readonly number[] = [102, 190];
