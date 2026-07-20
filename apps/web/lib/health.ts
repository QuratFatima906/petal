/**
 * Health computation (plan §7): db ping, redis ping, per-queue BullMQ job
 * counts. Every dependency check degrades to a safe value — a down dependency
 * is reported as `false` / `{}`, never a thrown 500. Checks are injected so
 * tests can stub the Redis-dependent parts.
 */
export type HealthChecks = {
  readonly pingDb: () => Promise<boolean>;
  readonly pingRedis: () => Promise<boolean>;
  readonly queueDepths: () => Promise<Record<string, number>>;
};

export type HealthReport = {
  readonly db: boolean;
  readonly redis: boolean;
  readonly queueDepths: Record<string, number>;
};

export async function checkHealth(checks: HealthChecks): Promise<HealthReport> {
  const [db, redis, queueDepths] = await Promise.all([
    checks.pingDb().catch(() => false),
    checks.pingRedis().catch(() => false),
    checks.queueDepths().catch(() => ({}) as Record<string, number>),
  ]);
  return { db, redis, queueDepths };
}
