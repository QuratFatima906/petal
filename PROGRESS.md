
# Progress

WP0 2026-07-20 done — pnpm workspace + Next.js (App Router, Tailwind v4) scaffold, tsconfig.base.json per plan 5.1; turbo pipeline (`pnpm check` = typecheck+lint+test), typescript-eslint strict with plan 5.8 rules, Prettier, vitest wired, docker-compose (postgres:16 + redis:7), CI running check + e2e
WP1 2026-07-20 done — @petal/core (zod schemas + inferred types for mention events/enrichments/API contracts, env loader, branded IDs, Result, typed errors, assertNever) and @petal/fixtures (80-event Omahi dataset incl. 16 Roman Urdu entries, recorded Meta v23.0 shapes pending docs/meta-api-verify.md, idempotent seeder); contracts now frozen per plan §0
WP8 2026-07-20 done — all five dashboard screens + mention detail sheet + insights rails on inline demo data, matching docs/design/petal-dashboard.dc.html; Connect screen (S7), loading/empty/error states, and Playwright e2e (5 specs) in e2e/
WP10 2026-07-20 partial — web deployable to Railway in demo mode (health route, Dockerfile.web, railway.json, runbook); worker/migrations/observability pending
VERIFY 2026-07-20 done — Meta API research in docs/meta-api-verify.md; 5 items confirmed, 4 changed, 0 unverifiable
WEB-FIXTURES 2026-07-21 done — apps/web demo data now derived from @petal/fixtures buildFixtureEvents (80 events) + deterministic demo enrichment table; overview stats/pulse/intent/top-posts/hashtag volumes computed from the dataset at a fixed demo clock; e2e assertions recomputed from the same aggregation code (310→50 weekly mentions, "14 mentions · 2 negative"→"80 mentions · 9 negative"), all 5 specs green
