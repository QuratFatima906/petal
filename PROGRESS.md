
# Progress

WP0 2026-07-20 done — pnpm workspace + Next.js (App Router, Tailwind v4) scaffold, tsconfig.base.json per plan 5.1; turbo pipeline (`pnpm check` = typecheck+lint+test), typescript-eslint strict with plan 5.8 rules, Prettier, vitest wired, docker-compose (postgres:16 + redis:7), CI running check + e2e
WP1 2026-07-20 done — @petal/core (zod schemas + inferred types for mention events/enrichments/API contracts, env loader, branded IDs, Result, typed errors, assertNever) and @petal/fixtures (80-event Omahi dataset incl. 16 Roman Urdu entries, recorded Meta v23.0 shapes pending docs/meta-api-verify.md, idempotent seeder); contracts now frozen per plan §0
WP8 2026-07-20 done — all five dashboard screens + mention detail sheet + insights rails on inline demo data, matching docs/design/petal-dashboard.dc.html; Connect screen (S7), loading/empty/error states, and Playwright e2e (5 specs) in e2e/
WP2 2026-07-21 done — @petal/db: Drizzle schema for all §6 tables + committed migration, repositories (upsertMentionEvent w/ inserted flag via xmax, keyset-cursor listMentions, recomputeDayAggregate, enrichment cache, dead letters, retention deletes, deletion mirroring helper), aes-256-gcm token crypto (key injected — env var for it is a pending core contract decision), fixtures seeder wired through real upsert; 11 integration tests vs dockerized Postgres (skip loudly when PG absent; PETAL_TEST_PG_URL override + turbo env passthrough added to turbo.json)
WP10 2026-07-20 partial — web deployable to Railway in demo mode (health route, Dockerfile.web, railway.json, runbook); worker/migrations/observability pending
VERIFY 2026-07-20 done — Meta API research in docs/meta-api-verify.md; 5 items confirmed, 4 changed, 0 unverifiable
