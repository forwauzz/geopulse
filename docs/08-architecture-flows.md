# Architecture Flows

This document explains the implemented end-to-end system flows.

## 1. Free scan flow

Primary path:
1. user submits site on landing page
2. app validates input and Turnstile
3. scan record is created in Supabase
4. queue-backed scan processing runs checks
5. results page reads stored output and renders scores/issues

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
8. results/report UI renders the delivered artifact

Key code areas:
- `components/deep-audit-checkout.tsx`
- `lib/server/stripe/*`
- `app/api/stripe/webhook/route.ts`
- `workers/queue/report-queue-consumer.ts`
- `workers/scan-engine/deep-audit-crawl.ts`
- `workers/report/*`
- `app/results/[id]/report/page.tsx`
- `components/report-viewer.tsx`

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

Not yet implemented:
- live retrieval benchmarking against external engines
- production ragas pipeline
- benchmark percentile output

Key code areas:
- `lib/server/retrieval-eval.ts`
- `lib/server/report-eval-structural.ts`
- `scripts/report-eval-smoke.ts`
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

Key code areas:
- `app/dashboard/attribution/page.tsx`
- `app/dashboard/evals/page.tsx`
- `scripts/report-eval-smoke.ts`

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
- Workflows-scale deep audit orchestration for very large crawls
- full launch security closure
- WAF decision/closure
- mature business diligence layer for acquire.com readiness
