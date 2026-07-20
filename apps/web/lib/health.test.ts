import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

/** The health endpoint must never throw for a down dependency — it reports booleans. */
describe("checkHealth", () => {
  it("reports every dependency up with queue depths", async () => {
    const report = await checkHealth({
      pingDb: () => Promise.resolve(true),
      pingRedis: () => Promise.resolve(true),
      queueDepths: () => Promise.resolve({ ingest: 2, enrich: 0, aggregate: 1 }),
    });
    expect(report).toEqual({ db: true, redis: true, queueDepths: { ingest: 2, enrich: 0, aggregate: 1 } });
  });

  it("degrades a rejecting Redis check instead of throwing", async () => {
    const report = await checkHealth({
      pingDb: () => Promise.resolve(true),
      pingRedis: () => Promise.reject(new Error("redis down")),
      queueDepths: () => Promise.reject(new Error("redis down")),
    });
    expect(report.db).toBe(true);
    expect(report.redis).toBe(false);
    expect(report.queueDepths).toEqual({});
  });

  it("reports db down when the db ping rejects", async () => {
    const report = await checkHealth({
      pingDb: () => Promise.reject(new Error("pg down")),
      pingRedis: () => Promise.resolve(true),
      queueDepths: () => Promise.resolve({}),
    });
    expect(report.db).toBe(false);
    expect(report.redis).toBe(true);
  });
});
