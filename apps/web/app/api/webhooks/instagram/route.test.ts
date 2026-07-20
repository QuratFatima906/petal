import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webhookDeliveryShape } from "@petal/fixtures";

const { addMock, queueCtorMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  queueCtorMock: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add = addMock;
    constructor(name: string, opts: unknown) {
      queueCtorMock(name, opts);
    }
  },
}));

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
const ROUTE_URL = "https://petal.test/api/webhooks/instagram";

process.env.DATABASE_URL = "postgres://petal:petal@localhost:5432/petal";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.IG_APP_SECRET = APP_SECRET;
process.env.IG_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.LOG_LEVEL = "fatal";

const { GET, POST } = await import("./route");

const sign = (body: string, secret: string = APP_SECRET): string =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

const challengeUrl = (params: Record<string, string>): string =>
  `${ROUTE_URL}?${new URLSearchParams(params).toString()}`;

const postSigned = (body: string, headers: Record<string, string> = {}): Promise<Response> =>
  POST(
    new Request(ROUTE_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "x-hub-signature-256": sign(body), ...headers },
    }),
  );

const deliveryBody = JSON.stringify(webhookDeliveryShape);

beforeEach(() => {
  addMock.mockReset();
  addMock.mockResolvedValue(undefined);
  // queueCtorMock is intentionally never cleared: the queue is a lazy
  // singleton, so its constructor fires exactly once per process.
});

describe("GET /api/webhooks/instagram (hub challenge)", () => {
  it("echoes hub.challenge for the correct verify token", async () => {
    const response = GET(
      new Request(
        challengeUrl({
          "hub.mode": "subscribe",
          "hub.verify_token": VERIFY_TOKEN,
          "hub.challenge": "1158201444",
        }),
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("1158201444");
  });

  it.each([
    ["wrong token", { "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }],
    ["missing token", { "hub.mode": "subscribe", "hub.challenge": "1" }],
    ["missing mode", { "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1" }],
    ["missing challenge", { "hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN }],
    ["no params at all", {}],
  ])("rejects with 403 on %s", (_name, params) => {
    const response = GET(new Request(challengeUrl(params)));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/webhooks/instagram (signature)", () => {
  it("accepts a correctly signed delivery and acks 200", async () => {
    const response = await postSigned(deliveryBody);
    expect(response.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a tampered body with 401 and enqueues nothing", async () => {
    const tampered = deliveryBody.replace("obsessed", "tampered!");
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        body: tampered,
        // Signature was computed over the original body.
        headers: { "x-hub-signature-256": sign(deliveryBody) },
      }),
    );
    expect(response.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        body: deliveryBody,
        headers: { "x-hub-signature-256": sign(deliveryBody, "other-secret") },
      }),
    );
    expect(response.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing header", {}],
    ["empty header", { "x-hub-signature-256": "" }],
    ["sha1-prefixed header", { "x-hub-signature-256": `sha1=${"a".repeat(40)}` }],
    ["non-hex digest of the right length", { "x-hub-signature-256": `sha256=${"z".repeat(64)}` }],
  ])("rejects with 401 on %s", async (_name, headers) => {
    const response = await POST(
      new Request(ROUTE_URL, { method: "POST", body: deliveryBody, headers }),
    );
    expect(response.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/instagram (enqueueing)", () => {
  it("enqueues one pinned-contract ingest job per change entry", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "17841400000000000",
          time: 1784480000,
          changes: [
            { field: "comments", value: { id: "c-1", text: "first" } },
            { field: "mentions", value: { comment_id: "c-2", media_id: "m-1" } },
          ],
        },
        {
          id: "17841400000000001",
          time: 1784480001,
          changes: [{ field: "comments", value: { id: "c-3" } }],
        },
      ],
    });

    const response = await postSigned(body);
    expect(response.status).toBe(200);
    expect(queueCtorMock).toHaveBeenCalledWith("ingest", {
      connection: { url: "redis://localhost:6379" },
    });
    expect(addMock).toHaveBeenCalledTimes(3);

    const calls = addMock.mock.calls;
    for (const call of calls) {
      expect(call[0]).toBe("ingest");
      expect(call[2]).toEqual({ attempts: 5, backoff: { type: "exponential", delay: 1000 } });
    }
    expect(calls[0]?.[1]).toEqual({
      accountId: "17841400000000000",
      lane: "webhook",
      receivedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/) as unknown,
      payload: { kind: "webhook_change", field: "comments", value: { id: "c-1", text: "first" } },
    });
    expect(calls[2]?.[1]).toMatchObject({ accountId: "17841400000000001" });
  });

  it("forwards unknown fields inside the change value verbatim", async () => {
    const value = {
      id: "c-9",
      brand_new_meta_field: { nested: true },
      another_unknown: 7,
    };
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "17841400000000000", changes: [{ field: "future_topic", value }] }],
    });

    const response = await postSigned(body);
    expect(response.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock.mock.calls[0]?.[1]).toMatchObject({
      payload: { kind: "webhook_change", field: "future_topic", value },
    });
  });

  it("acks and enqueues both copies of a duplicate delivery (dedup lives downstream)", async () => {
    const first = await postSigned(deliveryBody);
    const second = await postSigned(deliveryBody);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // The DB's (source, ig_object_id) unique index collapses them at ingest.
    expect(addMock).toHaveBeenCalledTimes(2);
  });

  it("still acks 200 when the queue is down", async () => {
    addMock.mockRejectedValue(new Error("redis unavailable"));
    const response = await postSigned(deliveryBody);
    expect(response.status).toBe(200);
  });
});

describe("POST /api/webhooks/instagram (tolerance)", () => {
  it("acks signed garbage (non-JSON) without enqueueing", async () => {
    const response = await postSigned("this is }} not json {{");
    expect(response.status).toBe(200);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("acks an unknown topic object without enqueueing", async () => {
    const body = JSON.stringify({ object: "user", entry: [{ id: "1", changes: [] }] });
    const response = await postSigned(body);
    expect(response.status).toBe(200);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("acks entries with no changes array (messaging-style delivery)", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: "17841400000000000", time: 1784480000, messaging: [{ sender: { id: "x" } }] }],
    });
    const response = await postSigned(body);
    expect(response.status).toBe(200);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("acks a signed JSON body of an unexpected shape", async () => {
    const response = await postSigned(JSON.stringify({ hello: "world" }));
    expect(response.status).toBe(200);
    expect(addMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized body with 413 without crashing", async () => {
    const oversized = JSON.stringify({ object: "instagram", pad: "x".repeat(1_100_000), entry: [] });
    const response = await postSigned(oversized);
    expect(response.status).toBe(413);
    expect(addMock).not.toHaveBeenCalled();
  });
});
