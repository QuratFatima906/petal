/**
 * Recorded response shapes for the Meta endpoints WP3 consumes, used by msw
 * handlers in tests (plan §5.9). Recorded against Graph API **v25.0** —
 * endpoint paths, fields and pagination verified 2026-07-20 in
 * `docs/meta-api-verify.md`. Re-verify at each quarterly Meta release.
 */

export const GRAPH_API_VERSION = "v25.0";

export const ownMediaListShape = {
  data: [
    {
      id: "17900000000000001",
      caption: "Meet Omahi — your cycle, on every new tab.",
      media_type: "IMAGE",
      permalink: "https://www.instagram.com/p/DEMO0001/",
      timestamp: "2026-07-12T09:00:00+0000",
      like_count: 214,
      comments_count: 64,
    },
  ],
  paging: {
    cursors: { before: "QVFIU...before", after: "QVFIU...after" },
    next: "https://graph.facebook.com/v25.0/17800000000000000/media?after=QVFIU...after",
  },
} as const;

export const mediaCommentsShape = {
  data: [
    {
      id: "17800000000000101",
      text: "Love that everything stays on my device.",
      username: "lena.codes",
      timestamp: "2026-07-19T14:32:00+0000",
      like_count: 3,
      replies: {
        data: [
          {
            id: "17800000000000102",
            text: "Same! Sold me instantly.",
            username: "tabgarden",
            timestamp: "2026-07-19T15:02:00+0000",
          },
        ],
      },
    },
  ],
  paging: { cursors: { before: "MTA...b", after: "MTA...a" } },
} as const;

/** `GET /{ig-comment-id}/replies` list edge (verify doc §4). */
export const commentRepliesShape = {
  data: [
    {
      id: "17800000000000102",
      text: "Same! Sold me instantly.",
      username: "tabgarden",
      timestamp: "2026-07-19T15:02:00+0000",
    },
  ],
  paging: { cursors: { before: "MTB...b", after: "MTB...a" } },
} as const;

/**
 * `mentioned_media` is a per-ID field expansion on `/{ig-user-id}` — hydration
 * only, not a pollable list edge (verify doc §4). The outer `id` is the
 * querying IG user; author username is not returned on this edge.
 */
export const mentionedMediaShape = {
  mentioned_media: {
    id: "17900000000000201",
    caption: "Small tools that respect you are rare. @omahi.app is one of them.",
    media_type: "IMAGE",
    comments_count: 12,
    like_count: 87,
    timestamp: "2026-07-18T08:21:00+0000",
  },
  id: "17841400000000000",
} as const;

/** Same field-expansion hydration pattern for a comment @mention (verify doc §4). */
export const mentionedCommentShape = {
  mentioned_comment: {
    id: "17800000000000301",
    text: "@omahi.app my phase card disappeared after the last update.",
    timestamp: "2026-07-19T09:44:00+0000",
    like_count: 1,
    media: { id: "17900000000000301" },
  },
  id: "17841400000000000",
} as const;

/** `GET /{ig-user-id}/tags` — media the account is tagged in; `before`/`after` cursors only, no `next` links. */
export const taggedMediaShape = {
  data: [
    {
      id: "17900000000000501",
      caption: "New-tab setup tour — @omahi.app doing the quiet work.",
      media_type: "IMAGE",
      timestamp: "2026-07-17T18:05:00+0000",
      like_count: 45,
      comments_count: 6,
      username: "desk.rituals",
    },
  ],
  paging: { cursors: { before: "TAG...b", after: "TAG...a" } },
} as const;

/** Business discovery field expansion on `/{ig-user-id}` (verify doc §4). */
export const businessDiscoveryShape = {
  business_discovery: {
    id: "17841400000000999",
    username: "cyclebuddy.app",
    followers_count: 15400,
    media_count: 320,
    biography: "Cycle tracking for humans.",
    website: "https://cyclebuddy.example",
    media: {
      data: [
        {
          id: "17900000000000601",
          caption: "Big v3 launch day!",
          media_type: "IMAGE",
          timestamp: "2026-07-15T10:00:00+0000",
          like_count: 980,
          comments_count: 112,
        },
      ],
      paging: { cursors: { before: "QkQ...b", after: "QkQ...a" } },
    },
  },
  id: "17841400000000000",
} as const;

/** `GET /{ig-media-id}/insights` — `views`, not `impressions` (deprecated; verify doc §4). */
export const mediaInsightsShape = {
  data: [
    {
      name: "views",
      period: "lifetime",
      values: [{ value: 1284 }],
      title: "Views",
      description: "Number of times the media was viewed.",
      id: "17900000000000001/insights/views/lifetime",
    },
    {
      name: "reach",
      period: "lifetime",
      values: [{ value: 1032 }],
      title: "Reach",
      description: "Unique accounts that viewed the media.",
      id: "17900000000000001/insights/reach/lifetime",
    },
  ],
} as const;

/** `GET /{ig-user-id}/insights` with `metric_type=total_value` — `impressions` removed 2025-04-21 (verify doc §4). */
export const accountInsightsShape = {
  data: [
    {
      name: "views",
      period: "day",
      total_value: { value: 340 },
      title: "Views",
      description: "Number of times your content was viewed.",
      id: "17841400000000000/insights/views/day",
    },
    {
      name: "reach",
      period: "day",
      total_value: { value: 260 },
      title: "Reach",
      description: "Unique accounts that viewed your content.",
      id: "17841400000000000/insights/reach/day",
    },
  ],
} as const;

/** Demographics via `follower_demographics` + `breakdown` (replaces `audience_gender_age`/`audience_city`; needs ≥100 engaged accounts). */
export const accountDemographicsShape = {
  data: [
    {
      name: "follower_demographics",
      period: "lifetime",
      title: "Follower demographics",
      description: "The demographic characteristics of followers.",
      total_value: {
        breakdowns: [
          {
            dimension_keys: ["age"],
            results: [
              { dimension_values: ["18-24"], value: 210 },
              { dimension_values: ["25-34"], value: 480 },
            ],
          },
        ],
      },
      id: "17841400000000000/insights/follower_demographics/lifetime",
    },
  ],
} as const;

export const hashtagSearchShape = {
  data: [{ id: "17841500000000001" }],
} as const;

export const hashtagRecentMediaShape = {
  data: [
    {
      id: "17900000000000401",
      caption: "Day 3 with #omahi and I actually know what phase I'm in.",
      media_type: "IMAGE",
      permalink: "https://www.instagram.com/p/DEMO0401/",
      timestamp: "2026-07-18T09:30:00+0000",
      // hashtag endpoints omit username by design — cannot be requested (plan L6, verify doc §5)
    },
  ],
  paging: { cursors: { after: "SFRB...a" } },
} as const;

/** `GET /oauth/access_token?grant_type=fb_exchange_token` — long-lived User token exchange (verify doc §8). */
export const longLivedTokenShape = {
  access_token: "EAAGdemoLongLivedUserToken",
  token_type: "bearer",
  expires_in: 5183944,
} as const;

/** `GET /{page-id}?fields=instagram_business_account` — IG business account id resolution (verify doc §8). */
export const pageIgAccountShape = {
  instagram_business_account: { id: "17841400000000000" },
  id: "112233445566778",
} as const;

/** Graph error envelope for a rate-limited call (code 4 = app-level; also 17/32/613). */
export const graphRateLimitErrorShape = {
  error: {
    message: "(#4) Application request limit reached",
    type: "OAuthException",
    code: 4,
    fbtrace_id: "AbCdEfGh1234",
  },
} as const;

/** Graph error envelope for an expired/invalid token (code 190 ⇒ re-auth required). */
export const graphAuthErrorShape = {
  error: {
    message: "Error validating access token: Session has expired on Saturday, 18-Jul-26.",
    type: "OAuthException",
    code: 190,
    error_subcode: 463,
    fbtrace_id: "AbCdEfGh5678",
  },
} as const;

/** Webhook delivery shape for comment/mention changes (fields confirmed in verify doc §3). */
export const webhookDeliveryShape = {
  object: "instagram",
  entry: [
    {
      id: "17841400000000000",
      time: 1784480000,
      changes: [
        {
          field: "comments",
          value: {
            id: "17800000000000501",
            text: "Just installed, obsessed.",
            media: { id: "17900000000000001" },
            from: { id: "5551112223334445", username: "cyclesyncedlife" },
          },
        },
      ],
    },
  ],
} as const;
