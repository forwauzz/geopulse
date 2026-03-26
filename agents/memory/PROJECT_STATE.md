# GEO-Pulse — Project State
> Maintained by: Orchestrator only
> Format: Update this file whenever a task changes state. Never delete history — add new entries.

---

## Current Phase: Phase 4 — Launch

**Phase goal:** Production deploy, OG share image, email DNS (SPF/DKIM/DMARC), WAF, keep-alive cron, launch security audit.

**Implementation status (2026-03-25):** P4-002 + P4-005 **in repo**. **P4-001** ✅ — production Worker `https://geo-pulse.uzzielt.workers.dev` + **live Stripe checkout return path** verified — see `COMPLETION_LOG.md` *Phase 4 — operator evidence*. **P2-008** ✅ — production paid path verified. **Still to close with evidence in log:** **P4-003** (SPF/DKIM/DMARC), **P4-004** (WAF CVE-2025-29927), **P4-006** (Security sign-off on five blockers). **Current operator blocker:** domain purchase / DNS setup is paused due to a credit-card issue, so `P4-003` and final `P4-006` cannot be completed yet. **Phase 4→Launch gate** (`agents/ORCHESTRATOR.md`) requires all five security blockers + production smoke — Orchestrator marks when P4-003/004/006 evidence is attached.

**Current UX follow-up (2026-03-26):** User testing exposed a product-truth gap in the core journey: free scan preview, pay-for-full-audit, and email-save flow did not read as clear incremental steps toward one outcome. The core implementation is now in repo: explicit step framing, shared preliminary/final audit loading language, and state-driven paid-report status have replaced the earlier optimistic copy. Remaining UX work is verification and any follow-up polish from real-user testing.

**Current strategic expansion (2026-03-26):** GEO-Pulse will keep the current audit/report product as the customer-facing wedge while a benchmark/measurement layer is planned as a staged internal platform. This work is tracked as a separate initiative and does not change the truth that launch remains blocked on `P4-003`, `P4-004`, and `P4-006`.

**Operator note (2026-03-25):** Production checkout **`POST /api/checkout`** is rate-limited (**5 attempts per IP per hour**, `Retry-After: 3600` — see `lib/server/rate-limit-kv.ts` `checkCheckoutRateLimit`). Retesting paid checkout may require **waiting up to one hour** or using **another network/IP**. This is **not** a Stripe configuration failure by itself. **Sequencing:** **DA-001** ✅ · **DA-002** ✅ · **DA-003** ✅ · **DA-004** ✅ — queue-scale deep-audit continuation is now implemented and unit-verified (`crawl_pending`, re-queue path, chunk metrics, 1000-page cap, targeted Vitest). **DA-005** ✅ — optional Browser Rendering SPA fallback for paid deep audits, disabled by default unless explicit operator config is provided. **Workflows** are now an optional future enhancement for extreme-scale crawls, not a shipped-path blocker. **Orchestrator:** close **Phase 4 — Launch** first (`agents/ORCHESTRATOR.md` § *Phase 4 first — defer remaining Deep Audit*). **Next (Phase 4):** paste **P4-003 / P4-004 / P4-006** evidence in `COMPLETION_LOG.md`; then **Phase 4→Launch gate**.

**Deep Audit Upgrade (v2):** Tracked in Task Registry (**DA-001…DA-005**); spec `.cursor/plans/report_depth_and_formats_fa7e556e.plan.md`, narrative [`PLAYBOOK/audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md). **DA-001** ✅ **DONE** — `005_scan_runs_scan_pages.sql`, queue **v2**, `runDeepAuditCrawl`, multi-page PDF (operator-verified). **DA-002** ✅ **DONE** — `workers/lib/fetch-gate.ts`, `validateEngineFetchUrl`, `robots-and-sitemap.ts`, `crawl-url-utils.ts` (section-aware cap), migration `006_scan_pages_section.sql`; **Security** formal sign-off on fetch path still recommended per `agents/SECURITY_AGENT.md`. **DA-003** ✅ **DONE** — `DeepAuditReportPayload`, `build-deep-audit-markdown.ts`, R2 upload + `reports.pdf_url`, Resend attach vs link policy (`DEEP_AUDIT_ATTACH_MAX_BYTES`). **DA-004** ✅ **DONE** — robots `Crawl-delay` + crawl metrics (`COMPLETION_LOG` DA-004-inc) **+ chunked queue re-invocation** (`crawl_pending` in `scan_runs.config`) **+ chunk-progress guardrails** **+ 1000-page cap** (`MAX_DEEP_AUDIT_PAGE_LIMIT`) **+ accurate coverage chunk reporting** **+ targeted multi-chunk Vitest proof**. **DA-005** ✅ **DONE** — optional Browser Rendering-backed SPA fallback for paid deep audits (`workers/scan-engine/browser-rendering.ts`, deep-audit crawl + queue wiring, env/docs updates). Independent of Phase 4 closure; Orchestrator sets parallel vs sequential execution.

**How to close Phase 4:** Follow **`COMPLETION_LOG.md` → *Phase 4 — operator execution order*** — numbered steps + **Stripe Live checkpoint** (after production hostname is fixed). Paste deploy + DNS + WAF + smoke evidence there; Orchestrator marks tasks and Phase 4→Launch gate per `agents/ORCHESTRATOR.md`.

**Phase 2 — CLOSED (implementation in repo; operator: apply migration `004_payments_guest_email.sql`, verify PDF &lt;60s + webhook in staging).** Checkout (`app/api/checkout`), Stripe webhook + idempotency (`app/api/webhooks/stripe`, `lib/server/stripe/checkout-completed.ts`), queue → PDF → Resend (`workers/queue/report-queue-consumer.ts`), DLQ replay (`workers/queue/dlq-replay.ts`). Tests: `npm run test`, `lib/server/stripe/checkout-completed.test.ts`.

**Phase 3 — CLOSED (implementation in repo).** Magic link (`app/login`, `app/login/actions.ts`), OAuth callback + guest purchase linking (`app/auth/callback`, `lib/server/link-guest-purchases.ts`), middleware session + CVE header (`middleware.ts`, `lib/supabase/middleware.ts`), dashboard (`app/dashboard`). Gate: sign in → `/dashboard` lists `scans` / `reports` for `auth.uid()`; unauthenticated `/dashboard` → `/login`.

**Prior phase goal (Phase 2):** Stripe checkout → webhook (verified) → queue → pdf-lib report → Resend delivery + idempotency + DLQ.

**Orchestrator sequencing:** Phases **2** and **3** are complete in repo; **Phase 4 — Launch** is in progress. **Deep Audit Upgrade:** **DA-001–005** ✅ in repo; this does **not** replace Phase 4 tasks or API deferral rules. **API-as-a-Service** (**API-002 … API-007**) starts only after **Phase 4→Launch gate** (see `ORCHESTRATOR.md`). **API-001** (schema) stays done.

**Phase 2→3 gate** (`agents/ORCHESTRATOR.md`): $1 test payment succeeds · PDF delivered in &lt;60s · Stripe webhook never processed without signature verification.

**Phase 3→4 gate** (`agents/ORCHESTRATOR.md`): Registered user can log in · past scans visible · auth middleware blocks unauthenticated routes.

**Operator note (2026-03-24):** $1 payment reported **working end-to-end**. Remaining gate items (PDF SLA, webhook verification, task evidence in `COMPLETION_LOG.md`) still required before advancing phase.

**Phase 1 — CLOSED (2026-03-24).** Free scan path implemented (landing, Turnstile, SSRF-gated fetch, 11 deterministic + 2 Gemini checks, weighted score, results + email gate, `scans`/`leads` via service role, KV rate limits). Evidence: `COMPLETION_LOG.md` *Phase 1 — implementation bundle*.

**Phase 1→2 gate (manual) — operator verified (2026-03-24):** End-to-end run on `https://techehealthservices.com/`: scan completed, **AI Search Readiness Score** returned, results page + email gate (“You are on the list.”). Orchestrator may mark **ACCEPTED** per `ORCHESTRATOR.md` once `leads` row + optional KV rate-limit spot-check are confirmed in Supabase/CF dashboard.

**Phase 0 — CLOSED (2026-03-24).** Gate per `ORCHESTRATOR.md`: `wrangler dev` + Supabase tables/RLS + anon RLS check + type-check — see `COMPLETION_LOG.md` section *Phase 0 — P0-002 / P0-003 / P0-004 / P0-005 / P0-006 evidence bundle*.

**Phase 0 exit criteria (archived):**
- [x] `npm install` completes without errors
- [x] `wrangler dev` starts the dev server
- [x] Supabase project created; schema from `001_initial_schema.sql` (+ `002_api_keys.sql`) applied on remote `geo_pulse`
- [x] Core 6 tables + API tables: RLS enabled; `leads` verified via **anon** PostgREST (200 + `[]`)
- [x] `.cursor/rules/` files present in repo
- [x] `.dev.vars` present at repo root (from `.dev.vars.example` pattern)
- [x] `npm run type-check` returns 0 errors

---

## Task Registry

### Phase 0 — Scaffold
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P0-001 | Scaffold files created | Orchestrator | ✅ DONE | Files exist in repo |
| P0-002 | `npm install` passes | Backend | ✅ DONE | COMPLETION_LOG Phase 0 bundle |
| P0-003 | Supabase project created + migration applied | Database | ✅ DONE | COMPLETION_LOG Supabase audit + Phase 0 bundle |
| P0-004 | RLS verified via anon key | Security | ✅ DONE | COMPLETION_LOG Phase 0 bundle (PostgREST `leads`) |
| P0-005 | `wrangler dev` runs locally | Backend | ✅ DONE | COMPLETION_LOG Phase 0 bundle |
| P0-006 | Type check passes (0 errors) | QA | ✅ DONE | COMPLETION_LOG Phase 0 bundle |

### Phase 1 — Core Scan Engine
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P1-001 | Landing page + scan form | Frontend | ✅ DONE | `app/page.tsx`, `components/scan-form.tsx`; COMPLETION_LOG P1 |
| P1-002 | Turnstile integration (form + server validation) | Backend | ✅ DONE | `components/*`, `lib/server/turnstile.ts`, `app/api/scan`, `app/api/leads`; COMPLETION_LOG P1 |
| P1-003 | SSRF validator unit tests (all edge cases) | QA | ✅ DONE | `workers/lib/ssrf.test.ts` (vitest); COMPLETION_LOG P1 |
| P1-004 | Scan Worker: fetch + HTMLRewriter parse | Backend | ✅ DONE | `workers/scan-engine/fetch-page.ts` + `parse-signals.ts` (bounded fetch + signal extraction; streaming HTMLRewriter deferred to dedicated Worker hardening) |
| P1-005 | Deterministic checks (11 of 15) implemented | Backend | ✅ DONE | `workers/scan-engine/checks/check-*.ts` (11 files) + `registry.ts` |
| P1-006 | Gemini integration (2 checks: Q&A + extractability) | Backend | ✅ DONE | `workers/providers/gemini.ts`, `check-llm-*.ts` |
| P1-007 | Scoring engine (weighted 100-pt rubric) | Backend | ✅ DONE | `workers/scan-engine/scoring.ts` |
| P1-008 | Results page: score + 3 issues + email gate | Frontend | ✅ DONE | `app/results/[id]`, `components/results-view.tsx`, `score-display.tsx`, `email-gate.tsx` |
| P1-009 | Email capture → Supabase leads table | Backend | ✅ DONE | `app/api/leads/route.ts` (service_role insert) |
| P1-010 | Rate limiting (10 req/min/IP + 20/day/email) | Security | ✅ DONE | `lib/server/rate-limit-kv.ts` + `SCAN_CACHE` binding |
| P1-011 | Phase 1 integration test: end-to-end scan | QA | ✅ DONE | `npm run test` (vitest) + `npm run build`; manual e2e recommended before Phase 2 sign-off — COMPLETION_LOG P1 |

### Phase 2 — Payment + PDF + Email
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P2-001 | Stripe $29 checkout integration | Backend | ✅ DONE | `app/api/checkout/route.ts` |
| P2-002 | Stripe webhook handler (with signature verification) | Backend | ✅ DONE | `app/api/webhooks/stripe/route.ts` |
| P2-003 | Cloudflare Queue: enqueue deep audit on payment | Backend | ✅ DONE | `lib/server/stripe/ensure-deep-audit-job-queued.ts` |
| P2-004 | pdf-lib report generator | Backend | ✅ DONE | `workers/report/build-deep-audit-pdf.ts` |
| P2-005 | Resend: HTML email + PDF attachment delivery | Backend | ✅ DONE | `workers/report/resend-delivery.ts` |
| P2-006 | Dead-letter queue handler + retry logic | Backend | ✅ DONE | `workers/queue/report-queue-consumer.ts`, `workers/queue/dlq-replay.ts` |
| P2-007 | Payment idempotency (Stripe event ID dedup) | Security | ✅ DONE | `lib/server/stripe/checkout-completed.ts` |
| P2-008 | $1 test payment end-to-end test | QA | ✅ DONE | COMPLETION_LOG Phase 4 — operator evidence; live payment `geo-pulse.uzzielt.workers.dev` verified checkout success return path |

### Phase 3 — Auth + Dashboard
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P3-001 | Supabase magic link auth | Backend | ✅ DONE | `app/login`, `app/login/actions.ts`, `lib/supabase/server.ts` |
| P3-002 | Auth middleware (CVE-2025-29927 protected) | Security | ✅ DONE | `middleware.ts` (session + block `x-middleware-subrequest`); Next.js patched |
| P3-003 | User dashboard: scan history + past reports | Frontend | ✅ DONE | `app/dashboard/page.tsx` |
| P3-004 | Auto-account creation post-payment | Backend | ✅ DONE | `lib/server/link-guest-purchases.ts`, `app/auth/callback/route.ts`, `004_payments_guest_email.sql` |

### Phase 4 — Launch
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P4-001 | Production deploy to Cloudflare Pages + Workers | Backend | ✅ DONE | COMPLETION_LOG Phase 4 — operator evidence; prod URL + live Stripe + `lib/server/cf-env.ts` `pickEnvString` for Worker env |
| P4-002 | Share-your-score OG image generation | Frontend | ✅ DONE | `app/results/[id]/opengraph-image.tsx`, `lib/server/get-scan-for-public-share.ts`, `page.tsx` `generateMetadata`; COMPLETION_LOG Phase 4 bundle |
| P4-003 | SPF + DKIM + DMARC configured | Security | ⬜ PENDING (operator blocked) | Domain purchase / DNS setup paused due to founder credit-card issue; complete once domain can be purchased and Resend DNS records can be added |
| P4-004 | WAF rules enabled (CVE-2025-29927) | Security | ⬜ DEFERRED (paid CF) / mitigated | Managed WAF often needs **paid** Cloudflare — **mitigation in repo:** `middleware.ts` + patched Next.js; full WAF when upgraded — `COMPLETION_LOG` P4-004 paid-plan note; **P4-006** Security acknowledges |
| P4-005 | Supabase keep-alive cron configured | Backend | ✅ DONE | `wrangler.jsonc` `triggers.crons`, `workers/cloudflare-entry.ts` `scheduled`; COMPLETION_LOG Phase 4 bundle |
| P4-006 | Launch security audit (all 5 blockers) | Security | ⬜ PENDING (waiting on operator blocker) | Repo-side evidence refreshed in COMPLETION_LOG `P4-006 — Launch security audit evidence bundle refresh`; final sign-off still depends on `P4-003` DNS evidence + `P4-004` launch-policy decision |

### Deep Audit Upgrade (multi-page paid audit — “v2”)
> **Spec:** `.cursor/plans/report_depth_and_formats_fa7e556e.plan.md` (§ Target architecture). **Narrative / executive summary:** [`PLAYBOOK/audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md). **Does not replace** Phase 4 or API deferral rules in `agents/ORCHESTRATOR.md` — Orchestrator sets **start date** and whether this runs **in parallel with** or **after** Phase 4 operator tasks. **Security** sign-off required on fetch-gate / SSRF changes (DA-002).

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| DA-001 | Phase 0: `scan_runs` / `scan_pages` + RLS; payment → deep crawl + cap; free scan unchanged | Backend + Database | ✅ DONE | COMPLETION_LOG DA-001 (✅ ACCEPTED); operator smoke: paid PDF for `https://techehealthservices.com/` — **Pages scanned** + per-page checklist (10 URLs, site aggregate score); migration `005_scan_runs_scan_pages.sql` |
| DA-002 | Phase 1: Central fetch gate (extend `workers/lib/ssrf.ts`); robots + sitemap streaming; section-aware sampling | Backend + Security | ✅ DONE | `workers/lib/fetch-gate.ts`, `validateEngineFetchUrl`, `deep-audit-crawl` + robots/sitemap + `prioritizeUrlsBySection`; `006_scan_pages_section.sql`; `npm run test` 36 passed; COMPLETION_LOG DA-002 — **Security** review recommended |
| DA-003 | Reporting: `DeepAuditReportPayload`; PDF/MD; R2 + email link policy | Backend | ✅ DONE | COMPLETION_LOG DA-003; `workers/report/*`, `report-queue-consumer.ts`, `wrangler.jsonc` `r2_buckets` + `DEEP_AUDIT_R2_PUBLIC_BASE`; CI runs `cf-typegen` |
| DA-004 | Phase 2: Scale (queue continuation, politeness, metrics) | Backend | ✅ DONE | `deep-audit-crawl.ts`, `report-queue-consumer.ts`, `deep-audit-page-limit.ts`, `deep-audit-crawl.test.ts`; COMPLETION_LOG DA-004 incremental entries + DA-004 completion entry |
| DA-005 | Phase 3 (optional): Browser Rendering / SPA crawl | Backend | ✅ DONE | `workers/scan-engine/browser-rendering.ts`, `deep-audit-crawl.ts`, queue/env wiring; COMPLETION_LOG DA-005 |

### Marketing Attribution Microservice (parallel with launch)
> **PRD:** `PLAYBOOK/marketing-attribution-weekly-report.md` (runbook). **Runs in parallel** with Phase 4 / product launch — does not block or replace any Phase 4 tasks. Service code in `services/marketing-attribution/`. Schema in `analytics` (Supabase, service-role only — no anon access). Client-side UTM capture via `gp_anon_id` cookie (middleware) + `gp_utm` sessionStorage (`lib/client/attribution.ts`). Weekly email report on Monday cron via Resend (opt-in: set `MARKETING_REPORT_TO` secret).

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| MA-001 | Foundation: `analytics` schema + `marketing_events` table + Zod contract + ingestion endpoint + idempotent tests | Backend + Database | ✅ DONE | `007_marketing_attribution.sql` applied; `services/marketing-attribution/schema.ts`, `ingest.ts`, `emit.ts`; `app/api/internal/marketing/events/route.ts`; 39 new tests; type-check 0 errors, 89/89 tests |
| MA-002 | Wiring: client UTM/session capture + emit from scan/leads/checkout/webhook | Backend + Frontend | ✅ DONE | `lib/client/attribution.ts`, `components/attribution-init.tsx`, middleware `gp_anon_id` cookie; emits `scan_started`, `scan_completed`, `lead_submitted`, `checkout_started`, `payment_completed`; 89/89 tests |
| MA-003 | Reporting: first-touch/last-touch views + weekly funnel aggregate + runbook | Backend + Database | ✅ DONE | `008_marketing_attribution_views.sql` applied; `analytics.attribution_conversions_v1`, `analytics.channel_funnel_weekly_v1`; `PLAYBOOK/marketing-attribution-weekly-report.md` |
| MA-004 | Weekly email report via Monday cron + Resend | Backend | ✅ DONE | `services/marketing-attribution/weekly-report.ts`; `workers/cloudflare-entry.ts` scheduled handler; opt-in via `MARKETING_REPORT_TO` env var |
| MA-005 | Hardening: queue-backed ingestion + replay + DLQ (optional) | Backend | ⬜ DEFERRED | Trigger: event volume > 1000/day or reliability issue |

### Admin & report quality eval (parallel with launch)
> **Does not replace** Phase 4 tasks. **Security:** `/admin/login` password path + `report_eval_runs` RLS — see `COMPLETION_LOG.md` ADM-001 … EVAL-004; Security sign-off recommended before treating as production-hardened.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| ADM-001 | Supabase Email password enabled + env docs | Operator + Backend | ✅ DONE | `.env.local.example`, `.dev.vars.example`; Auth dashboard |
| ADM-002 | `/admin/login` + `signInWithPassword` + non-admin sign-out | Backend | ✅ DONE | `app/admin/login/*`; COMPLETION_LOG ADM-001 … EVAL-004 |
| ADM-003 | Middleware public `/admin/login`; `/dashboard/*` unchanged | Security | ✅ DONE | `middleware.ts` (no `/admin` auth wall beyond session) |
| EVAL-001 | `reports.markdown_url` + `report_payload_version`; Worker insert | Backend | ✅ DONE | `009_admin_report_eval.sql`; `workers/queue/report-queue-consumer.ts` |
| EVAL-002 | `report_eval_runs` + RLS (no policies; service_role only) | Database | ✅ DONE | `009_admin_report_eval.sql` |
| EVAL-003 | Structural rubric + `npm run eval:smoke` | Backend | ✅ DONE | `lib/server/report-eval-structural.ts`, `scripts/report-eval-smoke.ts` |
| EVAL-004 | `/dashboard/evals` admin UI | Frontend | ✅ DONE | `app/dashboard/evals/page.tsx` |

### UX Loading States (parallel with launch)
> **Does not replace** Phase 4 tasks. Focused on long-wait feedback for user actions that may exceed the fast-path threshold. Strategy: keep inline button pending states for quick requests, and escalate to a centralized delayed overlay only when the wait is materially longer.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| UX-001 | Centralized delayed long-wait loading overlay for scan / checkout / save / auth / report flows | Frontend | ✅ DONE | `components/long-wait-provider.tsx`, `lib/client/loading-journeys.ts`; COMPLETION_LOG UX-001 |
| UX-002 | Define canonical user journey for scan → preview → pay / save → report delivery with one visible step model | Product + Frontend | ✅ DONE | `components/results-view.tsx`; COMPLETION_LOG UX-002 … UX-006 |
| UX-003 | Replace query-string-only checkout success messaging with state-driven payment / report status on results | Frontend + Backend | ✅ DONE | `components/results-view.tsx`, `app/results/[id]/page.tsx`; COMPLETION_LOG UX-002 … UX-006 |
| UX-004 | Unify preliminary drafting and final report generation under one shared loading-story pattern | Frontend | ✅ DONE | `lib/client/loading-journeys.ts`, `components/results-view.tsx`; COMPLETION_LOG UX-002 … UX-006 |
| UX-005 | Clarify branching on results page: free email-save path vs paid full-audit path, with explicit next-step framing | Frontend + Product | ✅ DONE | `components/results-view.tsx`, `components/deep-audit-checkout.tsx`, `components/email-gate.tsx`; COMPLETION_LOG UX-002 … UX-006 |
| UX-006 | Add delivered / in-progress / action-needed states driven by real payment / report persistence instead of optimistic copy | Frontend + Backend | ✅ DONE | `components/results-view.tsx`; COMPLETION_LOG UX-002 … UX-006 |
| UX-007 | End-to-end UX verification for guest and signed-in flows; verify shared journey-state behavior | QA + Product | ✅ DONE | `lib/client/results-journey.test.ts`, `app/api/scans/[id]/route.ts`, `lib/server/get-scan-for-public-share.ts`; COMPLETION_LOG UX-007 |

### v2 Enhancement Plan — Scoring Foundation + Check Expansion
> **Plan reference:** Task ledger only; prior `.cursor/plans/geopulse_v2_enhancement_audit_36a0ecee.plan.md` pointer is stale / not present in repo as of 2026-03-26. **Tier 1** (Scoring Foundation) completes the v2 status enum, category mapping, per-category scores, UI, and report integration. **Tier 2** adds new checks. **Does not replace** Phase 4 or API deferral rules.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| T1-1 | Extend `CheckResult` with v2 6-value status enum | Backend | ✅ DONE | `workers/lib/interfaces/audit.ts` — `CheckStatus` type |
| T1-2 | Add `category` field to `AuditCheck`; map 17 checks → 5 v2 categories | Backend | ✅ DONE | All 17 check files + `registry.ts` + `audit.ts` `CheckCategory` |
| T1-3 | Compute per-category 0-100 scores in `scoring.ts` | Backend | ✅ DONE | `computeCategoryScores`, `WeightedResult.category`; 96/96 tests |
| T1-4 | Surface 5 category scores in results UI | Frontend | ✅ DONE | `score-display.tsx` — 5-pillar grid replaces 4-pillar; `results-view.tsx` threads `categoryScores` |
| T1-5 | Category breakdown in PDF + Markdown reports | Backend | ✅ DONE | `build-deep-audit-markdown.ts`, `build-deep-audit-pdf.ts` — category table; `DeepAuditReportPayload.categoryScores` |
| T2-1 | New check: Schema.org @type validation | Backend | ✅ DONE | `workers/scan-engine/checks/check-schema-types.ts`, `registry.ts` |
| T2-2 | New check: Image alt text presence | Backend | ✅ DONE | `workers/scan-engine/checks/check-alt-text.ts`, `registry.ts` |
| T2-3 | New check: Content freshness signals | Backend | ✅ DONE | `workers/scan-engine/checks/check-freshness.ts`, `registry.ts` |
| T2-4 | New check: External authority links | Backend | ✅ DONE | `workers/scan-engine/checks/check-external-links.ts`, `registry.ts` |
| T2-5 | New check: Security headers | Backend | ✅ DONE | `workers/scan-engine/checks/check-security-headers.ts`, `registry.ts` |
| T2-6 | Surface LLM confidence in issue display | Frontend | ✅ DONE | `components/score-display.tsx`, `workers/scan-engine/run-scan.ts` |
| T3-6 | In-browser rendered markdown report view | Frontend | ✅ DONE | `components/report-viewer.tsx`, `app/results/[id]/report/page.tsx` |
| T3-7 | Dynamic interactive report view | Frontend | ✅ DONE | `components/report-viewer.tsx`; interactive summary + section chips + collapsible report sections; type-check + build |

### Audit Closure — Report Integrity + Product Truth
> **Source:** 2026-03-26 implementation audit. These tasks convert audit findings into explicit, bite-size follow-up work. They do **not** override Phase 4 launch sequencing; Orchestrator decides execution order.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| AU-001 | Report payload: separate `highlightedIssues` from full evaluated sitewide issue set | Backend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-002 | PDF + Markdown: render true full-check breakdown instead of top-issues-only | Backend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-003 | Preserve v2 statuses (`PASS` / `FAIL` / `BLOCKED` / `NOT_EVALUATED` / `LOW_CONFIDENCE` / `WARNING`) in report UI/PDF/MD | Backend + Frontend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-004 | Deep audit scan persistence: keep `categoryScores` and report payload metadata consistent in `full_results_json` | Backend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-005 | Add coverage summary, blocked/error counts, and crawl notes to customer-facing report | Backend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-006 | Add technical appendix section (robots, schema findings, headers) to Markdown/PDF | Backend | ✅ DONE | COMPLETION_LOG AU-006 / AU-008 |
| AU-007 | Product truth pass: align landing/report/checkout copy with actual implemented checks and deliverables | Architect + Frontend | ✅ DONE | COMPLETION_LOG AU-001 … AU-005 / AU-007 |
| AU-008 | Security/docs truth pass: reconcile SSRF documentation with actual runtime protections and limitations | Security + Architect | ✅ DONE | COMPLETION_LOG AU-006 / AU-008 |
| AU-009 | Replace structural-only report eval with content-integrity assertions (check count, statuses, appendix, page mapping) | QA + Backend | ✅ DONE | COMPLETION_LOG AU-009 / AU-010 |
| AU-010 | Add golden-report fixtures covering blocked, low-confidence, and multi-page cases | QA | ✅ DONE | COMPLETION_LOG AU-009 / AU-010 |

### Retrieval / Evaluation Backlog
> **Status:** Retrieval / eval foundation exists in repo (`RE-001` … `RE-007`), including deterministic retrieval simulation, a local `promptfoo` harness, and a documented `ragas` no-go decision. `ragas` runtime integration, benchmark engine, and prompt-cluster analysis are still not implemented as of 2026-03-26.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| RE-001 | Define retrieval-eval scope: prompts, sampled pages, expected outputs, and non-goals for MVP vs v2 | Architect | ✅ DONE | `PLAYBOOK/retrieval-eval-foundation.md`; COMPLETION_LOG RE-001 / RE-002 |
| RE-002 | Add retrieval-ready data model for eval runs, prompt sets, passages, and scored answers | Architect + Database | ✅ DONE | `supabase/migrations/010_retrieval_eval_foundation.sql`; COMPLETION_LOG RE-001 / RE-002 |
| RE-003 | Build minimal retrieval simulation harness over scanned pages/passages (no external benchmark claims yet) | Backend | ✅ DONE | `lib/server/retrieval-eval.ts`, COMPLETION_LOG RE-003 |
| RE-004 | Add benchmark-percentile computation design or explicitly remove percentile claims until implemented | Architect + Backend | ✅ DONE | `PLAYBOOK/benchmark-percentile-design.md`, doc/contract truth pass, COMPLETION_LOG RE-004 |
| RE-005 | Add `promptfoo` harness skeleton for prompt regression tests against representative report/retrieval cases | QA + Backend | ✅ DONE | `eval/promptfoo/*`, `scripts/run-promptfoo.cjs`, `package.json`, COMPLETION_LOG RE-005 |
| RE-006 | Add first `promptfoo` suites for executive summary quality, fix specificity, and status preservation | QA | ✅ DONE | `eval/promptfoo/promptfooconfig.report.yaml`, COMPLETION_LOG RE-006 |
| RE-007 | Evaluate `ragas` fit for retrieval faithfulness / answer relevance; produce go/no-go note before implementation | Architect + QA | ✅ DONE | `PLAYBOOK/ragas-fit-evaluation.md`, COMPLETION_LOG RE-007 |
| RE-008 | If approved, add `ragas`-based offline eval pipeline for retrieval runs and answer faithfulness | QA + Backend | ⬜ PENDING | — |
| RE-009 | Add prompt-cluster / demand-layer research backlog item with clear dependency on retrieval foundation | Architect | ⬜ PENDING | — |
| RE-010 | Add citation / share-of-voice benchmarking backlog item with external-source methodology and limits | Architect + Backend | ⬜ PENDING | — |
| RE-011 | Add stable eval-run identity for site-level history (`framework`, `domain`, `site_url`, prompt-set metadata) | Backend + Database | ✅ DONE | `011_eval_run_metadata.sql`; COMPLETION_LOG RE-011 … RE-015 |
| RE-012 | Persist Promptfoo runs into Supabase for admin analytics | Backend | ✅ DONE | `scripts/promptfoo-eval-write.ts`, `lib/server/promptfoo-results.ts`; COMPLETION_LOG RE-011 … RE-015 |
| RE-013 | Upgrade `/dashboard/evals` into site/framework trend analytics across report + retrieval runs | Frontend | ✅ DONE | `app/dashboard/evals/page.tsx`; COMPLETION_LOG RE-011 … RE-015 |
| RE-014 | Add Promptfoo result parsing helpers + metrics needed for trend cards and run tables | Backend + QA | ✅ DONE | `lib/server/promptfoo-results.ts`, `lib/server/promptfoo-results.test.ts`; COMPLETION_LOG RE-011 … RE-015 |
| RE-015 | Add admin/internal RAGAS lane placeholder without shipping a runtime RAGAS pipeline | Architect + Frontend | ✅ DONE | `/dashboard/evals` framework filter + empty-state note; COMPLETION_LOG RE-011 … RE-015 |
| RE-016 | If approved, add `ragas`-based offline writer + persistence into retrieval analytics | QA + Backend | ⬜ PENDING | — |
| RE-017 | Add deterministic retrieval-eval writer that persists aggregate run + prompt / passage / answer rows | Backend + QA | ✅ DONE | `scripts/retrieval-eval-write.ts`, `lib/server/retrieval-eval-writer.ts`; COMPLETION_LOG RE-017 |
| RE-018 | Add retrieval-run admin drilldown and make landing header auth-aware (`Dashboard` only when logged in) | Frontend + Backend | ✅ DONE | `app/dashboard/evals/retrieval/[id]/page.tsx`, `components/site-header.tsx`; COMPLETION_LOG RE-018 |

### API-as-a-Service Layer (deferred — start after Phase 4 launch readiness)
> **Phase 3→4 gate** is satisfied (auth + dashboard in repo). **API-002 … API-007** remain deferred until **Orchestrator** clears **Phase 4 — Launch** (at minimum **P4-001** production deploy + security evidence per `ORCHESTRATOR.md` Phase 4→Launch gate). **API-001** remains complete.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| API-001 | API key schema + migration | Database | ✅ DONE | `002_api_keys.sql` on remote; COMPLETION_LOG Supabase audit |
| API-002 | API key issuance + validation Worker | API | ⬜ DEFERRED | Starts after Phase 4 launch gate (Orchestrator) |
| API-003 | OpenAPI spec v1 | API + Architect | ⬜ DEFERRED | Starts after Phase 4 launch gate |
| API-004 | Rate limiting per API key | API + Security | ⬜ DEFERRED | Starts after Phase 4 launch gate |
| API-005 | API billing tiers (free/pro/enterprise) | API | ⬜ DEFERRED | Starts after Phase 4 launch gate |
| API-006 | Webhook delivery for async results | API | ⬜ DEFERRED | Starts after Phase 4 launch gate |
| API-007 | API documentation site | API + Frontend | ⬜ DEFERRED | Starts after Phase 4 launch gate |

### Measurement Platform (parallel planning / staged internal foundation)
> **Vision source:** `PLAYBOOK/measurement-platform-roadmap.md` + `PLAYBOOK/v3 aretefacts/*`. This initiative keeps the current audit/report business intact while adding a future measurement layer for AI visibility. It may proceed as planning and tightly scoped internal foundation work while Phase 4 is externally blocked, but it does **not** replace launch closure or change API deferral truth.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| BM-001 | Freeze architectural split: current app vs future measurement layer; record non-goals and staged rollout | Architect | ✅ DONE | `PLAYBOOK/measurement-platform-roadmap.md` |
| BM-002 | Define first benchmark schema set (`benchmark_domains`, `benchmark_query_sets`, `benchmark_queries`, `benchmark_run_groups`, `query_runs`, `query_citations`, `benchmark_domain_metrics`) | Architect + Database | ⬜ PENDING | — |
| BM-003 | Add LiteLLM integration plan and provider abstraction boundaries | Backend + Architect | ⬜ PENDING | — |
| BM-004 | Add Langfuse integration plan for traces, datasets, and eval experiments | Backend + Architect | ⬜ PENDING | — |
| BM-005 | Design internal benchmark runner for one domain / one query set / one model lane | Backend | ⬜ PENDING | — |
| BM-006 | Define citation extraction v1 contract and metric computation v1 (`citation_rate`, `query_coverage`, `share_of_voice`) | Architect + Backend | ⬜ PENDING | — |
| BM-007 | Design internal admin benchmark views and run controls before any customer-facing benchmark UI | Frontend + Product | ⬜ PENDING | — |
| BM-008 | Define phased scale path: 20–50 domains → 100–200 → 500–1000 with isolation from customer flows | Architect + Ops | ⬜ PENDING | — |

---

## Active Blockers

- `P4-003` operator blocker: domain purchase / DNS setup paused due to founder credit-card issue — 2026-03-26
- `P4-006` blocked on `P4-003` DNS evidence plus final security sign-off — 2026-03-26
- `P4-004` WAF remains a launch-policy decision (`DEFERRED / mitigated` in repo, but not fully closed operationally)

---

## Architecture Decisions Log (summary)
> Full ADRs in `agents/memory/DECISIONS.md`

| ID | Decision | Status |
|----|----------|--------|
| ADR-001 | Use `@opennextjs/cloudflare`, not deprecated `next-on-pages` | ✅ Final |
| ADR-002 | pdf-lib for PDF generation (not Puppeteer) | ✅ Final |
| ADR-003 | Gemini 2.5 Flash-Lite as LLM (provider is a config var) | ✅ Final |
| ADR-004 | Supabase RLS on all tables; leads = service_role only | ✅ Final |
| ADR-005 | n8n self-hosted on Oracle Cloud Free (not Make.com) | ✅ Final |
| ADR-006 | API-first architecture: GEO-Pulse is an API with a UI on top | ✅ Final |

---

## State history
| Date | Change |
|------|--------|
| 2026-03-24 | Phase 0 scaffold gate closed; **Current Phase → Phase 1 — Core Scan Engine**. P0-002…P0-006 ✅; API-001 ✅ (remote matches `002_api_keys.sql`). |
| 2026-03-24 | **Phase 1 — Core Scan Engine** implementation complete; **Current Phase → Phase 2 — Payment + PDF + Email**. P1-001…P1-011 ✅ (see COMPLETION_LOG). |
| 2026-03-24 | **Phase 1→2 manual gate:** live scan + results + email capture reported successful (domain: techehealthservices.com). |
| 2026-03-24 | **Sequencing:** API-as-a-Service (**API-002…007**) deferred until **Phase 2 + Phase 3** complete and **Phase 3→4 gate** satisfied (`ORCHESTRATOR.md`). Operator: $1 payment e2e reported working; Phase 2 task registry + COMPLETION_LOG evidence still to be closed out. |
| 2026-03-24 | **Phase 2 + Phase 3** implementation landed (auth, dashboard, `guest_email` on payments, middleware). **Current Phase → Phase 4 — Launch**. P2-001…P2-007 ✅; P2-008 operator QA; P3-001…P3-004 ✅. Run `supabase db push` for `004_payments_guest_email.sql`. |
| 2026-03-24 | **Phase 4 (partial):** P4-002 OG + P4-005 keep-alive cron **✅ in repo** (`COMPLETION_LOG.md` Phase 4 bundle). P4-001/P4-003/P4-004/P4-006 **pending** operator + Security. API-002…007 deferral clarified → **after Phase 4 launch gate**. |
| 2026-03-24 | **Deep Audit Upgrade** initiative added to Task Registry (**DA-001…DA-005**). Spec: `.cursor/plans/report_depth_and_formats_fa7e556e.plan.md`; companion: [`PLAYBOOK/audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md). Sequencing vs Phase 4: Orchestrator call (parallel vs after P4 operator work). |
| 2026-03-24 | **PLAYBOOK:** Renamed `audit uprade.md` → [`audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md); links in this file updated. |
| 2026-03-25 | **Checkout rate limit + DA-001:** Operator note — `POST /api/checkout` capped at **5/IP/hour** (wait or alternate IP). **DA-001** marked **IN_PROGRESS**; parallel with Phase 4 operator work per `agents/ORCHESTRATOR.md`. |
| 2026-03-25 | **DA-001 (implementation):** `scan_runs` / `scan_pages` migration + RLS; paid flow creates `scan_run` and enqueues **v2**; Worker runs capped same-origin crawl, updates `scans` aggregate + PDF multi-page. **Pending:** remote DB migration + Orchestrator acceptance + optional Security note (fetch path unchanged from P1 `fetch-page` until DA-002). |
| 2026-03-25 | **DA-001 — CLOSED (Orchestrator):** Paid deep-audit smoke on **techehealthservices.com** — multi-page PDF (10 URLs, aggregate score, per-page checklist). **DA-002** marked **IN_PROGRESS** (central fetch gate + robots/sitemap + sampling; Security review on fetch/SSRF). |
| 2026-03-25 | **DA-002 — DONE (implementation):** Central fetch gate (`fetchGateText`, stream byte cap), `validateEngineFetchUrl` (http/https for engine only), robots.txt + sitemap.xml discovery, section-aware URL ordering, `scan_pages.section`; free scan still uses HTTPS-only `validateUrl`. **Next:** **DA-003**. |
| 2026-03-25 | **DA-004 (incremental):** `parseRobotsTxt` reads `Crawl-delay` for `*`; `deep-audit-crawl` sleeps between non-seed fetches (cap 10s); `scan_runs.coverage_summary` adds `wall_time_ms`, `pages_errored`, `crawl_delay_ms`; `structuredLog` `deep_audit_crawl_complete`. Full DA-004 (Workflows / 100+ pages) still deferred. |
| 2026-03-25 | **Orchestrator sequencing:** Complete **Phase 4 → Launch** (P4-001, P4-003, P4-004, P4-006 + evidence) **before** resuming **DA-004** remainder / **DA-005** — see `agents/ORCHESTRATOR.md` § *Phase 4 first — defer remaining Deep Audit until Launch gate*. |
| 2026-03-25 | **Phase 4 — P4-001 + P2-008:** Production **`https://geo-pulse.uzzielt.workers.dev`** — live Stripe checkout success return path verified. **P4-003 / P4-004 / P4-006** still need evidence in `COMPLETION_LOG.md` for full Launch gate. |
| 2026-03-25 | **DA-004 (ops):** `DEEP_AUDIT_DEFAULT_PAGE_LIMIT` plaintext var in `wrangler.jsonc` + `getPaymentApiEnv` — default page cap for new paid `scan_runs`; `lib/server/deep-audit-page-limit.ts` single source for max + parsing. |
| 2026-03-26 | **UCD Report Journey Overhaul (5 phases) — COMPLETE.** Phase 1: 4 differentiating checks (AI crawler access, llms.txt, snippet eligibility, E-E-A-T signals) + `CheckContext` extended + weights rebalanced to 100 across 17 checks. Phase 2: PDF report rebuilt — branded cover, exec summary, score breakdown table, priority action plan, per-page breakdown, branded footer. Phase 3: Delivery email rebuilt — branded header, score badge, top 3 priorities w/ severity, CTA button, inline CSS. Phase 4: User-centered language rewrite across all components. Phase 5: Results page restructured — score hero → category health grid (4 pillars) → upgrade strip (dark) → numbered issues w/ severity chips → email gate → rescan link. Evidence: type-check 0 errors, 50/50 tests passed, build success. |
| 2026-03-26 | **Marketing Attribution Microservice (MA-001 → MA-004) — COMPLETE.** Parallel build: `analytics.marketing_events` (007), Zod contract + idempotent ingestion (39 tests), client UTM/session capture (`gp_anon_id` cookie + `gp_utm` sessionStorage), emits from scan/leads/checkout/webhook, first-touch/last-touch views (008), weekly funnel aggregate, Monday cron email (opt-in `MARKETING_REPORT_TO`). `leads.scan_id` now persisted. MA-005 (queue hardening) deferred. Evidence: type-check 0 errors, 89/89 tests, 0 lint errors. |
| 2026-03-26 | **Admin & report eval (ADM-001 … EVAL-004) — implementation in repo.** `/admin/login` password for `ADMIN_EMAIL`, `report_eval_runs` + `reports.markdown_url`, `/dashboard/evals`, `npm run eval:smoke`. See Task Registry **Admin & report quality eval** + `COMPLETION_LOG.md`. **Phase 4** still blocked on P4-003 / P4-006 operator evidence per `ORCHESTRATOR.md`. |
| 2026-03-26 | **P4-004 / P4-006 (tests):** Unit tests for CVE-2025-29927 middleware guard (`lib/server/middleware-cve.ts`, `middleware-cve.test.ts`) — supplements `middleware.ts` belt-and-suspenders check; paste Vitest output into `COMPLETION_LOG` for Security review. |
| 2026-03-26 | **v2 Enhancement Plan — Tier 1 COMPLETE.** T1-1: `CheckStatus` 6-value enum + `CheckCategory` 5-value type in `audit.ts`. T1-2: 17 checks mapped to categories (ai_readiness, extractability, trust). T1-3: `computeCategoryScores` in `scoring.ts` with v2 weighting (BLOCKED/NOT_EVALUATED excluded; LOW_CONFIDENCE = 50%). T1-4: `score-display.tsx` 5-pillar category grid (replaces 4-pillar). T1-5: category breakdown table in Markdown + PDF reports. LLM checks now carry `confidence` + `status: LOW_CONFIDENCE` when confidence is low. Evidence: type-check 0 errors, 96/96 tests pass. |
| 2026-03-26 | **Task ledger reconciliation:** v2 plan pointer in `PROJECT_STATE.md` marked stale (referenced `.cursor/plans/...` file not present in repo). Task statuses corrected for implemented checks/views: **T2-1…T2-6** and **T3-6** set to **DONE** based on shipped code. Added explicit bite-size backlog sections: **Audit Closure — Report Integrity + Product Truth** (**AU-001…AU-010**) and **Retrieval / Evaluation Backlog** (**RE-001…RE-010**) including `promptfoo` and `ragas` as backlog items only, not implemented features. |
| 2026-03-26 | **AU-001 … AU-005 / AU-007 — COMPLETE (implementation).** Deep-audit reports now separate `highlightedIssues` from `allIssues`, render the full sitewide breakdown, preserve v2 statuses in Markdown/PDF, keep `full_results_json` aligned with `categoryScores` + report metadata, expose coverage summary in customer-facing report output, and remove inaccurate checkout copy about exact check count. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **AU-009 / AU-010 — COMPLETE (implementation).** Report eval moved from shallow structural checks to content-integrity assertions, and golden fixtures now cover multi-page output plus blocked / low-confidence / not-evaluated statuses. `scripts/report-eval-smoke.ts` now uses rubric version `integrity-v2`. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-001 / RE-002 — COMPLETE (foundation).** Added retrieval-eval scope doc (`PLAYBOOK/retrieval-eval-foundation.md`) and schema scaffold (`010_retrieval_eval_foundation.sql`) for future retrieval simulation, `promptfoo`, and possible `ragas` adoption. No runtime retrieval harness implemented yet. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **AU-006 / AU-008 — COMPLETE (implementation).** Deep-audit reports now include a structured technical appendix in Markdown/PDF, and the SSRF/security docs were updated to match the implemented protection model and Cloudflare Workers runtime limitations. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-003 — COMPLETE (foundation).** Added deterministic retrieval simulation helpers in `lib/server/retrieval-eval.ts` with passage extraction, lexical ranking, and prompt-level metrics. This is an offline harness only; no `promptfoo`, `ragas`, or live engine integration yet. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-004 — COMPLETE (design / truth pass).** Added a benchmark-percentile design note and removed unsupported percentile claims from the current API contract, PRD report promise, OG-image guidance, and audit-upgrade metrics. Percentile output remains deferred until cohorting, snapshots, and guardrails exist. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-005 — COMPLETE (implementation).** Added a repo-local `promptfoo` skeleton with report and retrieval suites, custom local providers, a repo-scoped runner to avoid user-profile writes, package scripts, and `.promptfoo/` ignore. This is a regression harness only; `ragas` remains pending. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-006 / RE-007 — COMPLETE (implementation / evaluation).** Promptfoo report coverage now checks executive summary extraction, fix specificity, and status preservation. Added a formal `ragas` fit note with a current no-go decision until the retrieval dataset and answer-generation layer are mature enough to justify semantic scoring. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-011 … RE-015 — COMPLETE (implementation).** Eval analytics now carry stable site/framework metadata via `011_eval_run_metadata.sql`; Promptfoo runs can be written into Supabase with `scripts/promptfoo-eval-write.ts`; `/dashboard/evals` is now a site-centric admin analytics view spanning report + retrieval runs with framework filters, trend views, and an explicit RAGAS placeholder lane. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-017 — COMPLETE (implementation).** Added a deterministic retrieval writer over the existing foundation: fixture-driven site pages + prompts are simulated, persisted into `retrieval_eval_runs`, `retrieval_eval_prompts`, `retrieval_eval_passages`, and `retrieval_eval_answers`, and can now support future admin drilldown. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **RE-018 — COMPLETE (implementation).** Added a retrieval-run admin drilldown page from `/dashboard/evals` and made the landing header session-aware so `Dashboard` only appears when a user is logged in. Signed-in users now see `Dashboard` + `Sign out`; signed-out users see only sign-in actions. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **DA-004 (incremental resume):** Added chunk-progress metrics and continuation guardrails to `crawl_pending` / `coverage_summary`, surfaced chunk metrics in Markdown/PDF coverage output, raised the deep-audit cap to **1000** pages, and aligned final coverage reporting with the configured chunk size. |
| 2026-03-26 | **DA-004 — COMPLETE (user-directed reopen).** Added a targeted `deep-audit-crawl` Vitest that exercises partial requeue, `crawl_pending`, continuation, and final coverage metrics for a multi-chunk run. `npm.cmd run type-check` passed and `npx.cmd vitest run workers/scan-engine/deep-audit-crawl.test.ts` passed (7/7). Workflows is now tracked as optional future scale work, not DA-004 remainder. |
| 2026-03-26 | **UX-001 — COMPLETE (implementation).** Added a centralized delayed long-wait overlay with animated step progression and wired it into scan submit, checkout, email save, login, admin login, results load, and report load. Fast-path buttons still use local pending labels; the overlay only appears after a delay for longer waits. `npm.cmd run type-check` and `npm.cmd run build` passed. |
| 2026-03-26 | **P4-006 repo evidence refreshed.** Added targeted Turnstile and Stripe webhook route tests, then re-ran the Phase 4 security Vitest slice (`middleware-cve`, `turnstile`, `ssrf`, `checkout-completed`, webhook route): 5 files / 25 tests passed. `npm.cmd run type-check` and `npm.cmd run build` passed. `P4-006` remains pending until operator DNS evidence (`P4-003`) and final security sign-off are attached. |
| 2026-03-26 | **Phase 4 operator pause recorded.** Founder could not complete domain purchase because of a credit-card issue. `P4-003` is now explicitly operator-blocked, and final `P4-006` sign-off remains pending on that DNS evidence. Repo-side security/test work is current; revisit once domain purchase can be completed. |
| 2026-03-26 | **UX journey clarity stream opened.** User testing showed that the scan → preview → pay / save → report flow is functionally working but not communicating clear incremental steps. Added `UX-002` ... `UX-007` to track canonical journey design, state-driven status, and unified loading/report messaging while Phase 4 operator work is externally blocked. |
| 2026-03-26 | **UX-002 ... UX-006 — COMPLETE (implementation).** Results now present a single guided audit journey: preview first, full audit second, preview-save as the subtle alternative. Query-string-only checkout success messaging was removed in favor of results-page state derived from `hasPaidReport` / `reportStatus`, and the long-wait copy now frames preliminary and full audit generation as one continuous process. `npm.cmd run type-check` passed; `npm.cmd run build` passed outside sandbox after the usual `spawn EPERM` retry. |
| 2026-03-26 | **UX-007 — COMPLETE (verification).** Added a pure state-matrix test for the results journey (`lib/client/results-journey.test.ts`) covering preview-ready, checkout-cancelled, checkout-returned awaiting confirmation, generating, and delivered states. Verification notes recorded that both guest/public and signed-in results paths feed the same `hasPaidReport` / `reportStatus` shape into `ResultsView`, so the UX state model is shared across both flows. `npm.cmd run type-check` passed; targeted Vitest passed outside sandbox (1 file / 5 tests). |
| 2026-03-26 | **T3-7 — COMPLETE (implementation).** `components/report-viewer.tsx` now renders an interactive report shell above the markdown artifact: score/category summary, top-issue snapshot, mobile section chips, and collapsible report sections split from markdown `##` headings. Route ownership remains in `app/results/[id]/report/page.tsx`; existing PDF + raw markdown delivery path is preserved. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **DA-005 — COMPLETE (implementation).** Added an optional Browser Rendering-backed SPA fallback for paid deep audits: Browser Rendering client + heuristics, deep-audit crawl metrics for render attempts/success/failure, queue/run-config wiring, and security/operator docs. Disabled by default; this is not a full `/crawl` orchestration layer. Evidence logged in `COMPLETION_LOG.md`. |
| 2026-03-26 | **Measurement platform initiative opened.** Strategic direction is now explicit: keep the audit/report product as the wedge and build the benchmark/measurement layer as a staged internal platform on top. Added `PLAYBOOK/measurement-platform-roadmap.md` and `BM-001` ... `BM-008` to the task registry so the work is documented before implementation starts. |

---

## Known Constraints (do not debate these)
- No Vercel (commercial use prohibited on hobby plan)
- No Make.com (15x over free limit)
- No Puppeteer in Workers (V8 isolate, not Node.js)
- No `@cloudflare/next-on-pages` (deprecated)
- Gemini free tier: 1,000 RPD — architect around this
- Workers free tier CPU: 10ms — PDF gen requires paid $5/mo plan
- Supabase 500MB + 2GB bandwidth — monitor, Pro at $25/mo when needed
