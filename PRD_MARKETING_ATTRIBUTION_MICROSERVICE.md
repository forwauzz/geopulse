# PRD — GEO-Pulse Marketing Attribution Microservice (Phase 2)

**Product:** GEO-Pulse  
**Document owner:** Product/Engineering  
**Status:** Draft v1 (for validation)  
**Date:** 2026-03-24

---

## 1) Executive Summary

GEO-Pulse currently captures core product events (scan, lead, checkout, payment) but lacks a dedicated attribution layer that ties marketing inputs (social/newsletter/outreach campaigns) to revenue outcomes.

This PRD defines a **parallel, isolated attribution microservice inside the monorepo** to:
- ingest campaign/session/event metadata,
- connect top-of-funnel activity to paid conversion,
- produce weekly decision-ready funnel reports,
- avoid impacting critical scan and checkout paths.

This is a **Phase 2-aligned** build: minimal infrastructure, high signal, low risk.

---

## 2) Context and Current State

### 2.1 Current product phase
- GEO-Pulse is in **Phase 2: Payment + PDF + Email**.
- Primary near-term objective is reliable paid fulfillment + conversion signal quality.

### 2.2 Current flow (already implemented)
1. User submits URL and starts scan.
2. Scan result is persisted in `scans`.
3. User may submit email in results flow (`leads`).
4. User may start paid checkout (Stripe session with `scan_id` metadata).
5. Stripe webhook triggers payment persistence and queueing report job.

### 2.3 Current data reality
- Product lifecycle entities exist (`scans`, `leads`, `payments`, `reports`).
- Attribution metadata (UTM/referrer/content id/session id) is not systematically captured and joined.
- Leads endpoint accepts `scanId` in request schema, but current insert behavior does not persist it.

---

## 3) Problem Statement

We cannot reliably answer:
- Which channel/campaign/content generated paid users?
- Which funnel stage leaks most by source?
- Which content format (post/video/newsletter) creates actual revenue vs vanity engagement?

As a result, growth decisions are currently guesswork and difficult to optimize.

---

## 4) Goals and Non-Goals

## 4.1 Goals (Phase 2)
1. Build an attribution microservice that runs in parallel with core app paths.
2. Capture **first-touch and last-touch** marketing context for all key funnel events.
3. Resolve identities across anonymous sessions, scans, leads, and payments.
4. Produce a weekly attribution report used for tactical channel decisions.
5. Keep implementation low-risk, minimal, and reversible.

## 4.2 Non-Goals (for v1)
- Multi-touch probabilistic attribution modeling.
- Customer data platform replacement.
- Full BI platform build-out.
- Phase 3/4 feature work (auth dashboard, enterprise analytics suite).

---

## 5) Personas and Primary Users

1. **Founder/Growth operator**
   - Needs weekly answer: “what generated paid conversions?”
2. **Product/engineering**
   - Needs low-latency, non-breaking event ingestion.
3. **Future acquisition/diligence reviewer (optionality)**
   - Needs auditable funnel evidence (source → conversion).

---

## 6) Scope

## 6.1 In Scope (v1)
- New attribution schema + migration(s).
- Event contract and ingestion endpoint/service.
- UTM/referrer/session metadata capture on key endpoints.
- Identity stitching across anon session, scan, lead, payment.
- Weekly reporting views/queries.
- Basic operational monitoring and dead-letter handling.

## 6.2 Out of Scope (v1)
- Real-time dashboards with advanced charting UI.
- Marketing automation orchestration itself (content posting, outbound sequence sending).
- Marketing spend ingestion from ad APIs.

---

## 7) Architecture Overview

### 7.1 Design principles
- **Parallel by default:** attribution must not block scan or checkout success paths.
- **Append-only event stream:** preserve raw facts before transformation.
- **Monorepo isolation:** separate service/module boundaries to protect core app stability.
- **Privacy-aware by design:** store minimum viable attribution identifiers.

### 7.2 Proposed topology
- `services/marketing-attribution/` (or `workers/marketing-attribution/`) contains:
  - event schema/type definitions,
  - ingestion handler,
  - transformation jobs,
  - report query templates.
- Data store: Supabase tables in `public` or dedicated schema (`analytics`).
- Optional queue decoupling: emit events to queue then ingest asynchronously.

---

## 8) Event Model (Canonical Contract)

Each event must include:
- `event_id` (UUID)
- `event_name` (enum)
- `event_ts` (ISO timestamp)
- `anonymous_id` (cookie/session id; nullable)
- `scan_id` (nullable)
- `lead_id` (nullable)
- `payment_id` (nullable)
- `user_id` (nullable)
- `email_hash` (nullable, SHA-256 truncated)
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (nullable)
- `referrer_url`, `landing_path`
- `channel` (derived or explicit)
- `content_id` (specific post/video/newsletter id)
- `metadata_json` (extensible payload)

### 8.1 v1 event names
- `session_started`
- `scan_started`
- `scan_completed`
- `lead_submitted`
- `checkout_started`
- `payment_completed`
- `report_delivered` (optional in v1 if easy)

---

## 9) Data Model (v1)

## 9.1 Tables

### A) `marketing_events` (append-only)
- `id` UUID PK
- `event_name` TEXT NOT NULL
- `event_ts` TIMESTAMPTZ NOT NULL DEFAULT now()
- `anonymous_id` TEXT NULL
- `scan_id` UUID NULL
- `lead_id` UUID NULL
- `payment_id` UUID NULL
- `user_id` UUID NULL
- `email_hash` TEXT NULL
- `utm_source` TEXT NULL
- `utm_medium` TEXT NULL
- `utm_campaign` TEXT NULL
- `utm_content` TEXT NULL
- `utm_term` TEXT NULL
- `referrer_url` TEXT NULL
- `landing_path` TEXT NULL
- `channel` TEXT NULL
- `content_id` TEXT NULL
- `metadata_json` JSONB NOT NULL DEFAULT '{}'::jsonb
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Indexes:
- `(event_name, event_ts DESC)`
- `(scan_id)`
- `(payment_id)`
- `(utm_source, utm_campaign, event_ts DESC)`
- `(anonymous_id, event_ts DESC)`

### B) `attribution_conversions` (derived table or materialized view)
- one row per `payment_completed`
- includes first-touch and last-touch dimensions
- includes conversion latency (`payment_ts - first_seen_ts`)

### C) `marketing_touchpoints` (optional derived)
- normalized session/touch summary for easier reporting

## 9.2 Existing table alignment
- Do not remove or break existing `scans`, `leads`, `payments`, `reports` behavior.
- Extend existing writes with non-blocking attribution emits.

---

## 10) Identity Resolution Strategy (v1)

Priority order for stitching:
1. `payment_id` / Stripe event linkage
2. `scan_id`
3. `lead_id`
4. `email_hash`
5. `anonymous_id`

Rules:
- Never store raw email in attribution events if avoidable; use deterministic hash for joins.
- First-touch = earliest known touchpoint for stitched identity.
- Last-touch = touchpoint immediately prior to conversion event.

---

## 11) API/Interface Requirements

### 11.1 Internal ingestion interface
`POST /internal/marketing/events`

Request body:
- accepts canonical event payload
- validates schema strictly (Zod)
- rejects unknown event names unless feature-flagged

Response:
- `202 accepted` for async mode
- `201 created` for direct insert mode

### 11.2 Producer touchpoints (existing app)
- Scan API route emits `scan_started`/`scan_completed`.
- Leads route emits `lead_submitted`.
- Checkout route emits `checkout_started`.
- Webhook checkout completion emits `payment_completed`.

### 11.3 Failure policy
- Ingestion failure must not fail user-facing critical path (best-effort emit + log).
- Retry via queue if enabled.

---

## 12) Reporting Outputs (v1)

Required weekly outputs:
1. Channel funnel table:
   - visits/sessions
   - scans started/completed
   - leads submitted
   - checkout started
   - payments completed
2. Campaign leaderboard by paid conversions.
3. Content-level conversion table (`content_id`).
4. Time-to-conversion distribution.
5. Drop-off by stage and source.

Delivery:
- SQL view + scheduled export (CSV/email/slack optional).

---

## 13) Security, Privacy, and Compliance

- Follow existing secret management (`wrangler secret put` patterns).
- No service-role key exposure to client-side code.
- Apply RLS and least-privilege access where applicable.
- Minimize PII in event payloads; hash emails for attribution joins.
- Retention policy:
  - raw events retained 12 months (configurable),
  - derived aggregates retained indefinitely or per cost policy.

---

## 14) Reliability and Performance Requirements

- P95 ingestion latency < 200 ms (direct mode target).
- Event loss target < 0.1% under normal operation.
- Ingestion service availability target 99.5%+.
- No measurable degradation to scan/checkout endpoint latency due to attribution logging.

Observability:
- structured logs for emit attempts/failures,
- counters for accepted/rejected events,
- retry and DLQ visibility if queue mode enabled.

---

## 15) Rollout Plan

### Phase A — Foundation (PR 1)
- Add schema + migration(s)
- Add canonical event types/validator
- Add ingestion endpoint/service skeleton

### Phase B — Wiring (PR 2)
- Emit events from scan/leads/checkout/webhook paths
- Add identity stitching helper utilities

### Phase C — Reporting (PR 3)
- Create weekly funnel queries/views
- Add weekly report runbook and example output

### Phase D — Hardening (PR 4, optional)
- Queue-backed ingestion
- replay support + DLQ handling

---

## 16) Success Metrics (v1)

Product metrics:
- % conversions with known source/campaign (target: >90%)
- % conversions with known first-touch and last-touch (target: >80%)
- weekly report generation success (target: 100%)

Engineering metrics:
- no P1 incidents caused by attribution service
- no critical path regression in scan/checkout endpoints

Business decision metrics:
- at least one channel or campaign decision per week driven by report data

---

## 17) Risks and Mitigations

1. **Event schema drift**
   - Mitigation: strict versioned contract + validator
2. **Identity mismatch/incomplete joins**
   - Mitigation: deterministic precedence + backfill scripts
3. **PII over-collection**
   - Mitigation: explicit schema review + hash-first policy
4. **Critical-path coupling**
   - Mitigation: non-blocking emit and best-effort writes
5. **Over-engineering in Phase 2**
   - Mitigation: v1 scope freeze and phased PRs

---

## 18) Open Questions (for validation)

1. Should `marketing_events` live in `public` or dedicated `analytics` schema?
2. Do we want queue-based ingestion from day one or direct DB writes first?
3. What is the preferred weekly report destination (email, dashboard, slack, CSV)?
4. Do we need content-level IDs for all channels in v1, or campaign-level only?
5. What retention policy is acceptable for raw events?

---

## 19) Acceptance Criteria (Definition of Done)

The PRD v1 is considered implemented when:
1. Attribution schema migration is applied successfully.
2. Canonical event ingestion endpoint validates and stores events.
3. Existing funnel endpoints emit required v1 events.
4. At least one paid conversion can be traced from source/campaign to payment.
5. Weekly funnel report is generated with channel and campaign breakdown.
6. Core scan and checkout flows remain functionally unchanged for end users.

---

## 20) Implementation Notes for Another LLM/Engineer

If you are implementing from this PRD:
- Start with schema + ingestion contract before wiring producers.
- Keep service isolated; avoid broad refactors.
- Preserve backward compatibility on existing endpoints.
- Prefer additive DB changes only.
- If uncertain, prioritize data integrity and non-blocking behavior over feature breadth.

