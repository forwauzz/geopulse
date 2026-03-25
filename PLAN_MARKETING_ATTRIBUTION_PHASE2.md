# GEO-Pulse Phase 2 — Marketing Attribution Implementation Plan

**Status:** Execution Plan v1 (derived from deep research + PRD)  
**Date:** 2026-03-24  
**Scope:** Phase 2 only (parallel microservice, no core flow regressions)

---

## 1) Decision Summary (Locked for v1)

Based on research review, we are locking the following decisions for Phase 2:

1. **Attribution model:** first-touch + last-touch only (decision-grade, low complexity).
2. **Schema location:** raw events in a dedicated non-public schema (`analytics`), not `public`.
3. **Ingestion mode:** start with direct insert (no queue in PR1), add queue hardening later if needed.
4. **Idempotency:** mandatory from day one via `event_id` unique key.
5. **Hashing:** store **full SHA-256 hex** for `email_hash` (no truncation).
6. **Contract governance:** strict event schema validation (`zod.strict()` semantics).
7. **Webhook assumptions:** duplicates are normal (Stripe retries) — handlers and ingestion must be retry-safe.
8. **Reporting cadence:** weekly SQL-driven funnel report (no BI platform dependency in v1).

---

## 2) What We Are Building (Phase 2)

A parallel attribution service that captures campaign context and joins it to conversion outcomes.

### v1 objectives
- Capture: `utm_*`, referrer, content/session identifiers.
- Emit and store canonical lifecycle events:
  - `session_started`
  - `scan_started`
  - `scan_completed`
  - `lead_submitted`
  - `checkout_started`
  - `payment_completed`
- Resolve identities across:
  - `payment_id` -> `scan_id` -> `lead_id` -> `email_hash` -> `anonymous_id`
- Produce weekly report:
  - channel funnel,
  - campaign leaderboard,
  - content-level conversion,
  - stage drop-off,
  - time-to-conversion.

---

## 3) Guardrails (Non-Negotiable)

1. **No critical-path coupling:** failures in attribution cannot fail scan/checkout/payment fulfillment.
2. **Append-only raw events:** no mutation/deletion of historical event facts in normal flow.
3. **PII minimization:** no raw email in event table; use normalized SHA-256 hash.
4. **Backwards compatibility:** existing endpoint behavior remains unchanged.
5. **Observability required:** structured logs and ingestion counters from first release.

---

## 4) Data Contract (v1)

Required fields:
- `event_id` UUID
- `event_name` enum
- `event_ts`
- IDs: `anonymous_id`, `scan_id`, `lead_id`, `payment_id`, `user_id` (nullable)
- `email_hash` (full SHA-256 hex, nullable)
- UTMs: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- `referrer_url`, `landing_path`
- `channel`, `content_id`
- `metadata_json`

### Normalization rules
- Lowercase + trim for `utm_*` and `channel`.
- Canonical source map (e.g., `twitter`/`x.com` -> `x`).
- Normalize email before hashing (lowercase + trim) then SHA-256 hex.

### Attribution windows (fixed in v1)
- First-touch window: 30 days prior to conversion.
- Last-touch window: 7 days prior to conversion.
- If no eligible touchpoint in window: attribute as `direct_or_unknown`.

---

## 5) Schema Plan

## 5.1 New schema
- `analytics`

## 5.2 New tables/views
1. `analytics.marketing_events` (append-only, `event_id` unique)
2. `analytics.attribution_conversions_v1` (derived view/materialized view)
3. `analytics.channel_funnel_weekly_v1` (derived weekly aggregate)

## 5.3 Index strategy (initial)
- `(event_name, event_ts desc)`
- `(scan_id)`
- `(payment_id)`
- `(anonymous_id, event_ts desc)`
- `(utm_source, utm_campaign, event_ts desc)`

> Note: no blanket GIN on `metadata_json` initially; add only if query patterns justify.

## 5.4 Retention
- Raw events retained 12 months.
- Plan monthly partitioning when volume justifies it.

---

## 6) Service/API Plan

## 6.1 Internal ingestion endpoint
- `POST /internal/marketing/events`
- strict schema validation
- idempotent insert by `event_id`
- response:
  - `201` created
  - `200` duplicate/no-op
  - `400` validation error

## 6.2 Producer wiring points
- scan API: `scan_started` + `scan_completed`
- leads API: `lead_submitted`
- checkout API: `checkout_started`
- stripe webhook handler: `payment_completed`

## 6.3 Error handling
- Emit failures logged and counted.
- Do not throw user-facing errors for attribution write failures.

---

## 7) PR-by-PR Execution Plan

## PR 1 — Foundations (schema + contract)
**Deliverables**
- `analytics` schema migration
- `marketing_events` table + indexes + unique `event_id`
- strict Zod event schema/types
- ingestion endpoint skeleton
- unit tests for schema validation + idempotent duplicate handling

**Exit criteria**
- valid events insert successfully
- duplicate `event_id` is no-op
- invalid fields rejected

## PR 2 — Endpoint wiring
**Deliverables**
- producer emits from scan/leads/checkout/webhook
- shared helper for normalized campaign fields + hashed email
- best-effort emit wrappers

**Exit criteria**
- end-to-end single user journey emits all expected events
- no regression in scan/checkout success path

## PR 3 — Attribution views + weekly report
**Deliverables**
- first-touch/last-touch conversion view
- weekly funnel aggregate view
- SQL report query bundle + runbook

**Exit criteria**
- weekly report generated from production-like seed data
- at least one paid conversion traceable to campaign/source

## PR 4 — Hardening (optional trigger)
**Trigger**
- event volume, reliability, or replay needs exceed direct-write comfort

**Deliverables**
- queue-backed ingestion
- idempotent consumer
- retry/DLQ handling

---

## 8) Metrics and Operating Cadence

## 8.1 Quality metrics
- % paid conversions with known source/campaign > 90%
- % paid conversions with both first-touch + last-touch > 80%
- duplicate event insert error rate ~ 0%

## 8.2 Reliability metrics
- ingestion availability > 99.5%
- no attributable scan/checkout outages from microservice

## 8.3 Weekly operator review (Monday)
1. Channel funnel table
2. Campaign leaderboard
3. Content-level ROI proxy (`paid_conversions / clicks` where available)
4. Top leakage stage by source
5. 1 decision + 1 experiment for the week

---

## 9) Risk Register and Mitigation

1. **Schema drift**
   - strict validation, typed contract versioning
2. **Duplicate events**
   - unique `event_id`, idempotent processing
3. **Attribution loss on Safari/ITP**
   - persist touchpoints server-side as early as possible
4. **PII leakage**
   - hash-only email policy in analytics schema
5. **Data API exposure**
   - keep raw events out of public schema

---

## 10) Open Questions to Validate Before Build Starts

1. Do we standardize on 30d first-touch / 7d last-touch windows for v1?
2. Should `content_id` be mandatory when `utm_content` is missing?
3. Weekly report destination: SQL-only, CSV export, or Slack summary?
4. Do we need campaign taxonomy enforcement doc before PR 2?

---

## 11) Definition of Done (Phase 2 Attribution v1)

Attribution v1 is done when:
1. Service runs in parallel with zero critical-path coupling.
2. Raw events collected in `analytics.marketing_events` with strict validation.
3. First-touch + last-touch conversion views are operational.
4. Weekly report can answer “which campaign/channel converted to paid?”
5. One production week of data can support at least one channel optimization decision.

---

## 12) Practical Next Step (Immediate)

Start with **PR 1 (Foundations)** and keep all changes additive.
No UI changes are required in the first PR.

