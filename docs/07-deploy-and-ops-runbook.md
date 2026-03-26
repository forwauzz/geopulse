# Deploy And Ops Runbook

This document is the operator runbook for build, deploy, and post-deploy checks.

## Deployment model

GEO-Pulse is deployed as Next.js on Cloudflare Workers via OpenNext.

Key files:
- `wrangler.jsonc`
- `.github/workflows/ci.yml`
- `PLAYBOOK/cloudflare-workers-builds.md`
- `workers/cloudflare-entry.ts`

## Build commands

Primary validation commands:
- `npm run type-check`
- `npm run build`
- `npm run test`

Targeted validation used recently:
- targeted Vitest for report generation, deep-audit crawl, Browser Rendering, and retrieval eval
- `npm run eval:smoke`
- `npm run eval:promptfoo`

## Local deploy-oriented workflow

Recommended sequence:
1. populate `.env.local`
2. populate `.dev.vars` if using Worker-local flows
3. run `npm run type-check`
4. run targeted tests for touched areas
5. run `npm run build`
6. test UI locally

## Cloudflare deploy notes

Important implementation truth:
- Git-connected Workers Builds does not rely on the local `wrangler build.command` in the same way local deploy does.
- The repo playbook states dashboard build/deploy settings must match the OpenNext worker build path.

If a deploy behaves differently than local build:
1. confirm dashboard build command matches the playbook
2. confirm worker vars and secrets exist in the target environment
3. confirm R2 bucket binding and queue bindings exist
4. confirm compatibility date/flags still match repo config

## Post-deploy checks

### Public app
- home page loads
- free scan submits
- results page renders
- report markdown route loads
- PDF link opens
- no CSP error for R2 markdown/PDF fetches

### Paid deep audit
- checkout session creates
- webhook records payment state
- queue processes report
- report artifacts land in R2
- results report route renders interactive summary + markdown sections

### Admin pages
- `/dashboard/evals` shows at least one row after `npm run eval:smoke`
- `/dashboard/attribution` loads without a query error
- empty attribution data is acceptable; query failure is not

### Browser Rendering fallback
If `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`:
- trigger a deep audit against a JS-heavy site
- verify the crawl completes
- verify report generation still completes
- verify failure mode is explicit if Browser Rendering credentials are missing

## Data and queue operations

Operational dependencies:
- Supabase
- Cloudflare Queues
- Cloudflare R2
- Stripe webhooks
- Resend

Runbook expectations:
- do not treat queue success as sufficient; verify the report artifact exists and the UI can fetch it
- do not treat eval dashboard emptiness as a bug until `npm run eval:smoke` has been executed against the same project

## Incident triage shortcuts

### Report markdown or PDF fails to load
Check:
1. CSP in `next.config.ts`
2. `DEEP_AUDIT_R2_PUBLIC_BASE`
3. R2 object existence
4. report route payload values from scan record

### Attribution page fails
Check:
1. env loader usage in server pages
2. attribution migrations applied
3. active Supabase project matches local/test shell env

### Evals page empty
Check:
1. `report_eval_runs` contains rows
2. `npm run eval:smoke` was run against active DB
3. admin access is correct

### Deep audit stuck or incomplete
Check:
1. queue consumer logs
2. `scan_runs` status/config payload
3. R2 upload outcome
4. Browser Rendering mode and credentials if enabled

## Release gate status

As of 2026-03-26, release is still gated by:
- `P4-003` SPF/DKIM/DMARC
- `P4-006` launch security sign-off
- `P4-004` WAF decision/closure

Do not represent the product as fully launch-ready until those are closed.
