import { type AlertRule } from "@petal/core";
import { insertAlert, schema, type Db } from "@petal/db";
import { and, desc, eq, gte } from "drizzle-orm";
import { ulid } from "ulid";
import type { Logger } from "../logger";

/**
 * Alert consumer (plan WP9 / §6.1): evaluate every enabled rule against the
 * latest aggregates and fired-alert history, then record + optionally deliver
 * to Slack. Runs on a 10-minute repeatable schedule (`alert:evaluate`).
 *
 * Two rule kinds:
 *   - `volume_spike`: last 24h total ≥ multiplier × trailing 7-day daily avg
 *     AND ≥ min events (plan §9).
 *   - `negative_share`: negative sentiment ≥ share% of last 24h AND ≥ min
 *     events (plan §9).
 *
 * Both respect a per-rule cooldown (default 6h) to prevent storms.
 */

// ---------- pinned types ----------

export const ALERT_QUEUE = "alert";

export type AlertDeps = {
  readonly db: Db;
  readonly logger: Logger;
  readonly clock: () => Date;
  /** Slack incoming webhook URL; undefined = log-only mode. */
  readonly slackWebhookUrl: string | undefined;
  /** HTTP POST implementation — inject fetch or a test stub. */
  readonly httpPost: (url: string, body: unknown) => Promise<{ ok: boolean }>;
};

/** Structural slice of a BullMQ job — keeps the processor testable without Redis. */
export type AlertJobLike = {
  readonly id?: string | undefined;
  readonly data: unknown;
};

export type RuleOutcome =
  | { readonly kind: "skipped-disabled" }
  | { readonly kind: "skipped-cooldown" }
  | { readonly kind: "not-fired" }
  | { readonly kind: "fired"; readonly summary: string; readonly deliveredSlack: boolean };

export type AlertOutcome = {
  readonly evaluatedCount: number;
  readonly firedCount: number;
  readonly outcomes: readonly RuleOutcome[];
};

/** Default params for each rule kind when the DB row's `params` is sparse. */
const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  volume_spike: { mult: 2, min: 10, cool: 6 },
  negative_share: { share: 30, min: 5, cool: 6 },
};

function ruleParams(kind: string, stored: Record<string, number>): Record<string, number> {
  const defs = DEFAULT_PARAMS[kind] ?? {};
  return { ...defs, ...stored };
}

/** Number of milliseconds per hour. */
const HOUR_MS = 3_600_000;

// ---------- store seam ----------

export type AlertStore = {
  readonly listRules: () => Promise<AlertRule[]>;
  /** Returns the cooldown timestamp for the most recent fire of `ruleId`, or null. */
  readonly cooldownCutoff: (ruleId: string, cooldownHr: number) => Promise<Date | null>;
  readonly dailyTotals: (lookbackDays: number) => Promise<
    { date: string; total: number; negative: number }[]
  >;
  readonly writeAlert: (ruleId: string, summary: string, payload: Record<string, unknown>, deliveredSlack: boolean) => Promise<void>;
};

export const createDbAlertStore = (db: Db, accountId: string, clock: () => Date): AlertStore => ({
  listRules: async () => {
    const rows = await db
      .select()
      .from(schema.alertRules)
      .where(and(eq(schema.alertRules.accountId, accountId), eq(schema.alertRules.enabled, true)))
      .orderBy(schema.alertRules.kind);
    return rows.map((r) => ({ id: r.id, kind: r.kind, params: r.params, enabled: r.enabled }));
  },

  cooldownCutoff: async (ruleId, cooldownHr) => {
    const cutoff = new Date(clock().getTime() - cooldownHr * HOUR_MS);
    const [row] = await db
      .select({ firedAt: schema.alerts.firedAt })
      .from(schema.alerts)
      .where(and(eq(schema.alerts.ruleId, ruleId), gte(schema.alerts.firedAt, cutoff)))
      .orderBy(desc(schema.alerts.firedAt))
      .limit(1);
    return row?.firedAt ?? null;
  },

  dailyTotals: async (lookbackDays) => {
    const cutoff = new Date(clock().getTime() - lookbackDays * 24 * HOUR_MS);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const rows = await db
      .select({ date: schema.dailyAggregates.date, total: schema.dailyAggregates.mentionsTotal, negative: schema.dailyAggregates.negative })
      .from(schema.dailyAggregates)
      .where(and(eq(schema.dailyAggregates.accountId, accountId), gte(schema.dailyAggregates.date, cutoffDate)))
      .orderBy(schema.dailyAggregates.date);
    return rows.map((r) => ({ date: r.date, total: r.total, negative: r.negative }));
  },

  writeAlert: async (ruleId, summary, payload, deliveredSlack) => {
    await insertAlert(db, { id: ulid(clock().getTime()), ruleId, firedAt: clock(), summary, payload, deliveredSlack });
  },
});

// ---------- processor ----------

export const createAlertProcessor =
  (deps: AlertDeps) =>
  async (_job: AlertJobLike): Promise<AlertOutcome> => {
    const log = deps.logger.child({ jobId: _job.id ?? null });

    const [accountRow] = await deps.db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.status, "active"))
      .limit(1);

    if (accountRow === undefined) {
      log.info("no active account — alert evaluation skipped");
      return { evaluatedCount: 0, firedCount: 0, outcomes: [] };
    }

    const store = createDbAlertStore(deps.db, accountRow.id, deps.clock);
    const rules = await store.listRules();
    if (rules.length === 0) {
      log.info("no enabled alert rules — evaluation skipped");
      return { evaluatedCount: 0, firedCount: 0, outcomes: [] };
    }

    // Load aggregates for the last 8 days (current + 7 trailing for avg).
    const rows = await store.dailyTotals(8);
    if (rows.length === 0) {
      log.info("no aggregate data yet — alert evaluation skipped");
      return { evaluatedCount: 0, firedCount: 0, outcomes: [] };
    }

    const outcomes: RuleOutcome[] = [];

    for (const rule of rules) {
      const params = ruleParams(rule.kind, rule.params);
      const outcome = await evaluateRule(store, deps, rule, params, rows, log);
      outcomes.push(outcome);
    }

    const firedCount = outcomes.filter((o) => o.kind === "fired").length;
    log.info({ evaluatedCount: rules.length, firedCount }, "alert evaluation complete");
    return { evaluatedCount: rules.length, firedCount, outcomes };
  };

async function evaluateRule(
  store: AlertStore,
  deps: AlertDeps,
  rule: AlertRule,
  params: Record<string, number>,
  rows: { date: string; total: number; negative: number }[],
  log: Logger,
): Promise<RuleOutcome> {
  const ruleLog = log.child({ ruleId: rule.id, kind: rule.kind });

  // Cooldown check.
  const cooldownHr = params["cool"] ?? 6;
  const cooldown = await store.cooldownCutoff(rule.id, cooldownHr);
  if (cooldown !== null) {
    ruleLog.info({ cooldownUntil: cooldown.toISOString() }, "rule in cooldown — skipped");
    return { kind: "skipped-cooldown" };
  }

  const today = rows[rows.length - 1];
  if (today === undefined) return { kind: "not-fired" };

  if (rule.kind === "volume_spike") {
    return evaluateVolumeSpike(store, deps, rule, params, rows, ruleLog);
  }

  if (rule.kind === "negative_share") {
    return evaluateNegativeShare(store, deps, rule, params, rows, ruleLog);
  }

  return { kind: "not-fired" };
}

async function evaluateVolumeSpike(
  store: AlertStore,
  deps: AlertDeps,
  rule: AlertRule,
  params: Record<string, number>,
  rows: { date: string; total: number; negative: number }[],
  log: Logger,
): Promise<RuleOutcome> {
  const mult = params["mult"] ?? 2;
  const minEvents = params["min"] ?? 10;

  // Trailing 7-day average excludes today.
  const trailing = rows.slice(0, -1);
  const trailingTotal = trailing.reduce((s, r) => s + r.total, 0);
  const trailingAvg = trailing.length > 0 ? trailingTotal / trailing.length : 0;

  const today = rows[rows.length - 1];
  if (today === undefined) return { kind: "not-fired" };
  const last24h = today.total;

  if (last24h < minEvents) {
    log.debug({ last24h, minEvents }, "volume spike: below min events threshold");
    return { kind: "not-fired" };
  }
  if (trailingAvg === 0) {
    log.debug("volume spike: no trailing data for comparison");
    return { kind: "not-fired" };
  }
  if (last24h < mult * trailingAvg) {
    log.debug({ last24h, trailingAvg, mult, threshold: mult * trailingAvg }, "volume spike: below multiplier threshold");
    return { kind: "not-fired" };
  }

  // Fired!
  const avgStr = trailingAvg % 1 === 0 ? String(Math.round(trailingAvg)) : trailingAvg.toFixed(1);
  const summary = `${last24h} mentions in 24h — ${(last24h / trailingAvg).toFixed(1)}× the ${avgStr}/day average`;
  return await fireAndDeliver(store, deps, rule, summary, { last24h, trailingAvg, minEvents, mult }, log);
}

async function evaluateNegativeShare(
  store: AlertStore,
  deps: AlertDeps,
  rule: AlertRule,
  params: Record<string, number>,
  rows: { date: string; total: number; negative: number }[],
  log: Logger,
): Promise<RuleOutcome> {
  const share = (params["share"] ?? 30) / 100;
  const minEvents = params["min"] ?? 5;

  const today = rows[rows.length - 1];
  if (today === undefined) return { kind: "not-fired" };
  const last24h = today.total;
  const negativeCount = today.negative;

  if (last24h < minEvents) {
    log.debug({ last24h, minEvents }, "negative share: below min events threshold");
    return { kind: "not-fired" };
  }

  const actualShare = last24h > 0 ? negativeCount / last24h : 0;
  if (actualShare < share) {
    log.debug({ actualShare: Math.round(actualShare * 100), shareThreshold: Math.round(share * 100) }, "negative share: below threshold");
    return { kind: "not-fired" };
  }

  const pct = Math.round(actualShare * 100);
  const summary = `${pct}% negative across ${last24h} mentions`;
  return await fireAndDeliver(store, deps, rule, summary, { negativeCount, last24h: last24h, shareThreshold: share, minEvents }, log);
}

async function fireAndDeliver(
  store: AlertStore,
  deps: AlertDeps,
  rule: AlertRule,
  summary: string,
  payload: Record<string, unknown>,
  log: Logger,
): Promise<RuleOutcome> {
  let deliveredSlack = false;

  if (deps.slackWebhookUrl !== undefined) {
    try {
      const slackBody = {
        text: `*Petal Alert — ${rule.kind === "volume_spike" ? "Volume spike" : "Negative share"}*\n${summary}\nRule: \`${rule.id}\``,
      };
      const resp = await deps.httpPost(deps.slackWebhookUrl, slackBody);
      deliveredSlack = resp.ok;
      if (!resp.ok) {
        log.warn({ status: "non-ok" }, "Slack webhook returned non-ok status — alert recorded without delivery");
      }
    } catch (err) {
      log.warn({ err }, "Slack webhook request failed — alert recorded without delivery");
    }
  }

  await store.writeAlert(rule.id, summary, payload, deliveredSlack);

  log.info({ summary, deliveredSlack }, "alert fired");
  return { kind: "fired", summary, deliveredSlack };
}
