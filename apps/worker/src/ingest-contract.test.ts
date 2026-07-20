import { describe, expect, it } from "vitest";
import { INGEST_JOB_OPTIONS, INGEST_JOB_NAME, INGEST_QUEUE, ingestPayloadSchema } from "./ingest-contract";

describe("pinned ingest-job contract", () => {
  it("keeps the frozen queue/job names and producer options", () => {
    expect(INGEST_QUEUE).toBe("ingest");
    expect(INGEST_JOB_NAME).toBe("ingest");
    expect(INGEST_JOB_OPTIONS).toEqual({ attempts: 5, backoff: { type: "exponential", delay: 1000 } });
  });

  it("accepts a webhook_change payload verbatim", () => {
    const parsed = ingestPayloadSchema.safeParse({
      accountId: "17841400000000000",
      lane: "webhook",
      receivedAt: "2026-07-20T12:00:00.000Z",
      payload: { kind: "webhook_change", field: "comments", value: { id: "1", text: "hi" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a poll_item payload for every source", () => {
    for (const source of ["own_comment", "caption_mention", "comment_mention", "hashtag_media"]) {
      const parsed = ingestPayloadSchema.safeParse({
        accountId: "17841400000000000",
        lane: "poll",
        receivedAt: "2026-07-20T12:00:00.000Z",
        payload: { kind: "poll_item", source, item: { id: "x" } },
      });
      expect(parsed.success).toBe(true);
    }
  });

  const rejects: readonly [string, Record<string, unknown>][] = [
    ["missing lane", { accountId: "a", receivedAt: "2026-07-20T12:00:00Z", payload: { kind: "webhook_change", field: "comments", value: {} } }],
    ["bad lane", { accountId: "a", lane: "push", receivedAt: "2026-07-20T12:00:00Z", payload: { kind: "webhook_change", field: "comments", value: {} } }],
    ["non-ISO receivedAt", { accountId: "a", lane: "poll", receivedAt: "yesterday", payload: { kind: "poll_item", source: "own_comment", item: {} } }],
    ["unknown kind", { accountId: "a", lane: "poll", receivedAt: "2026-07-20T12:00:00Z", payload: { kind: "mystery" } }],
    ["unknown poll source", { accountId: "a", lane: "poll", receivedAt: "2026-07-20T12:00:00Z", payload: { kind: "poll_item", source: "story", item: {} } }],
    ["empty accountId", { accountId: "", lane: "poll", receivedAt: "2026-07-20T12:00:00Z", payload: { kind: "poll_item", source: "own_comment", item: {} } }],
  ];

  it.each(rejects)("rejects %s", (_name, payload) => {
    expect(ingestPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
