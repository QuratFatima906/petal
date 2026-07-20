import { describe, expect, it } from "vitest";
import { INGEST_JOB_NAME, INGEST_JOB_OPTIONS, INGEST_QUEUE_NAME, ingestJobPayloadSchema } from "./ingest-queue";

const webhookChangePayload = {
  accountId: "17841400000000000",
  lane: "webhook",
  receivedAt: "2026-07-21T10:00:00.000Z",
  payload: { kind: "webhook_change", field: "comments", value: { id: "c-1" } },
};

describe("pinned ingest contract constants", () => {
  it("keeps the queue/job names and producer options the worker relies on", () => {
    expect(INGEST_QUEUE_NAME).toBe("ingest");
    expect(INGEST_JOB_NAME).toBe("ingest");
    expect(INGEST_JOB_OPTIONS).toEqual({ attempts: 5, backoff: { type: "exponential", delay: 1000 } });
  });
});

describe("ingestJobPayloadSchema", () => {
  it("accepts a webhook_change payload", () => {
    const parsed = ingestJobPayloadSchema.safeParse(webhookChangePayload);
    expect(parsed.success).toBe(true);
  });

  it("accepts a poll_item payload (worker-side lane)", () => {
    const parsed = ingestJobPayloadSchema.safeParse({
      accountId: "17841400000000000",
      lane: "poll",
      receivedAt: "2026-07-21T10:00:00.000Z",
      payload: { kind: "poll_item", source: "own_comment", item: { id: "c-2" } },
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["unknown lane", { ...webhookChangePayload, lane: "push" }],
    ["empty accountId", { ...webhookChangePayload, accountId: "" }],
    ["non-ISO receivedAt", { ...webhookChangePayload, receivedAt: "yesterday" }],
    ["unknown payload kind", { ...webhookChangePayload, payload: { kind: "other", field: "f", value: 1 } }],
    [
      "unknown poll source",
      { ...webhookChangePayload, payload: { kind: "poll_item", source: "dm", item: {} } },
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(ingestJobPayloadSchema.safeParse(candidate).success).toBe(false);
  });
});
