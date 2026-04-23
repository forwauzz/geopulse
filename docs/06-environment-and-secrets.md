# Environment And Secrets

This document captures the environment contract required to run GEO-Pulse locally and in Cloudflare Workers.

## Runtime split

There are three practical runtime contexts:
1. Next.js local development
2. Local Worker-compatible development via `.dev.vars`
3. Cloudflare deployed runtime via `wrangler.jsonc` vars + `wrangler secret put`

## Deploy persistence

Cloudflare production config should be treated in two buckets:

1. `wrangler.jsonc` `vars`
- these are plain-text runtime values committed in repo
- they deploy with the Worker config
- you do not need to re-add them after every deploy
- you only change them when you intentionally edit config

2. Cloudflare secrets
- these are stored in Cloudflare, not in git
- set them once with `wrangler secret put` or in the Cloudflare dashboard
- they persist across deploys
- you do not need to re-add them after every push unless you rotate them

Important:
- do not keep optional or environment-specific vars as empty strings in `wrangler.jsonc`
- if a value is intentionally managed in the Cloudflare dashboard, omit it from `wrangler.jsonc` rather than setting it to `""`
- otherwise a deploy can reapply the empty value and create confusing runtime drift
- this is especially relevant for:
  - `DEEP_AUDIT_INTERNAL_REWRITE_MODEL`
  - `BENCHMARK_SCHEDULE_QUERY_SET_ID`
  - `MARKETING_REPORT_TO`

## Public non-secret config

These values are safe to expose to the client or bundle into worker config.

Required:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `DISTRIBUTION_ENGINE_UI_ENABLED`
- `DISTRIBUTION_ENGINE_WRITE_ENABLED`
- `DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED`
- `DISTRIBUTION_ENGINE_BACKGROUND_ENABLED`
- `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT`
- `STRIPE_PRICE_ID_DEEP_AUDIT`
- `DEEP_AUDIT_R2_PUBLIC_BASE`
- `DEEP_AUDIT_DEFAULT_PAGE_LIMIT`
- `DEEP_AUDIT_BROWSER_RENDER_MODE`
- `RESEND_FROM_EMAIL`
- `GEMINI_MODEL`
- `GEMINI_ENDPOINT`
- `BENCHMARK_EXECUTION_PROVIDER`
- `BENCHMARK_EXECUTION_MODEL`
- `BENCHMARK_EXECUTION_ENABLED_MODELS`
- `BENCHMARK_EXECUTION_ENDPOINT`
- `BENCHMARK_SCHEDULE_ENABLED`
- `BENCHMARK_SCHEDULE_QUERY_SET_ID`
- `BENCHMARK_SCHEDULE_MODEL_ID`
- `BENCHMARK_SCHEDULE_RUN_MODES`
- `BENCHMARK_SCHEDULE_VERTICAL`
- `BENCHMARK_SCHEDULE_SEED_PRIORITIES`
- `BENCHMARK_SCHEDULE_DOMAINS`
- `BENCHMARK_SCHEDULE_DOMAIN_LIMIT`
- `BENCHMARK_SCHEDULE_MAX_RUNS`
- `BENCHMARK_SCHEDULE_MAX_FAILURES`
- `BENCHMARK_SCHEDULE_WINDOW_HOURS`
- `BENCHMARK_SCHEDULE_VERSION`
- optional: `DEEP_AUDIT_INTERNAL_REWRITE_ENABLED`
- optional: `DEEP_AUDIT_INTERNAL_REWRITE_MODEL`
- optional: `MARKETING_REPORT_TO`
- optional: `GHOST_ADMIN_API_VERSION`
- optional: `X_API_BASE_URL`
- optional: `LINKEDIN_API_BASE_URL`
- optional: `X_OAUTH_SCOPE`
- optional: `X_OAUTH_AUTH_URL`
- optional: `X_OAUTH_TOKEN_URL`
- optional: `LINKEDIN_OAUTH_SCOPE`
- optional: `LINKEDIN_OAUTH_AUTH_URL`
- optional: `LINKEDIN_OAUTH_TOKEN_URL`
- optional: `OPENAI_MODEL` (default: `gpt-4o-mini`) — used when `BENCHMARK_EXECUTION_PROVIDER=openai` or `multi`
- optional: `OPENAI_ENDPOINT` (default: `https://api.openai.com/v1/chat/completions`)
- optional: `PERPLEXITY_MODEL` (default: `llama-3.1-sonar-small-128k-online`) — used when `BENCHMARK_EXECUTION_PROVIDER=perplexity` or `multi`
- optional: `PERPLEXITY_ENDPOINT` (default: `https://api.perplexity.ai/chat/completions`)

Source of truth:
- `wrangler.jsonc`
- `.env.local.example`
- `.dev.vars.example`

## Required secrets

These must never be committed.

Core app secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `BENCHMARK_EXECUTION_API_KEY`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `OPENAI_API_KEY` — required when `BENCHMARK_EXECUTION_PROVIDER=openai` or `multi`
- `PERPLEXITY_API_KEY` — required when `BENCHMARK_EXECUTION_PROVIDER=perplexity` or `multi`

Conditional secrets:
- `KIT_API_KEY`
- `BUTTONDOWN_API_KEY`
- `GHOST_ADMIN_API_URL`
- `GHOST_ADMIN_API_KEY`
- `X_ACCESS_TOKEN`
- `LINKEDIN_ACCESS_TOKEN`
- `LINKEDIN_AUTHOR_URN`
- `X_OAUTH_CLIENT_ID`
- `X_OAUTH_CLIENT_SECRET`
- `LINKEDIN_OAUTH_CLIENT_ID`
- `LINKEDIN_OAUTH_CLIENT_SECRET`
- `RECONCILE_SECRET`
- `BROWSER_RENDERING_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `MARKETING_REPORT_TO`

Browser Rendering note:
- `BROWSER_RENDERING_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are only required when `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`.
- If render mode is `off`, deep audits use the standard fetch-based crawl only.

## Local setup

### `.env.local`
Used by local Next.js commands such as:
- `npm run dev`
- `npm run build`
- `npm run eval:smoke`

Recommended minimum local keys:
- public Supabase values
- `SUPABASE_SERVICE_ROLE_KEY`
- Stripe keys for checkout/webhooks if testing payments
- Gemini key if testing LLM-backed checks
- Resend key if testing email delivery
- Browser Rendering secrets only if testing SPA fallback

### `.dev.vars`
Used by Worker-oriented local flows.

Recommended contents mirror `.dev.vars.example` and should include:
- all public config needed by the worker
- all required worker secrets
- optional Browser Rendering credentials if `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`

## Config loaders in code

Preferred server-side env access:
- `lib/server/cf-env.ts`

Important rule:
- use the shared env loader rather than reaching for raw `process.env` in Worker-sensitive codepaths
- recent fixes on admin pages were specifically to avoid drift here

## Database dependencies

The active Supabase project must include migrations already used by the app, including:
- base scan tables
- queue/report state
- marketing attribution tables/views
- retrieval eval foundation tables

If a page says `Could not load analytics`, first verify the active DB has the attribution migrations.

## Minimum env sets by feature

### Free scan
- Supabase URL + anon key
- service role key
- Turnstile site + secret
- Gemini key

### Paid deep audit
- all free scan env
- Stripe price + secret + webhook secret
- Resend API key
- `RESEND_FROM_EMAIL`
- R2 bucket binding + public base URL

### Browser Rendering fallback
- all paid deep audit env
- `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`
- `BROWSER_RENDERING_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Admin evals
- Supabase URL

### Content machine destinations
- content admin/editor pages still use the shared server-side env loader in `lib/server/cf-env.ts`
- the first real destination adapter is Kit, so draft pushes from `/dashboard/content/[contentId]` require:
  - `KIT_API_KEY`
- the Ghost adapter requires:
  - `GHOST_ADMIN_API_URL`
  - `GHOST_ADMIN_API_KEY`
  - optional: `GHOST_ADMIN_API_VERSION`
- the first text-first social adapters are X and LinkedIn, so social draft/publish pushes require:
  - `X_ACCESS_TOKEN`
  - optional: `X_API_BASE_URL`
  - `LINKEDIN_ACCESS_TOKEN`
  - `LINKEDIN_AUTHOR_URN`
  - optional: `LINKEDIN_API_BASE_URL`
- current behavior:
  - GEO-Pulse converts the stored markdown into simple HTML
  - pushes a draft broadcast to Kit via API
  - pushes a draft post to Ghost via the Ghost Admin API
  - pushes text-first posts to X and LinkedIn when the social env credentials are configured
  - stores the downstream delivery record in `content_distribution_deliveries`
  - resolves destination readiness in admin from both feature flags and provider env such as `KIT_API_KEY` and Ghost Admin credentials
  - writes push lifecycle events into `app_logs`, visible at `/dashboard/logs`
- current non-goals:
  - no auto-send to subscribers
  - no provider-side connectivity or send-permission probe yet
  - no broad multi-provider OAuth refresh lifecycle yet (first X refresh handling is shipped)

### Distribution engine admin shell
- the generalized distribution-engine admin page at `/dashboard/distribution` is gated by:
  - `DISTRIBUTION_ENGINE_UI_ENABLED=true` for the read-only shell
  - `DISTRIBUTION_ENGINE_WRITE_ENABLED=true` for writable account / asset / job controls
  - `DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED=true` for provider OAuth connect controls
- the first background dispatch lane is separately gated by:
  - `DISTRIBUTION_ENGINE_BACKGROUND_ENABLED=true` to let the Worker cron process due jobs
  - `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT` to cap one cron sweep
- recommended default:
  - keep all three distribution-engine flags `false` in production until the new control plane and background runtime are intentionally exposed
- current behavior:
  - `UI=false` hides the nav entry and returns a feature-flag-off message on the route
  - `UI=true` and `WRITE=false` exposes the read-only shell only
  - `UI=true` and `WRITE=true` exposes the writable admin forms too
  - `BACKGROUND=true` still does nothing unless both `UI=true` and `WRITE=true` are also set
  - when the background lane is enabled, the existing Worker cron enqueues at most `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT` due jobs into `DISTRIBUTION_QUEUE`
  - a dedicated Worker queue consumer then processes those jobs with provider-aware retry decisions
  - retryable provider failures move the job back to `queued` / `scheduled` so Queue retry can re-attempt it
  - permanent failures are acked without retry, and DLQ-exhausted jobs are explicitly marked `failed`
  - the writable admin shell now also supports manual token storage and account-status updates for generalized distribution accounts
  - current truth: this token surface is the first control-plane foundation only; the shipped newsletter adapters still read provider credentials from env today

### Internal benchmarks
- Supabase URL + service role key
- `BENCHMARK_EXECUTION_PROVIDER=gemini` only if you want live benchmark execution
- `BENCHMARK_EXECUTION_MODEL` is the default enabled model lane shown first in admin
- `BENCHMARK_EXECUTION_ENABLED_MODELS` optionally enables multiple comma-separated model lanes on the same provider/key/endpoint
- if `BENCHMARK_EXECUTION_ENABLED_MODELS` is unset, only the single `BENCHMARK_EXECUTION_MODEL` lane is live
- `BENCHMARK_EXECUTION_API_KEY` can be set explicitly, or the benchmark lane can fall back to `GEMINI_API_KEY`
- if benchmark execution vars are unset, the admin benchmark runner safely falls back to the stub adapter
- `BENCHMARK_SCHEDULE_ENABLED=true` only if you want the Worker cron to run recurring internal benchmark sweeps
- `BENCHMARK_SCHEDULE_QUERY_SET_ID` must point at the active benchmark query set used for the recurring lane
- `BENCHMARK_SCHEDULE_MODEL_ID` freezes the recurring model lane label so benchmark history stays comparable over time
- `BENCHMARK_SCHEDULE_RUN_MODES` optionally narrows the recurring sweep to `ungrounded_inference`, `grounded_site`, or both
- `BENCHMARK_SCHEDULE_VERTICAL` optionally freezes the recurring lane to one benchmark vertical such as `law_firms`
- `BENCHMARK_SCHEDULE_SEED_PRIORITIES` optionally narrows the recurring lane to explicit CSV seed priorities such as `1` or `1,2`
- `BENCHMARK_SCHEDULE_DOMAINS` optionally freezes the recurring lane to an explicit comma-separated canonical-domain allowlist
- `BENCHMARK_SCHEDULE_DOMAIN_LIMIT` keeps the recurring sweep bounded while the benchmark lane is still in the small-cohort stage
- `BENCHMARK_SCHEDULE_MAX_RUNS` hard-caps the total scheduled runs launched in one sweep so benchmark work stays isolated from customer paths
- `BENCHMARK_SCHEDULE_MAX_FAILURES` stops the sweep early after repeated failures and records the failure cap in structured logs
- `BENCHMARK_SCHEDULE_WINDOW_HOURS` controls schedule idempotency windows; use `12` for a twice-daily lane, keep `24` for once-daily
- `BENCHMARK_SCHEDULE_VERSION` gives the recurring lane an explicit operator version tag in run metadata
- the current Worker cron is twice daily (`0 0,12 * * *` UTC), so `BENCHMARK_SCHEDULE_WINDOW_HOURS=12` is the matching low-maintenance choice for the first recurring benchmark lane
- recommended production default:
  - keep `BENCHMARK_SCHEDULE_ENABLED=false` in config until the exact live query-set id is frozen
  - then enable it intentionally rather than silently inheriting an old schedule
- the repo now includes a repeatable query-set seed path for the first collection lane:
  - `npm run benchmark:seed:query-set`
  - default fixture: `eval/fixtures/benchmark-law-firms-p1-query-set.json`
- the repo now includes a repeatable schedule preview path before cron is enabled:
  - `npm run benchmark:schedule:preview`
  - it reads the current `BENCHMARK_SCHEDULE_*` env and prints the exact selected domains for that lane
- the repo now includes a one-shot scheduler execution path for proving the recurring lane without waiting for cron:
  - `npm run benchmark:schedule:run-now`
  - it uses the same `BENCHMARK_SCHEDULE_*` env and scheduler path as the Worker cron
  - optional: `-- --window-date YYYY-MM-DDTHH` to force one explicit window for controlled internal collection
- the repo now includes a one-shot scheduled-window review path:
  - `npm run benchmark:schedule:summary`
  - it summarizes the current configured window using the existing run-group and metric records
  - optional: `-- --window-date YYYY-MM-DDTHH` to inspect one completed window explicitly
- the repo now includes a one-shot outlier-selection path:
  - `npm run benchmark:schedule:outliers`
  - it ranks the biggest grounded winners and losers in the current configured window for manual lineage inspection
  - optional: `-- --window-date YYYY-MM-DDTHH` to target one completed window explicitly
- the repo now includes a small explicit multi-window recurrence path:
  - `npm run benchmark:schedule:recurrence -- --window-dates 2026-03-30T00,2026-03-30T12,2026-03-31T00`
  - it summarizes recurring winners and laggards across a chosen comparable window set on the current configured lane
- the repo now includes a run-diagnostic path for selected run-group ids:
  - `npm run benchmark:run:diagnostic -- --run-group-ids run-1,run-2`
  - it summarizes page-URL citations, domain-only citations, matched provenance, and overlap status before manual review
- service role key
- `platform_admin_users` table for platform-admin access
- optional local write tooling:
  - `npm run eval:smoke`
  - `npm run eval:promptfoo:write:report -- --site-url https://example.com`
  - `npm run eval:promptfoo:write:retrieval -- --site-url https://example.com`
  - `npm run eval:retrieval:write -- --site-url https://example.com`
  - `npm run report:layer-one:rewrite-prompt -- --report eval/fixtures/sample-deep-audit.md`
- optional internal rewritten-report generation:
  - `DEEP_AUDIT_INTERNAL_REWRITE_ENABLED=true`
  - optional model override: `DEEP_AUDIT_INTERNAL_REWRITE_MODEL=gemini-2.5-flash-lite`
  - this produces a best-effort internal rewritten markdown artifact and a second `layer_one_report` eval row after deterministic report generation

## Sanity checks

Before handing off to another team, verify:
1. `npm run type-check`
2. `npm run build`
3. `npm run eval:smoke`
4. admin eval page shows inserted row
5. retrieval drilldown opens when retrieval rows exist
6. report page can fetch markdown and PDF without CSP errors

## Turnstile troubleshooting

If landing-page scan fails before `/api/scan` with browser console errors from
`challenges.cloudflare.com` and `[Cloudflare Turnstile] Error: 110200`, treat it as
hostname mismatch for the configured site key.

Required checks:
1. In Cloudflare Turnstile widget settings, confirm allowed hostnames include every active frontend host:
- `getgeopulse.com`
- `www.getgeopulse.com` (if used)
- `geo-pulse.<account>.workers.dev` (if direct Workers URL is used)
- any preview/build hostname you actually test against
2. Confirm Worker/Public var `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is the site key from that same widget.
3. Confirm Worker secret `TURNSTILE_SECRET_KEY` belongs to the same widget pair.
4. Redeploy after changing public vars so the client bundle picks up the new site key.

Notes:
- `110200` is client-side domain rejection, not a backend `/api/scan` validation failure.
- `400020` generally indicates an invalid site key value.

## Current production checklist

To match the current repo/runtime features in Cloudflare production, make sure these are present:

### Plaintext vars in `wrangler.jsonc`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `DISTRIBUTION_ENGINE_UI_ENABLED`
- `DISTRIBUTION_ENGINE_WRITE_ENABLED`
- `DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED`
- `DISTRIBUTION_ENGINE_BACKGROUND_ENABLED`
- `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT`
- `STRIPE_PRICE_ID_DEEP_AUDIT`
- `GEMINI_MODEL`
- `GEMINI_ENDPOINT`
- `DEEP_AUDIT_R2_PUBLIC_BASE`
- `DEEP_AUDIT_DEFAULT_PAGE_LIMIT`
- `DEEP_AUDIT_BROWSER_RENDER_MODE`
- `DEEP_AUDIT_INTERNAL_REWRITE_ENABLED`
- `DEEP_AUDIT_INTERNAL_REWRITE_MODEL`
- `RESEND_FROM_EMAIL`
- `BENCHMARK_EXECUTION_PROVIDER`
- `BENCHMARK_EXECUTION_MODEL`
- `BENCHMARK_EXECUTION_ENABLED_MODELS`
- `BENCHMARK_EXECUTION_ENDPOINT`
- `BENCHMARK_SCHEDULE_ENABLED`
- `BENCHMARK_SCHEDULE_QUERY_SET_ID`
- `BENCHMARK_SCHEDULE_MODEL_ID`
- `BENCHMARK_SCHEDULE_RUN_MODES`
- `BENCHMARK_SCHEDULE_VERTICAL`
- `BENCHMARK_SCHEDULE_SEED_PRIORITIES`
- `BENCHMARK_SCHEDULE_DOMAINS`
- `BENCHMARK_SCHEDULE_DOMAIN_LIMIT`
- `BENCHMARK_SCHEDULE_MAX_RUNS`
- `BENCHMARK_SCHEDULE_MAX_FAILURES`
- `BENCHMARK_SCHEDULE_WINDOW_HOURS`
- `BENCHMARK_SCHEDULE_VERSION`
- optional: `MARKETING_REPORT_TO`
- optional: `GHOST_ADMIN_API_VERSION`
- optional: `X_API_BASE_URL`
- optional: `LINKEDIN_API_BASE_URL`
- optional: `X_OAUTH_SCOPE`
- optional: `X_OAUTH_AUTH_URL`
- optional: `X_OAUTH_TOKEN_URL`
- optional: `LINKEDIN_OAUTH_SCOPE`
- optional: `LINKEDIN_OAUTH_AUTH_URL`
- optional: `LINKEDIN_OAUTH_TOKEN_URL`

### Secrets stored in Cloudflare
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `BENCHMARK_EXECUTION_API_KEY`
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`
- optional: `KIT_API_KEY`
- optional: `BUTTONDOWN_API_KEY`
- optional: `GHOST_ADMIN_API_URL`
- optional: `GHOST_ADMIN_API_KEY`
- optional: `X_ACCESS_TOKEN`
- optional: `LINKEDIN_ACCESS_TOKEN`
- optional: `LINKEDIN_AUTHOR_URN`
- optional: `X_OAUTH_CLIENT_ID`
- optional: `X_OAUTH_CLIENT_SECRET`
- optional: `LINKEDIN_OAUTH_CLIENT_ID`
- optional: `LINKEDIN_OAUTH_CLIENT_SECRET`
- optional: `RECONCILE_SECRET`
- optional: `BROWSER_RENDERING_API_TOKEN`
- optional: `CLOUDFLARE_ACCOUNT_ID`
