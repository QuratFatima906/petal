# Petal operations runbook

Run-level procedures for the Petal Instagram listening platform.

## Architecture overview

```
                    Instagram Graph API
                          ▲
                webhooks  │  polling
                (push)    │  (pull)
                          │
        ┌─────────────────┴──────────────┐
        │ apps/web (Next.js)             │
        │  · /api/webhooks/instagram     │
        │  · dashboard UI                │
        │  · query API                   │
        └────────────┬───────────────────┘
                     │ enqueue
                     ▼
              ┌──────────────┐
              │  BullMQ +    │
              │  Redis       │
              └──────┬───────┘
                     │ consume
                     ▼
        ┌──────────────────────────────┐
        │ apps/worker (BullMQ process) │
        │  · ingest                    │
        │  · poll                      │
        │  · enrich                    │
        │  · aggregate                 │
        │  · alert                     │
        │  · retention                 │
        └────────────┬─────────────────┘
                     │ write / read
                     ▼
              ┌──────────────┐
              │   Postgres   │
              └──────────────┘
```

Two services on Railway:
- **web** — Next.js (Dockerfile.web), port 3000
- **worker** — BullMQ process (Dockerfile.worker), no external port

## Quick reference

| Item | Value |
|---|---|
| Deployed URL | https://petal-production-db7f.up.railway.app |
| Health endpoint | `GET /api/health` |
| IG Graph API version | v25.0 |
| Enrichment model | `claude-haiku-4-5`, prompt `petal-enrich-v1` |
| Daily LLM budget | `ENRICH_DAILY_BUDGET_USD` (default $2.00) |
| Retention window | `RETENTION_DAYS` (default 90) |
| Alert schedule | Every 10 minutes |
| Retention schedule | Daily at 03:00 UTC |

## Environment variables

See `packages/core/src/env.ts` for the authoritative schema.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Railway Postgres plugin provides |
| `REDIS_URL` | yes | Railway Redis plugin provides |
| `IG_APP_ID` | no (demo) | Meta app ID |
| `IG_APP_SECRET` | no (demo) | Meta app secret (HMAC key) |
| `IG_ACCESS_TOKEN` | no (demo) | Long-lived FB User token |
| `IG_ACCOUNT_ID` | no (demo) | Instagram business account id |
| `IG_WEBHOOK_VERIFY_TOKEN` | no (demo) | Random string for webhook challenge |
| `ANTHROPIC_API_KEY` | no (demo) | For LLM enrichment |
| `TOKEN_ENCRYPTION_KEY` | no | 64 hex chars or base64(32 bytes); aes-256-gcm |
| `ENRICH_DAILY_BUDGET_USD` | no | Default 2.00 |
| `SLACK_WEBHOOK_URL` | no | Alerts log only when absent |
| `DEMO_MODE` | no | `"true"` disables Meta calls and IG polling |
| `RETENTION_DAYS` | no | Default 90 |
| `LOG_LEVEL` | no | Default `info` |

## Deploying

### Initial Railway setup

1. Create a Railway project from the GitHub repo.
2. Add a **Postgres** plugin and a **Redis** plugin.
3. Add the **web** service — Railway auto-detects `railway.json` and builds `Dockerfile.web`.
4. Add a **second service** for the worker — set the Dockerfile path to `Dockerfile.worker`.
5. Set `DATABASE_URL` and `REDIS_URL` on both services. Railway plugin variables are injected automatically.
6. Set `DEMO_MODE=true` on both services for demo-only operation.
7. Deploy.

### Adding the worker service (Railway dashboard)

The worker does not have its own `railway.json` entry yet. In the Railway dashboard:
1. Click **New Service** → **GitHub repo** → select the repo.
2. Click **Settings** → **Dockerfile Path** → enter `Dockerfile.worker`.
3. Set the same environment variables as the web service.
4. Deploy. The worker starts processing queues automatically.

### Rolling deploy

Push to `main`. Railway auto-deploys both services. Migrations run at worker boot — no separate migration step is needed.

## Checking health

```bash
# Web service
curl https://petal-production-db7f.up.railway.app/api/health
# → { "data": { "db": true, "redis": true, "queueDepths": { "ingest": 0, ... } } }
```

The health endpoint degrades gracefully — if Postgres or Redis is down it returns `false` for that field and an empty `queueDepths` instead of 500ing.

## Replaying dead letters

Jobs that exhaust their retries are parked in the `dead_letters` table. To replay:

```sql
-- List dead letters
SELECT id, queue, job_name, error, parked_at
FROM dead_letters
ORDER BY parked_at DESC
LIMIT 20;

-- Inspect a specific one
SELECT payload FROM dead_letters WHERE id = '<id>';

-- Re-enqueue (example for enrich queue)
-- Manual: use the payload to reconstruct the BullMQ job
```

After resolving the root cause (e.g. fixed an API key), you can replay by re-enqueuing jobs. A future improvement would add a `/api/dead-letters/replay` endpoint.

## Rotating the IG access token

Long-lived Facebook User tokens last ~60 days and **cannot be exchanged once expired**. Refresh while the token is still valid:

1. Visit `https://developers.facebook.com/tools/debug/accesstoken/` with the current token.
2. Use the token debugger to exchange for a new long-lived token.
3. Update the `IG_ACCESS_TOKEN` environment variable on both Railway services.
4. Trigger a deploy.

If the token does expire:
- The worker logs a 401 error and the circuit breaker opens.
- The `accounts` table status flips to `token_expired`.
- The Settings page shows a "Reconnect" action (H3 pending — the re-auth flow is a human task).

## Viewing logs

```bash
# Railway dashboard → service → Logs
# Structured pino logs: filter by service, jobId, accountId
```

Key log patterns:
- `"worker up — all queues, consumers, and schedules registered"` — boot success
- `"enrichment written"` — successful score
- `"daily LLM budget exhausted — lexicon fallback"` — within-budget operation
- `"alert fired"` — alert evaluation triggered
- `"retention purge complete"` — daily cleanup ran
- `"failed to park dead letter"` — something went very wrong

## Alert rules

Two kinds:

| Rule | Condition | Default params |
|---|---|---|
| `volume_spike` | 24h mentions ≥ `mult` × trailing 7-day avg AND ≥ `min` events | `mult=2, min=10, cool=6h` |
| `negative_share` | Negative ≥ `share`% of 24h AND ≥ `min` events | `share=30, min=5, cool=6h` |

Both respect a per-rule cooldown (default 6h, configurable via `cool` param). When `SLACK_WEBHOOK_URL` is not set, alerts are recorded in the `alerts` table but not delivered.

## Data retention

`mention_events` (and their `enrichments` via FK cascade) older than `RETENTION_DAYS` (default 90) are deleted daily at 03:00 UTC by the `retention:purge` job. This satisfies Meta platform terms and GDPR-like obligations.

## Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| No mentions appearing | IG token expired or missing | Rotate token, check `IG_ACCESS_TOKEN` |
| Enrichment all `method: lexicon` | `ANTHROPIC_API_KEY` missing or daily budget exhausted | Check env var or wait for budget reset |
| `dead_letters` growing | Downstream API issue (Anthropic, IG, Slack) | Check logs, resolve the API issue, replay |
| Webhook returning 401 | `IG_APP_SECRET` mismatch | Verify the Meta dashboard webhook config |
| Alerts not firing | No enabled rules or no aggregate data | Check `alert_rules` table, verify `daily_aggregates` has data |
| Dashboard empty | Demo mode off with no real IG data | Set `DEMO_MODE=true` |

## Local dev quickstart

```bash
pnpm install
docker compose up -d          # postgres:16 on 54329 + redis:7 on 6379
pnpm --filter @petal/web dev  # http://localhost:3000
pnpm --filter @petal/worker dev  # start the worker, connecting to the same Postgres/Redis

# Run all checks
pnpm check

# Run a specific package's tests
pnpm --filter @petal/worker test
pnpm --filter @petal/db test   # needs PETAL_TEST_PG_URL; docker compose must be up
```

Test databases are auto-created with names like `petal_test_worker`, `petal_test_worker_alert`, etc. Each integration suite uses its own database so parallel runs don't race.
