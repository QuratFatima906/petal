# Petal

Instagram listening and sentiment dashboard. A Next.js web app (dashboard, query API, webhook receiver) plus — in later work packages — a Node worker for polling, AI enrichment, aggregation and alerts, backed by Postgres and Redis.

pnpm monorepo: `apps/web` (Next.js App Router, Tailwind v4), `apps/worker` (BullMQ), `e2e` (Playwright), `packages/*` (shared contracts, database, Instagram client, AI enrichment, fixtures).

## Quick start

```bash
pnpm install
docker compose up -d          # postgres:16 + redis:7
pnpm --filter @petal/web dev  # http://localhost:3000
pnpm check                    # turbo run typecheck + lint + test
```

Full run-level procedures in [docs/runbook.md](docs/runbook.md).

## Deploy to Railway (demo mode)

The web app ships as a Docker image built from `Dockerfile.web`; `railway.json` at the repo root tells Railway how to build and health-check it.

1. **Create a project** — in the [Railway dashboard](https://railway.com), create a new project.
2. **Connect the GitHub repo** — add a service from this repository. Railway picks up `railway.json` and builds with `Dockerfile.web` automatically.
3. **Set environment variables** on the service:
   - `DEMO_MODE=true` — runs the dashboard on seeded demo data, no Meta calls.
   - `APP_URL=https://<your-service>.up.railway.app` — the service's public URL.
4. **Deploy** — trigger a deploy (or push to the connected branch). Railway health-checks `/api/health` before routing traffic; the container restarts on failure.
5. **Verify** — `curl https://<your-service>.up.railway.app/api/health` should return:

   ```json
   { "data": { "status": "ok", "version": "0.1.0", "demoMode": true } }
   ```

> **Note:** Full operations runbook in [docs/runbook.md](docs/runbook.md) — covers dead-letter replay, token rotation, alert rules, retention, and common failure modes.
