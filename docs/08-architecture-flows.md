# Architecture Flows

This document explains the implemented end-to-end system flows.

## 1. Free scan flow

Primary path:
1. user submits site on landing page
2. app validates input and Turnstile
3. scan record is created in Supabase
4. queue-backed scan processing runs checks
5. results page reads stored output and renders scores/issues plus next-step guidance

Key code areas:
- `app/page.tsx`
- `app/api/scan/route.ts`
- `workers/queue/*`
- `workers/scan-engine/*`
- `app/results/[id]/page.tsx`
- `components/results-view.tsx`

## 2. Paid deep-audit flow

Primary path:
1. user starts from results page upgrade CTA
2. Stripe Checkout session is created
3. Stripe webhook confirms payment
4. paid deep-audit job is queued
5. deep crawl runs across multiple pages
6. report payload is assembled
7. markdown + PDF are uploaded to R2
8. report is emailed to the Stripe checkout address
9. results/report UI renders the delivered artifact

Key code areas:
- `components/deep-audit-checkout.tsx`
- `lib/server/stripe/*`
- `app/api/webhooks/stripe/route.ts`
- `workers/queue/report-queue-consumer.ts`
- `workers/scan-engine/deep-audit-crawl.ts`
- `workers/report/*`
- `app/results/[id]/report/page.tsx`
- `components/report-viewer.tsx`

## 2.5. Guided results journey flow

Implemented today:
- the results page treats preview, payment, report generation, and delivery as one continuous journey
- full audit is the primary continuation
- preview-save remains available but lower emphasis
- status is derived from `hasPaidReport` / `reportStatus`, not from `?checkout=success` alone

State model:
- preview ready
- checkout cancelled
- payment return awaiting confirmation
- full audit in progress
- report delivered

Key code areas:
- `components/results-view.tsx`
- `lib/client/results-journey.ts`
- `lib/client/loading-journeys.ts`
- `components/email-gate.tsx`
- `components/deep-audit-checkout.tsx`

## 3. Report generation flow

The report system now distinguishes between:
- highlighted issues
- full issue/check set
- category scores
- coverage summary
- technical appendix

Current truth:
- the paid report no longer pretends top issues are the full evaluated set
- richer statuses are preserved instead of being flattened to binary pass/fail

Key code areas:
- `workers/report/deep-audit-report-payload.ts`
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/build-deep-audit-pdf.ts`
- `workers/report/deep-audit-report.test.ts`

## 4. Browser Rendering fallback flow

This is the implemented DA-005 slice.

Behavior:
1. standard HTTP fetch remains the first crawl path
2. the system detects likely SPA shell / low-content HTML
3. if `DEEP_AUDIT_BROWSER_RENDER_MODE=auto`, the worker may request rendered HTML from Cloudflare Browser Rendering
4. rendered HTML is compared against the static response
5. the richer document is used for downstream checks

Constraints:
- optional and disabled by default
- intended for paid deep audits only
- not a full `/crawl` or Workflows-scale browser orchestration system

Key code areas:
- `workers/scan-engine/browser-rendering.ts`
- `workers/scan-engine/deep-audit-crawl.ts`
- `workers/queue/report-queue-consumer.ts`
- `lib/server/stripe/ensure-deep-audit-job-queued.ts`

## 5. Retrieval and eval flow

Implemented today:
- deterministic retrieval harness
- promptfoo regression harness
- report quality integrity rubric
- smoke eval writer into Supabase
- site-centric Promptfoo analytics writes
- deterministic retrieval run writer into `retrieval_eval_runs`, `retrieval_eval_prompts`, `retrieval_eval_passages`, and `retrieval_eval_answers`
- retrieval drilldown page in admin

Not yet implemented:
- live retrieval benchmarking against external engines
- production ragas pipeline
- benchmark percentile output

Key code areas:
- `lib/server/retrieval-eval.ts`
- `lib/server/retrieval-eval-writer.ts`
- `lib/server/report-eval-structural.ts`
- `scripts/report-eval-smoke.ts`
- `scripts/retrieval-eval-write.ts`
- `scripts/run-promptfoo.cjs`
- `eval/promptfoo/*`

## 6. Admin analytics flow

Two current admin surfaces matter:
- attribution dashboard
- eval dashboard

Attribution truth:
- empty data can be normal
- query failure usually means env drift or missing migrations

Eval truth:
- no rows appear until `npm run eval:smoke` or another writer inserts into `report_eval_runs`
- Promptfoo site-history analytics now depend on `011_eval_run_metadata.sql` plus `npm run eval:promptfoo:write:report` / `npm run eval:promptfoo:write:retrieval`
- retrieval drilldown depends on populated `retrieval_eval_prompts`, `retrieval_eval_passages`, and `retrieval_eval_answers`

Key code areas:
- `app/dashboard/attribution/page.tsx`
- `app/dashboard/evals/page.tsx`
- `app/dashboard/evals/retrieval/[id]/page.tsx`
- `scripts/report-eval-smoke.ts`
- `scripts/promptfoo-eval-write.ts`
- `scripts/retrieval-eval-write.ts`

## 6.5. Long-wait loading flow

Implemented today:
- short waits keep local button or inline pending states
- waits that cross a delay threshold escalate into a centralized overlay
- overlay copy is flow-specific rather than generic

Covered flows:
- scan submission
- results loading
- deep-audit checkout redirect
- email save
- customer login
- admin login
- report loading
- full-audit generation while the report is still in `generating`

Key code areas:
- `components/long-wait-provider.tsx`
- `lib/client/loading-journeys.ts`
- `app/layout.tsx`
- `components/scan-form.tsx`
- `components/deep-audit-checkout.tsx`
- `components/email-gate.tsx`
- `app/login/login-form.tsx`
- `app/admin/login/admin-login-form.tsx`
- `components/results-view.tsx`
- `components/report-viewer.tsx`

## 7. Security boundaries

Current security posture relies on:
- Turnstile on public scan flow
- SSRF hostname/protocol filtering in worker fetch code
- service-role use only on server/admin paths
- Stripe webhook validation
- R2 artifact storage for paid reports

Important nuance:
- SSRF defense does not perform full DNS-resolution validation in Workers; docs were corrected to match implementation reality
- launch security is still not fully signed off because Phase 4 tasks remain open

Key references:
- `SECURITY.md`
- `workers/lib/ssrf.ts`
- `agents/memory/PROJECT_STATE.md`

## 8. What is still structurally missing

Notable missing layers:
- full launch security closure
- WAF decision/closure
- mature business diligence layer for acquire.com readiness
- optional extreme-scale deep-audit orchestration beyond the shipped queue path
