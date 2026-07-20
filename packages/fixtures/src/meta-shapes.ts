/**
 * Recorded response shapes for the Meta endpoints WP3 consumes, used by msw
 * handlers in tests (plan §5.9). Shapes drafted against Graph API v23.0.
 * VERIFY: re-record against the version pinned after docs/meta-api-verify.md
 * lands; field availability shifts between versions.
 */

export const GRAPH_API_VERSION = "v23.0";

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
    next: "https://graph.facebook.com/v23.0/17800000000000000/media?after=QVFIU...after",
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

export const mentionedMediaShape = {
  data: [
    {
      id: "17900000000000201",
      caption: "Small tools that respect you are rare. @omahi.app is one of them.",
      media_type: "IMAGE",
      permalink: "https://www.instagram.com/p/DEMO0201/",
      timestamp: "2026-07-18T08:21:00+0000",
      // VERIFY: username of the mentioning author is not always present on this edge
    },
  ],
} as const;

export const mentionedCommentShape = {
  data: [
    {
      id: "17800000000000301",
      text: "@omahi.app my phase card disappeared after the last update.",
      timestamp: "2026-07-19T09:44:00+0000",
      media: { id: "17900000000000301" },
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
      // VERIFY: hashtag endpoints omit username by design (plan L6)
    },
  ],
} as const;

/** Webhook delivery shape for comment/mention changes (VERIFY topic names). */
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
