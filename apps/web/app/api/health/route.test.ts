import { healthResponseSchema } from "@petal/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Health route wiring test. Redis-dependent bits are stubbed (plan WP7 tests);
 * the db handle is mocked so the route never opens a real connection. Asserts
 * the §7 contract shape and that a down dependency never yields a 500.
 */
const { pingRedisMock, queueDepthsMock } = vi.hoisted(() => ({
  pingRedisMock: vi.fn(),
  queueDepthsMock: vi.fn(),
}));

vi.mock("../../../lib/db", () => ({
  getDb: () => ({ execute: () => Promise.resolve([]) }),
}));

vi.mock("../../../lib/queues", () => ({
  pingRedis: pingRedisMock,
  getQueueDepths: queueDepthsMock,
}));

process.env.DATABASE_URL = "postgres://petal:petal@localhost:5432/petal";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.LOG_LEVEL = "fatal";

const { GET } = await import("./route");

beforeEach(() => {
  pingRedisMock.mockReset();
  queueDepthsMock.mockReset();
});

describe("GET /api/health", () => {
  it("returns the {db, redis, queueDepths} contract when everything is up", async () => {
    pingRedisMock.mockResolvedValue(true);
    queueDepthsMock.mockResolvedValue({ ingest: 0, enrich: 0, aggregate: 0, poll: 0, alert: 0, retention: 0 });

    const res = await GET();
    expect(res.status).toBe(200);
    const parsed = healthResponseSchema.parse(await res.json());
    expect(parsed.data.db).toBe(true);
    expect(parsed.data.redis).toBe(true);
    expect(parsed.data.queueDepths.aggregate).toBe(0);
  });

  it("never 500s when Redis is down — reports redis:false", async () => {
    pingRedisMock.mockRejectedValue(new Error("redis down"));
    queueDepthsMock.mockRejectedValue(new Error("redis down"));

    const res = await GET();
    expect(res.status).toBe(200);
    const parsed = healthResponseSchema.parse(await res.json());
    expect(parsed.data.db).toBe(true);
    expect(parsed.data.redis).toBe(false);
    expect(parsed.data.queueDepths).toEqual({});
  });

  it("degrades to all-false when the environment is unavailable", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const res = await GET();
      expect(res.status).toBe(200);
      const parsed = healthResponseSchema.parse(await res.json());
      expect(parsed.data).toEqual({ db: false, redis: false, queueDepths: {} });
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
