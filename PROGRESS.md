
# Progress

WP0 2026-07-20 done — pnpm workspace + Next.js (App Router, Tailwind v4) scaffold, tsconfig.base.json per plan 5.1; turbo pipeline (`pnpm check` = typecheck+lint+test), typescript-eslint strict with plan 5.8 rules, Prettier, vitest wired, docker-compose (postgres:16 + redis:7), CI running check + e2e
WP1 2026-07-20 done — @petal/core (zod schemas + inferred types for mention events/enrichments/API contracts, env loader, branded IDs, Result, typed errors, assertNever) and @petal/fixtures (80-event Omahi dataset incl. 16 Roman Urdu entries, recorded Meta v23.0 shapes pending docs/meta-api-verify.md, idempotent seeder); contracts now frozen per plan §0
WP8 2026-07-20 done — all five dashboard screens + mention detail sheet + insights rails on inline demo data, matching docs/design/petal-dashboard.dc.html; Connect screen (S7), loading/empty/error states, and Playwright e2e (5 specs) in e2e/
WP10 2026-07-20 partial — web deployable to Railway in demo mode (health route, Dockerfile.web, railway.json, runbook); worker/migrations/observability pending
VERIFY 2026-07-20 done — Meta API research in docs/meta-api-verify.md; 5 items confirmed, 4 changed, 0 unverifiable
WP3 2026-07-21 done — @petal/ig typed Graph client pinned v25.0 (media/comments+replies, mentioned_media+mentioned_comment per-ID hydration, /tags, business discovery, media+account insights incl. demographics via views not impressions, hashtag search+recent_media, token exchange, page→IG id); two-class token-bucket limiter (BUC vs Platform), backoff+jitter honoring retryAfterMs, circuit breaker with state reporting, cursor pagination helper, zod at every boundary, AbortSignal+10s timeout; 51 msw-backed tests, zero real network; meta-shapes.ts re-recorded v23.0→v25.0
