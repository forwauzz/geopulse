# Implementation Map

## Stack
- Next.js App Router
- Cloudflare Workers via `@opennextjs/cloudflare`
- Supabase
- Stripe
- Resend
- Gemini
- pdf-lib

## Primary System Areas

### 1. Free scan path
Key files:
- `app/page.tsx`
- `components/scan-form.tsx`
- `app/api/scan/route.ts`
- `workers/scan-engine/run-scan.ts`
- `workers/scan-engine/checks/registry.ts`
- `workers/scan-engine/scoring.ts`
- `workers/lib/ssrf.ts`
- `workers/lib/fetch-gate.ts`

Responsibilities:
- collect URL
- validate Turnstile
- validate URL safety
- fetch page
- run checks
- persist `scans`
- return results

### 2. Results + report UI
Key files:
- `app/results/[id]/page.tsx`
- `components/results-view.tsx`
- `components/score-display.tsx`
- `lib/client/results-journey.ts`
- `components/long-wait-provider.tsx`
- `lib/client/loading-journeys.ts`
- `app/results/[id]/report/page.tsx`
- `components/report-viewer.tsx`
- `app/results/[id]/opengraph-image.tsx`

Responsibilities:
- show score and category breakdown
- show top issues
- present the guided preview → pay / save → report journey
- expose state-driven payment/report status
- escalate long waits into the centralized overlay
- render interactive markdown-backed report view
- provide OG sharing image

### 3. Paid deep-audit path
Key files:
- `app/api/checkout/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `lib/server/stripe/checkout-completed.ts`
- `lib/server/stripe/ensure-deep-audit-job-queued.ts`
- `workers/queue/report-queue-consumer.ts`
- `workers/scan-engine/deep-audit-crawl.ts`
- `workers/scan-engine/browser-rendering.ts`

Responsibilities:
- take payment
- verify webhook
- create `scan_run`
- queue deep audit
- crawl multiple pages
- optionally render SPA-like pages via Browser Rendering fallback
- generate report payload

### 4. Report generation
Key files:
- `workers/report/deep-audit-report-payload.ts`
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/build-deep-audit-pdf.ts`
- `workers/report/r2-report-storage.ts`
- `workers/report/resend-delivery.ts`

Responsibilities:
- canonical report payload
- markdown generation
- PDF generation
- file storage
- email delivery

### 5. Auth + dashboard
Key files:
- `app/login/*`
- `app/auth/callback/route.ts`
- `middleware.ts`
- `app/dashboard/page.tsx`
- `components/site-header.tsx`
- `lib/server/link-guest-purchases.ts`

Responsibilities:
- magic link auth
- guest purchase linking
- dashboard access
- session protection
- auth-aware landing navigation

### 6. Admin / report eval
Key files:
- `app/admin/login/*`
- `app/dashboard/evals/page.tsx`
- `app/dashboard/evals/retrieval/[id]/page.tsx`
- `lib/server/report-eval-structural.ts`
- `lib/server/promptfoo-results.ts`
- `lib/server/retrieval-eval-writer.ts`
- `scripts/report-eval-smoke.ts`
- `scripts/promptfoo-eval-write.ts`
- `scripts/retrieval-eval-write.ts`
- `eval/fixtures/*`
- `eval/promptfoo/*`

Responsibilities:
- admin auth
- site-centric eval history display
- retrieval drilldown display
- benchmark run-detail lineage inspection
- narrow benchmark cohort-frame inspection on domain history
- smoke eval insertion
- promptfoo result normalization + persistence
- deterministic retrieval eval persistence
- prompt regression suites
- golden report assertions

### 6c. Startup audit history and implementation tracking
Key files:
- `app/dashboard/startup/page.tsx`
- `app/dashboard/startup/components/startup-dashboard-page-shell.tsx`
- `app/dashboard/startup/components/startup-overview-tab.tsx`
- `app/dashboard/startup/components/startup-audits-tab.tsx`
- `app/dashboard/startup/components/startup-audits-table-client.tsx`
- `app/dashboard/startup/components/startup-settings-tab.tsx`
- `app/dashboard/startup/components/startup-delivery-tab.tsx`
- `app/dashboard/startup/components/startup-tab-types.ts`
- `lib/server/startup-dashboard-data.ts`
- `lib/server/startup-dashboard-status-messages.ts`
- `lib/server/startup-tracking-metrics.ts`

Responsibilities:
- keep the startup dashboard flow obvious with a reduced tab hierarchy
- show audit history with date-range and status filters
- surface a compact score trend and latest-vs-previous delta
- record validated recommendations as the implementation signal
- preserve a lightweight data model for later benchmark attribution
- keep the UI quiet enough for rapid scanning while still exposing progress

### 6b. Benchmark execution boundary
Key files:
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-runner.ts`
- `app/dashboard/benchmarks/page.tsx`
- `components/benchmark-trigger-form.tsx`

Responsibilities:
- resolve live benchmark execution config from shared env helpers
- keep one provider boundary for stub vs live execution
- allow multiple enabled model lanes without widening the admin trigger flow
- cap scheduled benchmark launches and stop early after repeated failures

### 7. Marketing attribution
Key files:
- `services/marketing-attribution/*`
- `app/api/internal/marketing/events/route.ts`
- `lib/client/attribution.ts`
- `components/attribution-init.tsx`
- `app/dashboard/attribution/page.tsx`

Responsibilities:
- event ingestion
- UTM capture
- reporting views
- weekly email summary

### 8. Supabase / migrations
Key files:
- `supabase/migrations/005_scan_runs_scan_pages.sql`
- `supabase/migrations/006_scan_pages_section.sql`
- `supabase/migrations/007_marketing_attribution.sql`
- `supabase/migrations/008_marketing_attribution_views.sql`
- `supabase/migrations/009_admin_report_eval.sql`
- `supabase/migrations/010_retrieval_eval_foundation.sql`

## Key Implemented Capabilities By Theme

### Scan quality
- v2 status model
- category scores
- LLM confidence surfaced
- full-check report integrity
- technical appendix

### Crawl quality
- robots.txt handling
- sitemap handling
- same-origin link discovery
- section-aware prioritization
- chunked continuation
- crawl metrics
- optional Browser Rendering SPA fallback

### Evaluation quality
- integrity rubric
- promptfoo harness
- deterministic retrieval simulation
- site-history eval analytics
- retrieval drilldown

## Important Non-Goals / Not Implemented
- API product layer beyond schema foundation
- benchmark percentile engine
- ragas runtime pipeline
- full Browser Rendering `/crawl` orchestration
