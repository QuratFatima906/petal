import { describe, expect, it } from "vitest";
import { ENRICH_JOB_OPTIONS, POLL_JOB_NAMES, QUEUE_NAMES, REPEATABLE_SCHEDULES } from "./queues";

const MINUTE_MS = 60_000;

describe("queue topology (plan §6.1)", () => {
  it("declares all six queues", () => {
    expect([...QUEUE_NAMES]).toEqual(["ingest", "enrich", "aggregate", "poll", "alert", "retention"]);
  });

  it("schedules mention re-hydration + /tags every 5 minutes", () => {
    const s = REPEATABLE_SCHEDULES.find((x) => x.jobName === POLL_JOB_NAMES.mentionsTags);
    expect(s?.queue).toBe("poll");
    expect(s?.repeat).toEqual({ every: 5 * MINUTE_MS });
  });

  it("schedules owned media comments every 15 minutes", () => {
    const s = REPEATABLE_SCHEDULES.find((x) => x.jobName === POLL_JOB_NAMES.ownComments);
    expect(s?.queue).toBe("poll");
    expect(s?.repeat).toEqual({ every: 15 * MINUTE_MS });
  });

  it("schedules hashtags hourly", () => {
    const s = REPEATABLE_SCHEDULES.find((x) => x.jobName === POLL_JOB_NAMES.hashtags);
    expect(s?.queue).toBe("poll");
    expect(s?.repeat).toEqual({ every: 60 * MINUTE_MS });
  });

  it("schedules alert evaluation every 10 minutes and retention daily", () => {
    const alert = REPEATABLE_SCHEDULES.find((x) => x.queue === "alert");
    expect(alert?.repeat).toEqual({ every: 10 * MINUTE_MS });
    const retention = REPEATABLE_SCHEDULES.find((x) => x.queue === "retention");
    expect(retention?.repeat).toEqual({ pattern: "0 3 * * *" });
  });

  it("keeps schedules singleton per job name (scheduler id = job name)", () => {
    const ids = REPEATABLE_SCHEDULES.map((s) => s.schedulerId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of REPEATABLE_SCHEDULES) expect(s.schedulerId).toBe(s.jobName);
  });

  it("gives enrich jobs 3 attempts with exponential backoff", () => {
    expect(ENRICH_JOB_OPTIONS).toEqual({ attempts: 3, backoff: { type: "exponential", delay: 1000 } });
  });
});
