import { describe, expect, it } from "vitest";
import { webhookDeliveryShape } from "@petal/fixtures";
import { ingestPayloadSchema, type IngestJobPayload } from "./ingest-contract";
import { normalizeIngestPayload } from "./normalize";

const CTX = { dbAccountId: "acct-1", newId: () => "01TESTULID000000000000000" };
const RECEIVED_AT = "2026-07-20T12:00:00.000Z";

const webhook = (field: string, value: unknown): IngestJobPayload =>
  ingestPayloadSchema.parse({
    accountId: "17841400000000000",
    lane: "webhook",
    receivedAt: RECEIVED_AT,
    payload: { kind: "webhook_change", field, value },
  });

const poll = (source: string, item: unknown): IngestJobPayload =>
  ingestPayloadSchema.parse({
    accountId: "17841400000000000",
    lane: "poll",
    receivedAt: RECEIVED_AT,
    payload: { kind: "poll_item", source, item },
  });

describe("webhook lane normalization", () => {
  it("maps a recorded comments change onto own_comment", () => {
    const change = webhookDeliveryShape.entry[0].changes[0];
    const result = normalizeIngestPayload(webhook(change.field, change.value), CTX);
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("own_comment");
    expect(result.event.igObjectId).toBe("17800000000000501");
    expect(result.event.mediaId).toBe("17900000000000001");
    expect(result.event.authorUsername).toBe("cyclesyncedlife");
    expect(result.event.text).toBe("Just installed, obsessed.");
    expect(result.event.ingestedVia).toBe("webhook");
    expect(result.event.occurredAt).toBe(RECEIVED_AT);
    expect(result.event.accountId).toBe("acct-1");
  });

  it("maps live_comments the same as comments", () => {
    const result = normalizeIngestPayload(
      webhook("live_comments", { id: "999", text: "live!", from: { username: "u" } }),
      CTX,
    );
    expect(result.kind === "event" && result.event.source).toBe("own_comment");
  });

  it("maps a caption mention (media_id only) onto caption_mention with empty text", () => {
    const result = normalizeIngestPayload(webhook("mentions", { media_id: "m-1" }), CTX);
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("caption_mention");
    expect(result.event.igObjectId).toBe("m-1");
    expect(result.event.text).toBe("");
    expect(result.event.mediaId).toBeNull();
  });

  it("maps a comment mention (comment_id present) onto comment_mention keyed by comment id", () => {
    const result = normalizeIngestPayload(webhook("mentions", { media_id: "m-1", comment_id: "c-1" }), CTX);
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("comment_mention");
    expect(result.event.igObjectId).toBe("c-1");
  });

  it("skips unknown webhook fields without producing an event", () => {
    const result = normalizeIngestPayload(webhook("story_insights", { anything: true }), CTX);
    expect(result).toEqual({ kind: "skip", reason: 'unknown webhook field "story_insights"' });
  });

  it("skips an unparseable comments value instead of throwing", () => {
    const result = normalizeIngestPayload(webhook("comments", { no_id: true }), CTX);
    expect(result.kind).toBe("skip");
  });
});

describe("poll lane normalization", () => {
  it("maps an own_comment item with embedded media, mirroring the owned media", () => {
    const result = normalizeIngestPayload(
      poll("own_comment", {
        id: "c-10",
        text: "Love it",
        username: "lena.codes",
        timestamp: "2026-07-19T14:32:00+0000",
        media: {
          id: "m-10",
          caption: "post",
          media_type: "IMAGE",
          permalink: "https://www.instagram.com/p/x/",
          timestamp: "2026-07-12T09:00:00+0000",
          like_count: 3,
          comments_count: 1,
        },
      }),
      CTX,
    );
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("own_comment");
    expect(result.event.mediaId).toBe("m-10");
    expect(result.event.occurredAt).toBe("2026-07-19T14:32:00.000Z");
    expect(result.event.ingestedVia).toBe("poll");
    expect(result.media?.id).toBe("m-10");
    expect(result.media?.origin).toBe("owned");
    expect(result.media?.postedAt).toBe("2026-07-12T09:00:00.000Z");
  });

  it("does not mirror media from an id-only reference", () => {
    const result = normalizeIngestPayload(
      poll("own_comment", { id: "c-11", text: "hi", media: { id: "m-11" } }),
      CTX,
    );
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.media).toBeUndefined();
    expect(result.event.mediaId).toBe("m-11");
  });

  it("maps a hydrated comment mention keeping mediaId null", () => {
    const result = normalizeIngestPayload(
      poll("comment_mention", {
        id: "17800000000000301",
        text: "@omahi.app my phase card disappeared after the last update.",
        timestamp: "2026-07-19T09:44:00+0000",
        media: { id: "17900000000000301" },
      }),
      CTX,
    );
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("comment_mention");
    expect(result.event.mediaId).toBeNull();
    expect(result.event.text).toContain("phase card");
  });

  it("maps tagged/mentioned media onto caption_mention using the caption as text", () => {
    const result = normalizeIngestPayload(
      poll("caption_mention", {
        id: "17900000000000501",
        caption: "New-tab setup tour — @omahi.app doing the quiet work.",
        media_type: "IMAGE",
        timestamp: "2026-07-17T18:05:00+0000",
        username: "desk.rituals",
      }),
      CTX,
    );
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("caption_mention");
    expect(result.event.authorUsername).toBe("desk.rituals");
    expect(result.event.text).toContain("quiet work");
  });

  it("maps hashtag media with null author (hashtag edges never return usernames)", () => {
    const result = normalizeIngestPayload(
      poll("hashtag_media", {
        id: "17900000000000401",
        caption: "Day 3 with #omahi",
        media_type: "IMAGE",
        permalink: "https://www.instagram.com/p/DEMO0401/",
        timestamp: "2026-07-18T09:30:00+0000",
      }),
      CTX,
    );
    expect(result.kind).toBe("event");
    if (result.kind !== "event") return;
    expect(result.event.source).toBe("hashtag_media");
    expect(result.event.authorUsername).toBeNull();
    expect(result.event.permalink).toBe("https://www.instagram.com/p/DEMO0401/");
  });

  it("falls back to receivedAt when the item has no usable timestamp", () => {
    const result = normalizeIngestPayload(poll("own_comment", { id: "c-12", timestamp: "not-a-date" }), CTX);
    expect(result.kind === "event" && result.event.occurredAt).toBe(RECEIVED_AT);
  });

  it("drops invalid permalinks instead of failing the event", () => {
    const result = normalizeIngestPayload(
      poll("hashtag_media", { id: "h-1", caption: "x", permalink: "not a url" }),
      CTX,
    );
    expect(result.kind === "event" && result.event.permalink).toBeNull();
  });
});
