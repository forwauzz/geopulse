# GEO-Pulse — Project State
> Maintained by: Orchestrator only
> Format: Update this file whenever a task changes state. Never delete history — add new entries.

---

## Current Phase: Phase 4 — Launch

**Phase goal:** Production deploy, OG share image, email DNS (SPF/DKIM/DMARC), WAF, keep-alive cron, launch security audit.

**Phase 2 — CLOSED (implementation in repo; operator: apply migration `004_payments_guest_email.sql`, verify PDF &lt;60s + webhook in staging).** Checkout (`app/api/checkout`), Stripe webhook + idempotency (`app/api/webhooks/stripe`, `lib/server/stripe/checkout-completed.ts`), queue → PDF → Resend (`workers/queue/report-queue-consumer.ts`), DLQ replay (`workers/queue/dlq-replay.ts`). Tests: `npm run test`, `lib/server/stripe/checkout-completed.test.ts`.

**Phase 3 — CLOSED (implementation in repo).** Magic link (`app/login`, `app/login/actions.ts`), OAuth callback + guest purchase linking (`app/auth/callback`, `lib/server/link-guest-purchases.ts`), middleware session + CVE header (`middleware.ts`, `lib/supabase/middleware.ts`), dashboard (`app/dashboard`). Gate: sign in → `/dashboard` lists `scans` / `reports` for `auth.uid()`; unauthenticated `/dashboard` → `/login`.

**Prior phase goal (Phase 2):** Stripe checkout → webhook (verified) → queue → pdf-lib report → Resend delivery + idempotency + DLQ.

**Orchestrator sequencing (2026-03-24):** Finish **Phase 2** (all P2 tasks + **Phase 2→3 gate**) and **Phase 3** (all P3 tasks + **Phase 3→4 gate**) **before** implementing **API-as-a-Service** (**API-002 … API-007**). **API-001** (schema) stays done; no API product work until Phase 3 is closed.

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
| P2-008 | $1 test payment end-to-end test | QA | ⬜ OPERATOR | Operator-verified $1 e2e; run `npm run test` + staging webhook |

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
| P4-001 | Production deploy to Cloudflare Pages + Workers | Backend | ⬜ PENDING | — |
| P4-002 | Share-your-score OG image generation | Frontend | ⬜ PENDING | — |
| P4-003 | SPF + DKIM + DMARC configured | Security | ⬜ PENDING | — |
| P4-004 | WAF rules enabled (CVE-2025-29927) | Security | ⬜ PENDING | — |
| P4-005 | Supabase keep-alive cron configured | Backend | ⬜ PENDING | — |
| P4-006 | Launch security audit (all 5 blockers) | Security | ⬜ PENDING | — |

### API-as-a-Service Layer (deferred — start after Phase 3 gate)
> Per orchestrator sequencing 2026-03-24: **API-002 … API-007** begin only after Phase 3 is complete and the Phase 3→4 gate is satisfied. **API-001** remains complete.

| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| API-001 | API key schema + migration | Database | ✅ DONE | `002_api_keys.sql` on remote; COMPLETION_LOG Supabase audit |
| API-002 | API key issuance + validation Worker | API | ⬜ DEFERRED | Starts after Phase 3 gate |
| API-003 | OpenAPI spec v1 | API + Architect | ⬜ DEFERRED | Starts after Phase 3 gate |
| API-004 | Rate limiting per API key | API + Security | ⬜ DEFERRED | Starts after Phase 3 gate |
| API-005 | API billing tiers (free/pro/enterprise) | API | ⬜ DEFERRED | Starts after Phase 3 gate |
| API-006 | Webhook delivery for async results | API | ⬜ DEFERRED | Starts after Phase 3 gate |
| API-007 | API documentation site | API + Frontend | ⬜ DEFERRED | Starts after Phase 3 gate |

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

---

## Known Constraints (do not debate these)
- No Vercel (commercial use prohibited on hobby plan)
- No Make.com (15x over free limit)
- No Puppeteer in Workers (V8 isolate, not Node.js)
- No `@cloudflare/next-on-pages` (deprecated)
- Gemini free tier: 1,000 RPD — architect around this
- Workers free tier CPU: 10ms — PDF gen requires paid $5/mo plan
- Supabase 500MB + 2GB bandwidth — monitor, Pro at $25/mo when needed
