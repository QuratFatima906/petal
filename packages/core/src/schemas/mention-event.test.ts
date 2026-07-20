import { describe, expect, it } from "vitest";
import { ValidationError } from "../errors";
import { err, ok } from "../result";
import { assertNever } from "../assert-never";
import { loadEnv } from "../env";
import { enrichmentSchema, mentionEventSchema, type MentionSource } from "./mention-event";

const validEvent = {
  id: "ev-1",
  accountId: "acct-1",
  source: "own_comment",
  igObjectId: "178000001",
  mediaId: "179000001",
  authorUsername: "lena.codes",
  text: "Love it",
  permalink: null,
  occurredAt: "2026-07-19T14:32:00.000Z",
  ingestedVia: "webhook",
  raw: { fixture: true },
};

describe("mention event schema", () => {
  it("round-trips a valid event", () => {
    const parsed = mentionEventSchema.parse(validEvent);
    expect(mentionEventSchema.parse(parsed)).toEqual(parsed);
  });

  it("rejects unknown source values", () => {
    expect(() => mentionEventSchema.parse({ ...validEvent, source: "dm" })).toThrow();
  });

  it("rejects out-of-range enrichment confidence", () => {
    expect(() =>
      enrichmentSchema.parse({
        mentionEventId: "ev-1",
        sentiment: "positive",
        intent: "praise",
        confidence: 1.4,
        model: "m",
        promptVersion: "v1",
        latencyMs: 10,
        costUsd: 0.001,
        method: "llm",
      }),
    ).toThrow();
  });
});

describe("core utilities", () => {
  it("Result narrows on ok flag", () => {
    const r = Math.random() < 2 ? ok(1) : err("nope");
    expect(r.ok && r.value).toBe(1);
  });

  it("assertNever throws on unreachable variants", () => {
    const source = "own_comment" as MentionSource;
    switch (source) {
      case "own_comment":
      case "caption_mention":
      case "comment_mention":
      case "hashtag_media":
        break;
      default:
        assertNever(source);
    }
    expect(() => assertNever("boom" as never)).toThrow(/Unhandled variant/);
  });

  it("typed errors keep their payloads", () => {
    const e = new ValidationError("bad payload", ["text: required"]);
    expect(e.name).toBe("ValidationError");
    expect(e.issues).toContain("text: required");
  });

  it("loadEnv fails fast with a readable list of missing keys", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    const env = loadEnv({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://y", DEMO_MODE: "true" });
    expect(env.DEMO_MODE).toBe(true);
    expect(env.RETENTION_DAYS).toBe(90);
  });
});
