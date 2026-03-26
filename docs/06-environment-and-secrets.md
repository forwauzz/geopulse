# Environment And Secrets

This document captures the environment contract required to run GEO-Pulse locally and in Cloudflare Workers.

## Runtime split

There are three practical runtime contexts:
1. Next.js local development
2. Local Worker-compatible development via `.dev.vars`
3. Cloudflare deployed runtime via `wrangler.jsonc` vars + `wrangler secret put`

## Public non-secret config

These values are safe to expose to the client or bundle into worker config.

Required:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `STRIPE_PRICE_ID_DEEP_AUDIT`
- `DEEP_AUDIT_R2_PUBLIC_BASE`
- `DEEP_AUDIT_DEFAULT_PAGE_LIMIT`
- `DEEP_AUDIT_BROWSER_RENDER_MODE`
- `GEMINI_MODEL`
- `GEMINI_ENDPOINT`
- `ADMIN_EMAIL`

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
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`

Conditional secrets:
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
- R2 bucket binding + public base URL

### Browser Rendering fallback
- all paid deep audit env
- `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`
- `BROWSER_RENDERING_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Admin evals
- Supabase URL
- service role key
- admin user email in auth/db
- optional local write tooling:
  - `npm run eval:smoke`
  - `npm run eval:promptfoo:write:report -- --site-url https://example.com`
  - `npm run eval:promptfoo:write:retrieval -- --site-url https://example.com`
  - `npm run eval:retrieval:write -- --site-url https://example.com`

## Sanity checks

Before handing off to another team, verify:
1. `npm run type-check`
2. `npm run build`
3. `npm run eval:smoke`
4. admin eval page shows inserted row
5. retrieval drilldown opens when retrieval rows exist
6. report page can fetch markdown and PDF without CSP errors
