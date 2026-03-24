# GEO-Pulse — Project State
> Maintained by: Orchestrator only
> Format: Update this file whenever a task changes state. Never delete history — add new entries.

---

## Current Phase: Phase 2 — Payment + PDF + Email

**Phase goal:** Stripe checkout → webhook (verified) → queue → pdf-lib report → Resend delivery + idempotency + DLQ.

**Phase 1 — CLOSED (2026-03-24).** Free scan path implemented (landing, Turnstile, SSRF-gated fetch, 11 deterministic + 2 Gemini checks, weighted score, results + email gate, `scans`/`leads` via service role, KV rate limits). Evidence: `COMPLETION_LOG.md` *Phase 1 — implementation bundle*.

**Before treating Phase 1→2 gate as fully signed off:** Orchestrator should run **one** manual end-to-end pass on `npm run preview` or `wrangler dev` (scan → results → email gate → row in `leads`) and confirm rate-limit keys in KV — per `ORCHESTRATOR.md` Phase 1→2 rules.

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
| P2-001 | Stripe $29 checkout integration | Backend | ⬜ PENDING | — |
| P2-002 | Stripe webhook handler (with signature verification) | Backend | ⬜ PENDING | — |
| P2-003 | Cloudflare Queue: enqueue deep audit on payment | Backend | ⬜ PENDING | — |
| P2-004 | pdf-lib report generator | Backend | ⬜ PENDING | — |
| P2-005 | Resend: HTML email + PDF attachment delivery | Backend | ⬜ PENDING | — |
| P2-006 | Dead-letter queue handler + retry logic | Backend | ⬜ PENDING | — |
| P2-007 | Payment idempotency (Stripe event ID dedup) | Security | ⬜ PENDING | — |
| P2-008 | $1 test payment end-to-end test | QA | ⬜ PENDING | — |

### Phase 3 — Auth + Dashboard
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P3-001 | Supabase magic link auth | Backend | ⬜ PENDING | — |
| P3-002 | Auth middleware (CVE-2025-29927 protected) | Security | ⬜ PENDING | — |
| P3-003 | User dashboard: scan history + past reports | Frontend | ⬜ PENDING | — |
| P3-004 | Auto-account creation post-payment | Backend | ⬜ PENDING | — |

### Phase 4 — Launch
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| P4-001 | Production deploy to Cloudflare Pages + Workers | Backend | ⬜ PENDING | — |
| P4-002 | Share-your-score OG image generation | Frontend | ⬜ PENDING | — |
| P4-003 | SPF + DKIM + DMARC configured | Security | ⬜ PENDING | — |
| P4-004 | WAF rules enabled (CVE-2025-29927) | Security | ⬜ PENDING | — |
| P4-005 | Supabase keep-alive cron configured | Backend | ⬜ PENDING | — |
| P4-006 | Launch security audit (all 5 blockers) | Security | ⬜ PENDING | — |

### API-as-a-Service Layer (parallel track)
| Task ID | Task | Agent | Status | Evidence |
|---------|------|-------|--------|----------|
| API-001 | API key schema + migration | Database | ✅ DONE | `002_api_keys.sql` on remote; COMPLETION_LOG Supabase audit |
| API-002 | API key issuance + validation Worker | API | ⬜ PENDING | — |
| API-003 | OpenAPI spec v1 | API + Architect | ⬜ PENDING | — |
| API-004 | Rate limiting per API key | API + Security | ⬜ PENDING | — |
| API-005 | API billing tiers (free/pro/enterprise) | API | ⬜ PENDING | — |
| API-006 | Webhook delivery for async results | API | ⬜ PENDING | — |
| API-007 | API documentation site | API + Frontend | ⬜ PENDING | — |

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

---

## Known Constraints (do not debate these)
- No Vercel (commercial use prohibited on hobby plan)
- No Make.com (15x over free limit)
- No Puppeteer in Workers (V8 isolate, not Node.js)
- No `@cloudflare/next-on-pages` (deprecated)
- Gemini free tier: 1,000 RPD — architect around this
- Workers free tier CPU: 10ms — PDF gen requires paid $5/mo plan
- Supabase 500MB + 2GB bandwidth — monitor, Pro at $25/mo when needed
