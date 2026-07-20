import { describe, expect, it } from "vitest";
import { mentionEventSchema, type MentionEvent, type MentionSource } from "@petal/core";
import { FIXTURE_COUNT, buildFixtureEvents } from "./dataset";
import { seedFixtures } from "./seed";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("fixture dataset", () => {
  const events = buildFixtureEvents(NOW);

  it("has ~80 events, all valid against the schema", () => {
    expect(events.length).toBe(FIXTURE_COUNT);
    expect(events.length).toBeGreaterThanOrEqual(78);
    for (const e of events) expect(() => mentionEventSchema.parse(e)).not.toThrow();
  });

  it("covers all four sources", () => {
    const sources = new Set(events.map((e) => e.source));
    const all: MentionSource[] = ["own_comment", "caption_mention", "comment_mention", "hashtag_media"];
    for (const s of all) expect(sources.has(s)).toBe(true);
  });

  it("spreads over the trailing 14 days relative to seed time", () => {
    const ts = events.map((e) => new Date(e.occurredAt).getTime());
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    expect(max).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime() - min).toBeLessThanOrEqual(14 * 24 * 3_600_000);
    expect(NOW.getTime() - min).toBeGreaterThan(12 * 24 * 3_600_000);
  });

  it("includes 15+ Roman Urdu / mixed entries", () => {
    const urduMarkers = /\b(hai|nahi|kya|yeh|mera|karo|kaise|bohat|yaar|bilkul|ammi|behen)\b/i;
    expect(events.filter((e) => urduMarkers.test(e.text)).length).toBeGreaterThanOrEqual(15);
  });

  it("idempotency keys (source, igObjectId) are unique", () => {
    const keys = events.map((e) => `${e.source}:${e.igObjectId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("seeding twice through an idempotent upsert yields identical row counts", async () => {
    const store = new Map<string, MentionEvent>();
    const upsert = (e: MentionEvent) => {
      store.set(`${e.source}:${e.igObjectId}`, e);
    };
    await seedFixtures(NOW, upsert);
    const afterFirst = store.size;
    await seedFixtures(NOW, upsert);
    expect(store.size).toBe(afterFirst);
    expect(afterFirst).toBe(FIXTURE_COUNT);
  });
});
