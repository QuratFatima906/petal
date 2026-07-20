# Meta / Instagram Graph API — VERIFY resolution

Research pass against developers.facebook.com resolving every **VERIFY** item in `docs/petal-plan.md` (sections 6, 7, 13, 14, Appendix A). All items checked **2026-07-20**.

Confidence levels: **confirmed** (stated explicitly in current Meta docs) · **docs ambiguous** (docs silent or indirect; conclusion inferred) · **could not verify**.

## Summary table

| # | Plan VERIFY item | Verdict |
|---|---|---|
| 1 | API version pin (plan drafted against v23.0) | **changed** — latest is v25.0 (2026-02-18); pin `v25.0` |
| 2 | Webhook hub challenge params + `X-Hub-Signature-256` scheme | **confirmed** |
| 3 | IG webhook subscription fields; deletion signals in payloads | **confirmed** (fields) / no deletion signals exist (docs ambiguous) — poll reconciliation must mirror deletions |
| 4 | Endpoint paths/fields/pagination | **changed** — `mentioned_media` / `mentioned_comment` are field expansions, not pollable list edges; `impressions` insights metric deprecated; comments not filterable by timestamp |
| 5 | Hashtag media omit author username | **confirmed** — `username` cannot be requested on `recent_media` |
| 6 | Hashtag query limit ~30 unique / rolling 7 days | **confirmed** — exactly 30 |
| 7 | Rate limits: BUC 4800 × impressions; "200 calls/hour per app" | **changed** — BUC formula confirmed; platform limit is 200 × daily active users per hour, not a flat 200/hour; business_discovery + hashtag search are Platform-limited, everything else BUC |
| 8 | Token model: Page token, ~60-day long-lived, refresh | **changed** — endpoints take a Facebook **User** access token, not a Page token; 60-day lifetime confirmed; expired tokens cannot be exchanged |
| 9 | Platform terms retention/deletion obligations | **confirmed** — delete on user request, disconnection, Meta request, or when no longer needed |

**Counts: 5 confirmed · 4 changed · 0 unverifiable.**

---

## 1. Graph API version to pin

**Finding.** The latest stable Graph API version is **v25.0**, released 2026-02-18. The plan was drafted against v23.0 (released 2025-05-29), which is no longer current. The official versions page lists v22.0–v25.0 with expiration dates still "TBD"; historically Graph API versions live ~2–3 years after release (e.g. v20.0: 2024-05-21 → expires 2026-09-24, v19.0 expires 2026-05-21). Third-party sources report aggressive 2026 sunsets for *Marketing API* versions — those have a shorter lifecycle and do not govern the Graph API endpoints Petal uses.

**Decision.** Pin `v25.0` in the `packages/ig` version constant. With a ~2-year lifecycle this is safe until roughly early 2028; re-check at each Meta release (roughly quarterly).

- URLs: https://developers.facebook.com/docs/graph-api/changelog/ · https://developers.facebook.com/docs/graph-api/changelog/versions/
- Date checked: 2026-07-20 · Confidence: **confirmed** (latest version and release date; expiry dates are TBD in docs)

## 2. Webhook verification and signature scheme

**Finding.** Exactly as the plan assumed.

- Verification (GET): Meta sends `hub.mode=subscribe`, `hub.verify_token=<your configured token>`, `hub.challenge=<value>`. The endpoint must check `hub.verify_token` equals `IG_WEBHOOK_VERIFY_TOKEN` and respond with the `hub.challenge` value (respond 403 otherwise).
- Payload signature (POST): header `X-Hub-Signature-256`, value format `sha256=<hex digest>`, where the digest is **HMAC-SHA256 keyed with the App Secret, computed over the raw request body**. Compare in constant time after stripping the `sha256=` prefix. Docs call validation "optional but recommended" — Petal treats it as mandatory (WP4 spec stands).

- URL: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- Date checked: 2026-07-20 · Confidence: **confirmed**

## 3. Instagram webhook fields and deletion signals

**Finding.** Available Instagram subscription fields: `comments`, `live_comments`, `mentions`, `message_echoes`, `message_reactions`, `messages`, `messaging_handover`, `messaging_optins`, `messaging_policy_enforcement`, `messaging_postbacks`, `messaging_referral`, `messaging_seen`, `response_feedback`, `standby`, `story_insights`.

Petal-relevant payloads (examples page):

- `comments` (Business/Instagram Login): `value` carries `from.{id,username}`, `text`, `media.{id, media_product_type, ...}`, `parent_id` (when a reply), and the comment id. Note: under Business Login, @mentions arrive inside `comments` notifications rather than a separate `mentions` event.
- `mentions` (Facebook Login): `value` carries only `media_id` (caption mention) or `comment_id` + `media_id` (comment mention) — content must be fetched via `mentioned_media` / `mentioned_comment` (see item 4).

Caveats found:

- **Advanced Access is required to receive `comments` and `live_comments` webhook notifications** — i.e. App Review, even for the owned lane. The plan's assumption that all owned-lane webhooks work in dev mode needs softening; pollers carry the load until Advanced Access is granted.
- The account that owns the media must be **public** to receive comment/@mention notifications, and no webhooks fire when the mentioning media's author is a private account.

**Deletions.** No webhook example or field anywhere in the Instagram webhooks docs signals deletion of a comment or media. There is no `deleted`/`remove` verb equivalent (unlike Facebook Page `feed` webhooks). Conclusion: deletions are **not** pushed; mirroring them requires the poll lane to notice disappearance (or a 404/error when re-fetching). Given Platform Terms (item 9), retention + poll reconciliation is the deletion-mirroring mechanism.

- URLs: https://developers.facebook.com/docs/instagram-platform/webhooks · https://developers.facebook.com/docs/instagram-platform/webhooks/examples/
- Date checked: 2026-07-20 · Confidence: fields **confirmed**; absence of deletion signals **docs ambiguous** (absence in docs, not an explicit statement)

## 4. Endpoint surface, fields, pagination

All checked on the current Instagram Platform reference (v25.0 sample requests). Permissions below are the Facebook-Login-for-Business path Petal uses.

| Endpoint | Status | Notes |
|---|---|---|
| `GET /{ig-user-id}/media` | confirmed | ≤10K most recent media; supports `since`/`until` (time-based) plus standard cursor paging; stories excluded (separate `/stories` edge). Perms: `instagram_basic` + `pages_read_engagement` or `pages_show_list`. |
| `GET /{ig-media-id}/comments` | confirmed, caveats | Max **50 comments per query**, reverse-chronological, **cannot filter by timestamp**, top-level only (expand `replies` for nesting). `POST .../comments?message=` works for the v2 reply feature. Perms: `instagram_basic`, `instagram_manage_comments`. |
| `GET /{ig-comment-id}/replies` | confirmed | Returns `id`, `text`, `timestamp`; replies to deleted comments unavailable. `POST` replies attach to the top-level parent. |
| `mentioned_media` | **changed** | Not a list edge. Shape: `GET /{ig-user-id}?fields=mentioned_media.media_id({media-id}){caption,comments_count,...}` — requires a media id already known from a webhook. **Cannot be polled for discovery.** Mentions on Stories not supported; `@` is stripped from captions unless the app user owns the media. |
| `mentioned_comment` | **changed** | Same pattern: `GET /{ig-user-id}?fields=mentioned_comment.comment_id({comment-id}){text,timestamp,like_count,media}`. Errors if comments are disabled on the media. |
| `GET /{ig-user-id}/tags` | confirmed | Cursor-paginated (`before`/`after` only, no `next` links — build URLs manually). Private media excluded. Perms: `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement`. |
| `GET /{ig-media-id}/insights` | confirmed, metric churn | `impressions` deprecated for media created after 2024-07-02 → use `views` (and `reach`, `likes`, `comments`, `shares`, `saved`, `total_interactions`, reel watch-time metrics). Data delayed up to 48h; metrics with <5 views return error code 10. |
| `GET /{ig-user-id}/insights` | confirmed, metric churn | `impressions` **removed 2025-04-21** → `views`. Current metrics: `reach`, `views`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`, `saves`, `replies`, `follows_and_unfollows`, `profile_links_taps`; demographics via `follower_demographics` / `engaged_audience_demographics` (require `timeframe`, ≥100 engaged accounts, top-45 rows only). Plan's `audience_gender_age`/`audience_city` are gone — replaced by the demographics metrics with `breakdown`. |
| `business_discovery` | confirmed | `GET /{ig-user-id}?fields=business_discovery.username({username}){followers_count,media_count,media{...}}`; media sub-edge cursor-paginated. Perms: `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`. Age-gated accounts return nothing. |
| `GET /ig_hashtag_search?user_id=&q=` | confirmed — still exists | Requires **Instagram Public Content Access** feature (App Review / Advanced Access). Returns a static, app-independent hashtag id. Sensitive/offensive hashtags return a generic error. |
| `GET /{ig-hashtag-id}/recent_media?user_id=` | confirmed — still exists | Only media published within **24 hours** of the query; public media only; ≤50 results/page; `after` cursor only; ordering not guaranteed chronological; requires Instagram Public Content Access. (There is also a `top_media` edge.) The plan's "sources conflict on whether this still exists in 2026" is resolved: it is live and documented under v25.0. |

**Consequence for WP5 (pollers):** caption/comment mentions cannot be discovered by polling — the `mentions` webhook is the *only* discovery lane; `mentioned_media`/`mentioned_comment` are hydration calls per webhook event. The `/tags` edge is the closest pollable proxy (tagged media only, not caption @mentions). Comment polling must paginate from newest and stop at already-seen IDs (no `since` filter).

- URLs: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media · .../ig-media/comments · .../ig-comment/replies · .../ig-user/mentioned_media · .../ig-user/mentioned_comment · .../ig-user/tags · .../ig-media/insights · .../ig-user/insights · .../ig-user/business_discovery · .../ig-hashtag-search · https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media/
- Date checked: 2026-07-20 · Confidence: **confirmed** (each row read from its current reference page)

## 5. Author username on hashtag media

**Finding.** Explicit in docs: "You cannot request the `username` field on returned media objects" on `/{ig-hashtag-id}/recent_media`. `caption` is available. The plan's nullable `author_username` column and the "Public post" UI fallback (L6) are correct and required.

- URL: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media/
- Date checked: 2026-07-20 · Confidence: **confirmed**

## 6. Hashtag query limit

**Finding.** "You can query a maximum of **30 unique hashtags within a 7 day period**" (rolling; a queried hashtag counts against the window even after you stop querying it). Stated on both `ig_hashtag_search` and `recent_media` pages. Plan value (~30) is exact.

- URL: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search
- Date checked: 2026-07-20 · Confidence: **confirmed**

## 7. Rate limits and limiter classes

**Finding.**

- **BUC (Business Use Case) limits** govern Instagram Platform requests. Formula for an IG professional account: **`calls within 24 hours = 4800 × number of impressions`**, where impressions = times the account's content entered screens in the trailing 24h. Rolling window; usage reported in the `X-Business-Use-Case-Usage` response header (`call_count`, `total_cputime`, `total_time` as percentages). Plan's formula is confirmed — and the corollary stands: a fresh, quiet account (@omahi.app) has a near-zero budget, so the limiter must survive tiny budgets and lean on webhooks.
- **Platform limits** (app-level): **200 × daily active users per rolling hour** — *not* a flat "200 calls/hour per app" as the plan's Appendix A phrased it. Usage in the `X-App-Usage` header.
- **Limiter classes per endpoint:** `business_discovery` and Hashtag Search (`ig_hashtag_search`, hashtag media edges) are explicitly under **Platform** rate limits; all other IG endpoints Petal uses (media, comments, replies, mentions hydration, tags, insights) are under **BUC** limits keyed to the professional account. This matches the plan's two-bucket limiter design in section 13.
- Instagram **messaging** has separate limits (not used by Petal v1): e.g. private replies to post/reel comments 750 calls/hour per account.

- URL: https://developers.facebook.com/docs/graph-api/overview/rate-limiting/
- Date checked: 2026-07-20 · Confidence: **confirmed** (formulas and class assignment are explicit in docs)

## 8. Token model and lifetimes

**Finding.**

- **Token type:** every IG Graph API reference page Petal uses (media, comments, mentions, tags, insights, business_discovery, hashtag search) specifies a **Facebook User access token** — not a Page access token. The plan's Appendix A claim that calls "typically use a Page access token" is wrong for this API surface; Page tokens matter for Pages API/messaging. The IG business account id is still resolved via the linked Page: `GET /{page-id}?fields=instagram_business_account` (or `GET /me/accounts` → page → that field).
- **Long-lived user tokens:** exchange a short-lived token via `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...`; lifetime **about 60 days** (confirmed). Response carries `expires_in`.
- **Refresh mechanics:** long-lived user tokens can be exchanged again for a fresh 60-day token *while still valid*. **An expired token cannot be exchanged** — "You can not use an expired token to request a long-lived token"; the user must re-authenticate. So WP3's refresh job before day 60 is mandatory, and expiry ⇒ `status: "token_expired"` + Reconnect UI is the correct recovery path (revocation similarly invalidates the token and everything derived from it).
- **Long-lived Page tokens** (if ever needed) have **no expiration date**; they die only when the underlying user token is invalidated, the user's password changes, permissions are revoked, etc.
- **Alternative path:** the newer "Instagram API with Instagram Login" (Business Login) needs no Facebook Page and uses Instagram User access tokens (also 60-day long-lived, refreshable via `refresh_access_token`), but it **lacks hashtag search and business discovery** — Petal's plan correctly stays on the Facebook Login path.

- URLs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/ · https://developers.facebook.com/docs/instagram-platform/
- Date checked: 2026-07-20 · Confidence: **confirmed**

## 9. Platform Terms — retention and deletion

**Finding.** Meta Platform Terms (section on data deletion) require deleting Platform Data "as soon as reasonably possible" when: (a) the **user requests deletion** or their account is terminated/disconnected — unless the data is aggregated/de-identified beyond association with a user; (b) you **stop operating** the product that acquired the data; (c) **Meta requests** deletion for user protection (their sole discretion); (d) retention is **no longer necessary for a legitimate business purpose** consistent with the Terms; (e) **law requires** it. No fixed day-count is imposed; developers must retain proof of any legal basis for continued retention.

**Implication for Petal:** storing comments/mentions (Platform Data) is permitted for the listening use case, but the section 13 controls are obligations, not niceties: the `retention` job (90-day default) implements "no longer necessary", "Delete all data" in Settings implements disconnection/user-request deletion, and since webhooks never signal comment deletion (item 3), the poll lane should treat re-fetch 404s/disappearance as deletion and remove mirrored rows.

- URL: https://developers.facebook.com/terms/
- Date checked: 2026-07-20 · Confidence: **confirmed**

---

## Changes required to the plan

1. **Pin `v25.0`, not v23.0** (Appendix A / WP3): update the version constant and the fixture-recording comment in WP1. Re-verify at each quarterly Meta release.
2. **Rewrite the mentions polling design (WP5, Appendix A):** `mentioned_media` / `mentioned_comment` are per-ID field expansions on `/{ig-user-id}`, not list edges. There is no way to poll for undiscovered caption/comment mentions — the `mentions` webhook is the sole discovery lane; the poller can only re-hydrate known mention ids and poll `/tags` for tagged media. Downgrade the plan's "polling reconciles missed mentions" claim to comments/owned-media only, and treat missed mention webhooks as an accepted gap (add to the limitations register).
3. **Comments poller must not assume time filtering:** `/comments` returns ≤50 per query, reverse-chronological, and "comments cannot be filtered by timestamp". Watermarks must be implemented as "paginate newest-first until an already-seen comment id", not `since=`.
4. **Advanced Access is required for `comments` webhooks** (and the owning account must be public). Section on WP4/H4 should note that in dev mode, comment ingestion may be poller-only until App Review grants Advanced Access; the webhook lane is not guaranteed pre-review.
5. **Insights metrics (WP3, S1):** replace `impressions` with `views` everywhere (account metric removed 2025-04-21; media metric deprecated for media after 2024-07-02). Replace `audience_gender_age`/`audience_city` with `follower_demographics`/`engaged_audience_demographics` + `breakdown`, noting the ≥100-engagement threshold.
6. **Token model (Appendix A, H3):** calls use a long-lived Facebook **User** access token, not a Page token. Keep the `/{page-id}?fields=instagram_business_account` id resolution. Refresh job must run while the token is still valid — an expired token cannot be exchanged.
7. **Rate limiter constants (section 13):** BUC bucket = `4800 × impressions / 24h` per IG account (confirmed); Platform bucket for business_discovery + hashtag search = derived from `200 × DAU/hour` app-level budget — correct Appendix A's flat "200 calls/hour" phrasing. Cite `X-Business-Use-Case-Usage` and `X-App-Usage` headers for adaptive throttling.
8. **Deletion mirroring (section 13):** webhooks carry no deletion signals; implement deletion detection in the poll lane (404/disappearance ⇒ delete mirrored row) to honor Platform Terms.
9. **Hashtag lane (S4, L3, L6):** unchanged and buildable post-App-Review — endpoints live, 30-unique/7-day limit exact, `username` unavailable, and note the **24-hour recency window** on `recent_media` (hourly polling is comfortably sufficient; no backfill possible, as the plan assumed).
