# GEO-Pulse — Project State
> Maintained by: Orchestrator only
> Format: Update this file whenever a task changes state. Never delete history — add new entries.

---

## Current Phase: Phase 4 — Launch

**Phase goal:** Production deploy, OG share image, email DNS (SPF/DKIM/DMARC), WAF, keep-alive cron, launch security audit.

**Implementation status (2026-03-25):** P4-002 + P4-005 **in repo**. **P4-001** ✅ — production Worker `https://geo-pulse.uzzielt.workers.dev` + **live Stripe checkout** (redirect `?checkout=success`, “Payment received.”) — see `COMPLETION_LOG.md` *Phase 4 — operator evidence*. **P2-008** ✅ — production paid path verified. **Still to close with evidence in log:** **P4-003** (SPF/DKIM/DMARC), **P4-004** (WAF CVE-2025-29927), **P4-006** (Security sign-off on five blockers). **Phase 4→Launch gate** (`agents/ORCHESTRATOR.md`) requires all five security blockers + production smoke — Orchestrator marks when P4-003/004/006 evidence is attached.

**Operator note (2026-03-25):** Production checkout **`POST /api/checkout`** is rate-limited (**5 attempts per IP per hour**, `Retry-After: 3600` — see `lib/server/rate-limit-kv.ts` `checkCheckoutRateLimit`). Retesting paid checkout may require **waiting up to one hour** or using **another network/IP**. This is **not** a Stripe configuration failure by itself. **Sequencing:** **DA-001** ✅ · **DA-002** ✅ · **DA-003** ✅ · **DA-004** — **chunked queue continuation in repo** (`scan_runs.config.crawl_pending`, `runDeepAuditCrawl` → `phase: 'partial'` → `SCAN_QUEUE.send` same job); cap **120** pages (`MAX_DEEP_AUDIT_PAGE_LIMIT`), optional `chunk_size` in run config. **Still deferred:** Cloudflare Workflows for very long runs, **DA-005** (Browser Rendering / SPA). **Orchestrator:** close **Phase 4 — Launch** first (`agents/ORCHESTRATOR.md` § *Phase 4 first — defer remaining Deep Audit*). **Next (Phase 4):** paste **P4-003 / P4-004 / P4-006** evidence in `COMPLETION_LOG.md`; then **Phase 4→Launch gate**.

**Deep Audit Upgrade (v2):** Tracked in Task Registry (**DA-001…DA-005**); spec `.cursor/plans/report_depth_and_formats_fa7e556e.plan.md`, narrative [`PLAYBOOK/audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md). **DA-001** ✅ **DONE** — `005_scan_runs_scan_pages.sql`, queue **v2**, `runDeepAuditCrawl`, multi-page PDF (operator-verified). **DA-002** ✅ **DONE** — `workers/lib/fetch-gate.ts`, `validateEngineFetchUrl`, `robots-and-sitemap.ts`, `crawl-url-utils.ts` (section-aware cap), migration `006_scan_pages_section.sql`; **Security** formal sign-off on fetch path still recommended per `agents/SECURITY_AGENT.md`. **DA-003** ✅ **DONE** — `DeepAuditReportPayload`, `build-deep-audit-markdown.ts`, R2 upload + `reports.pdf_url`, Resend attach vs link policy (`DEEP_AUDIT_ATTACH_MAX_BYTES`). **DA-004 (partial)** — robots `Crawl-delay` + crawl metrics (`COMPLETION_LOG` DA-004-inc) **+ chunked queue re-invocation** (`crawl_pending` in `scan_runs.config`, up to **120** pages). Workflows / 1000+ page orchestration still deferred. Independent of Phase 4 closure; Orchestrator sets parallel vs sequential execution.

**How to close Phase 4:** Follow **`COMPLETION_LOG.md` → *Phase 4 — operator execution order*** — numbered steps + **Stripe Live checkpoint** (after production hostname is fixed). Paste deploy + DNS + WAF + smoke evidence there; Orchestrator marks tasks and Phase 4→Launch gate per `agents/ORCHESTRATOR.md`.

**Phase 2 — CLOSED (implementation in repo; operator: apply migration `004_payments_guest_email.sql`, verify PDF &lt;60s + webhook in staging).** Checkout (`app/api/checkout`), Stripe webhook + idempotency (`app/api/webhooks/stripe`, `lib/server/stripe/checkout-completed.ts`), queue → PDF → Resend (`workers/queue/report-queue-consumer.ts`), DLQ replay (`workers/queue/dlq-replay.ts`). Tests: `npm run test`, `lib/server/stripe/checkout-completed.test.ts`.

**Phase 3 — CLOSED (implementation in repo).** Magic link (`app/login`, `app/login/actions.ts`), OAuth callback + guest purchase linking (`app/auth/callback`, `lib/server/link-guest-purchases.ts`), middleware session + CVE header (`middleware.ts`, `lib/supabase/middleware.ts`), dashboard (`app/dashboard`). Gate: sign in → `/dashboard` lists `scans` / `reports` for `auth.uid()`; unauthenticated `/dashboard` → `/login`.

**Prior phase goal (Phase 2):** Stripe checkout → webhook (verified) → queue → pdf-lib report → Resend delivery + idempotency + DLQ.

**Orchestrator sequencing:** Phases **2** and **3** are complete in repo; **Phase 4 — Launch** is in progress. **Deep Audit Upgrade:** **DA-001–003** ✅; **DA-004** partial (politeness + metrics + chunked queue crawl) ✅ / Workflows-scale deferred; **DA-005** deferred — **does not replace** Phase 4 tasks or API deferral rules. **API-as-a-Service** (**API-002 … API-007**) starts only after **Phase 4→Launch gate** (see `ORCHESTRATOR.md`). **API-001** (schema) stays done.

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
| P2-008 | $1 test payment end-to-end test | QA | ✅ DONE | COMPLETION_LOG Phase 4 — operator evidence; live payment `geo-pulse.uzzielt.workers.dev` → `checkout=success` |

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
| P4-003 | SPF + DKIM + DMARC configured | Security | ⬜ PENDING | Operator: DNS + Resend; evidence in COMPLETION_LOG |
| P4-004 | WAF rules enabled (CVE-2025-29927) | Security | ⬜ DEFERRED (paid CF) / mitigated | Managed WAF often needs **paid** Cloudflare — **mitigation in repo:** `middleware.ts` + patched Next.js; full WAF when upgraded — `COMPLETION_LOG` P4-004 paid-plan note; **P4-006** Security acknowledges |
| P4-005 | Supabase keep-alive cron configured | Backend | ✅ DONE | `wrangler.jsonc` `triggers.crons`, `workers/cloudflare-entry.ts` `scheduled`; COMPLETION_LOG Phase 4 bundle |
| P4-006 | Launch security audit (all 5 blockers) | Security | ⬜ PENDING | Checklist in COMPLETION_LOG Phase 4 bundle; sign-off after P4-003/P4-004 + production smoke |

### Deep Audit Upgrade (multi-page paid audit — “v2”)
> **Spec:** `.cursor/plans/report_depth_and_formats_fa7e556e.plan.md` (§ Target architecture). **Narrative / executive summary:** [`PLAYBOOK/audit-upgrade.md`](../../PLAYBOOK/audit-upgrade.md). **Does not replace** Phase 4 or API deferral rules in `agents/ORCHESTRATOR.md` — Orchestrator sets **start date** and whether this runs **in parallel with** or **after** Phase 4 operator tasks. **Security** sign-off required on fetch-gate / SSRF changes (DA-002).

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| DA-001 | Phase 0: `scan_runs` / `scan_pages` + RLS; payment → deep crawl + cap; free scan unchanged | Backend + Database | ✅ DONE | COMPLETION_LOG DA-001 (✅ ACCEPTED); operator smoke: paid PDF for `https://techehealthservices.com/` — **Pages scanned** + per-page checklist (10 URLs, site aggregate score); migration `005_scan_runs_scan_pages.sql` |
| DA-002 | Phase 1: Central fetch gate (extend `workers/lib/ssrf.ts`); robots + sitemap streaming; section-aware sampling | Backend + Security | ✅ DONE | `workers/lib/fetch-gate.ts`, `validateEngineFetchUrl`, `deep-audit-crawl` + robots/sitemap + `prioritizeUrlsBySection`; `006_scan_pages_section.sql`; `npm run test` 36 passed; COMPLETION_LOG DA-002 — **Security** review recommended |
| DA-003 | Reporting: `DeepAuditReportPayload`; PDF/MD; R2 + email link policy | Backend | ✅ DONE | COMPLETION_LOG DA-003; `workers/report/*`, `report-queue-consumer.ts`, `wrangler.jsonc` `r2_buckets` + `DEEP_AUDIT_R2_PUBLIC_BASE`; CI runs `cf-typegen` |
| DA-004 | Phase 2: Scale (Queues/Workflows), politeness, metrics | Backend | ⬜ IN_PROGRESS (partial) | **Done in repo:** Crawl-delay + metrics (COMPLETION_LOG DA-004-inc) **+ chunked crawl** (`deep-audit-crawl.ts` + `report-queue-consumer.ts` re-queue) **+ `DEEP_AUDIT_DEFAULT_PAGE_LIMIT` wrangler var** (`lib/server/deep-audit-page-limit.ts`, `ensure-deep-audit-job-queued.ts`). **Deferred:** Workflows for 1000+ pages / long wall-time orchestration |
| DA-005 | Phase 3 (optional): Browser Rendering / SPA crawl | Backend | ⬜ DEFERRED | Tier-gated; evidence in COMPLETION_LOG |

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

### v2 Enhancement Plan — Scoring Foundation + Check Expansion
> **Plan:** `.cursor/plans/geopulse_v2_enhancement_audit_36a0ecee.plan.md`. **Tier 1** (Scoring Foundation) completes the v2 status enum, category mapping, per-category scores, UI, and report integration. **Tier 2** adds new checks. **Does not replace** Phase 4 or API deferral rules.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| T1-1 | Extend `CheckResult` with v2 6-value status enum | Backend | ✅ DONE | `workers/lib/interfaces/audit.ts` — `CheckStatus` type |
| T1-2 | Add `category` field to `AuditCheck`; map 17 checks → 5 v2 categories | Backend | ✅ DONE | All 17 check files + `registry.ts` + `audit.ts` `CheckCategory` |
| T1-3 | Compute per-category 0-100 scores in `scoring.ts` | Backend | ✅ DONE | `computeCategoryScores`, `WeightedResult.category`; 96/96 tests |
| T1-4 | Surface 5 category scores in results UI | Frontend | ✅ DONE | `score-display.tsx` — 5-pillar grid replaces 4-pillar; `results-view.tsx` threads `categoryScores` |
| T1-5 | Category breakdown in PDF + Markdown reports | Backend | ✅ DONE | `build-deep-audit-markdown.ts`, `build-deep-audit-pdf.ts` — category table; `DeepAuditReportPayload.categoryScores` |
| T2-1 | New check: Schema.org @type validation | Backend | ⬜ PENDING | — |
| T2-2 | New check: Image alt text presence | Backend | ⬜ PENDING | — |
| T2-3 | New check: Content freshness signals | Backend | ⬜ PENDING | — |
| T2-4 | New check: External authority links | Backend | ⬜ PENDING | — |
| T2-5 | New check: Security headers | Backend | ⬜ PENDING | — |
| T2-6 | Surface LLM confidence in issue display | Frontend | ⬜ PENDING | — |
| T3-6 | In-browser rendered markdown report view | Frontend | ⬜ PENDING | — |
| T3-7 | Dynamic interactive report view | Frontend | ⬜ PENDING | — |

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

---

## Active Blockers

_None at this time._

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
| 2026-03-25 | **Phase 4 — P4-001 + P2-008:** Production **`https://geo-pulse.uzzielt.workers.dev`** — live Stripe checkout returns to `/results/<scanId>?checkout=success` (“Payment received.”). **P4-003 / P4-004 / P4-006** still need evidence in `COMPLETION_LOG.md` for full Launch gate. |
| 2026-03-25 | **DA-004 (ops):** `DEEP_AUDIT_DEFAULT_PAGE_LIMIT` plaintext var in `wrangler.jsonc` + `getPaymentApiEnv` — default page cap for new paid `scan_runs` (1–120); `lib/server/deep-audit-page-limit.ts` single source for max + parsing. |
| 2026-03-26 | **UCD Report Journey Overhaul (5 phases) — COMPLETE.** Phase 1: 4 differentiating checks (AI crawler access, llms.txt, snippet eligibility, E-E-A-T signals) + `CheckContext` extended + weights rebalanced to 100 across 17 checks. Phase 2: PDF report rebuilt — branded cover, exec summary, score breakdown table, priority action plan, per-page breakdown, branded footer. Phase 3: Delivery email rebuilt — branded header, score badge, top 3 priorities w/ severity, CTA button, inline CSS. Phase 4: User-centered language rewrite across all components. Phase 5: Results page restructured — score hero → category health grid (4 pillars) → upgrade strip (dark) → numbered issues w/ severity chips → email gate → rescan link. Evidence: type-check 0 errors, 50/50 tests passed, build success. |
| 2026-03-26 | **Marketing Attribution Microservice (MA-001 → MA-004) — COMPLETE.** Parallel build: `analytics.marketing_events` (007), Zod contract + idempotent ingestion (39 tests), client UTM/session capture (`gp_anon_id` cookie + `gp_utm` sessionStorage), emits from scan/leads/checkout/webhook, first-touch/last-touch views (008), weekly funnel aggregate, Monday cron email (opt-in `MARKETING_REPORT_TO`). `leads.scan_id` now persisted. MA-005 (queue hardening) deferred. Evidence: type-check 0 errors, 89/89 tests, 0 lint errors. |
| 2026-03-26 | **Admin & report eval (ADM-001 … EVAL-004) — implementation in repo.** `/admin/login` password for `ADMIN_EMAIL`, `report_eval_runs` + `reports.markdown_url`, `/dashboard/evals`, `npm run eval:smoke`. See Task Registry **Admin & report quality eval** + `COMPLETION_LOG.md`. **Phase 4** still blocked on P4-003 / P4-006 operator evidence per `ORCHESTRATOR.md`. |
| 2026-03-26 | **P4-004 / P4-006 (tests):** Unit tests for CVE-2025-29927 middleware guard (`lib/server/middleware-cve.ts`, `middleware-cve.test.ts`) — supplements `middleware.ts` belt-and-suspenders check; paste Vitest output into `COMPLETION_LOG` for Security review. |
| 2026-03-26 | **v2 Enhancement Plan — Tier 1 COMPLETE.** T1-1: `CheckStatus` 6-value enum + `CheckCategory` 5-value type in `audit.ts`. T1-2: 17 checks mapped to categories (ai_readiness, extractability, trust). T1-3: `computeCategoryScores` in `scoring.ts` with v2 weighting (BLOCKED/NOT_EVALUATED excluded; LOW_CONFIDENCE = 50%). T1-4: `score-display.tsx` 5-pillar category grid (replaces 4-pillar). T1-5: category breakdown table in Markdown + PDF reports. LLM checks now carry `confidence` + `status: LOW_CONFIDENCE` when confidence is low. Evidence: type-check 0 errors, 96/96 tests pass. |

---

## Known Constraints (do not debate these)
- No Vercel (commercial use prohibited on hobby plan)
- No Make.com (15x over free limit)
- No Puppeteer in Workers (V8 isolate, not Node.js)
- No `@cloudflare/next-on-pages` (deprecated)
- Gemini free tier: 1,000 RPD — architect around this
- Workers free tier CPU: 10ms — PDF gen requires paid $5/mo plan
- Supabase 500MB + 2GB bandwidth — monitor, Pro at $25/mo when needed
