# Architecture Hardening Backlog

Last updated: 2026-03-27

## Purpose

This backlog keeps GEO-Pulse on a platform path that is:
- lean
- easy to debug
- secure
- scalable enough for the current product shape
- maintainable for new developers and future handoff

It exists to prevent two failure modes:
- solving small problems with oversized code paths
- letting internal tools grow faster than the architecture that supports them

## Core standards

Every future implementation slice should prefer:

1. the smallest correct solution
   - if 5 lines solve the problem safely, do not ship 30

2. one clear owner per concern
   - validation in one place
   - fetch policy in one place
   - persistence in one place
   - UI composition in one place

3. state that is inspectable
   - operators should not need backend console access for routine diagnosis

4. explicit boundaries
   - app routes and server actions should stay thin
   - reusable logic should live in `lib/server/`, `workers/`, or `services/`

5. security before convenience
   - no duplicated URL validation
   - no secret handling outside the established env helpers
   - no silent auth or admin assumptions

## Current architectural read

Repo strengths:
- clear separation between app routes, server logic, Workers logic, and services
- strict TypeScript settings
- centralized SSRF and fetch-gate logic
- benchmark work is being added in narrow slices rather than one large subsystem
- project memory and playbooks are stronger than typical startup repos

Main current risks:
- some large modules are becoming maintenance magnets
- benchmark behavior is accumulating in metadata-driven seams faster than typed persistence
- admin operations still depend too much on backend logs and console access
- admin authorization is acceptable for the current founder-led stage, but not a long-term role model
- browser-level coverage is now started via open-source Playwright smoke tests, but only a small flow set is covered so meaningful regressions can still escape outside that slice
- Playwright stability depends on keeping the dev-server smoke lane simple; one serialized worker is the current truthful setting, and that is preferable to a flaky parallel lane

## Task slices

### AH-001 — Architecture hardening backlog + standards

Goal:
- make architectural expectations explicit before more subsystems are added

Acceptance:
- backlog doc exists
- current risks are named plainly
- next slices are broken into bounded tasks

### AH-002 — Persistent structured application logs

Goal:
- persist structured app logs so operators can inspect them without backend console access

Scope:
- add `app_logs` storage
- make `structuredLog` persist best-effort
- keep console output for runtime observability
- do not block request/worker success on log-write failures

Acceptance:
- recent structured logs can be queried in-app
- log writes are best-effort and non-fatal
- sensitive fields are redacted or truncated

### AH-003 — Admin logs page

Goal:
- give admins one place to inspect recent structured logs

Scope:
- add `/dashboard/logs`
- include event, time, level, and payload visibility
- keep the page internal/admin-only

Acceptance:
- admin can read recent structured logs from the dashboard
- the page works without backend shell access

### AH-004 — Playwright readiness

Goal:
- prepare the codebase for browser-level regression testing before test debt grows

Scope:
- define which flows should become first Playwright tests
- define selector/testability rules
- avoid adding brittle UI that has no stable testing hooks

First candidate flows:
1. free scan submit and results render
2. checkout start and return-state messaging
3. admin login
4. benchmark trigger and benchmark run detail inspection

Acceptance:
- a Playwright readiness section exists in docs
- first test candidates are named
- selector/testability rules are explicit

### AH-005 — Thin-route cleanup

Goal:
- reduce repeated env/auth/service-role setup in routes and server actions

Scope:
- extract shared admin/server context helpers where repetition is real
- do not create a giant abstraction layer

Current repo truth:
- the first thin-route cleanup slice is now in repo
- admin pages and benchmark server actions now share a small admin runtime helper for auth, env, and service-role setup
- this is intentionally limited to the highest-duplication admin paths; it is not a broad request-context framework

Acceptance:
- repeated setup code is reduced
- route handlers become easier to read

### AH-006 — Large-module decomposition

Goal:
- stop the biggest files from becoming debugging bottlenecks

Current repo truth:
- the first AH-006 slice is now in repo
- `app/dashboard/benchmarks/[runGroupId]/page.tsx` is reduced to a data-loading shell
- benchmark run-detail rendering now lives in `components/benchmark-run-detail-view.tsx`
- pure run-detail parsing and formatting helpers are owned by `lib/server/benchmark-run-detail.ts` with targeted tests
- this is intentionally a narrow decomposition slice, not a sweeping benchmark UI rewrite

Priority candidates:
1. `workers/scan-engine/deep-audit-crawl.ts`
2. `workers/report/build-deep-audit-pdf.ts`
3. `app/dashboard/benchmarks/[runGroupId]/page.tsx`
4. `components/report-viewer.tsx`

Acceptance:
- each decomposition is done as a narrow slice
- behavior stays the same
- tests move with the extracted logic

### AH-007 — Admin auth maturity plan

Goal:
- keep current simple admin access working while documenting the future path

Current truth:
- env-based single-email admin gating is acceptable for the current internal stage
- it is not the final long-term admin authorization model

Current repo truth:
- `platform_admin_users` is the live source of truth for admin access
- `app/admin/login/actions.ts`, `app/admin/layout.tsx`, `middleware.ts`, and the distribution OAuth gate all enforce that same DB-backed allowlist
- AH-007 is now complete as a design slice: the maturity path is documented here, and the runtime auth model has moved to the DB allowlist

Next-stage target:
- keep the allowlist table small and operator-managed
- keep provisioning operator-controlled; do not add self-service admin grants
- support a small explicit role set only when the product genuinely needs it, for example:
  - `founder_admin`
  - `operator`
  - `analyst`
- log admin access denials and admin membership changes through the shared structured log path
- preserve fail-closed behavior and generic auth errors during and after migration

Deferred on purpose:
- no full RBAC framework
- no customer-facing admin-management UI
- no multi-tenant org role model

Acceptance:
- future role-based or table-driven admin model is documented before scale requires it

### AH-008 — Playwright OSS foundation

Goal:
- add the first real browser-level regression lane using open-source Playwright, not a paid hosted layer

Scope:
- install `@playwright/test`
- add a repo-local Playwright config and output ignores
- add the first smoke specs for stable public entry flows
- wire the smoke suite into CI so route splits and UI refactors get browser-level verification
- do not claim full checkout, auth, or benchmark E2E coverage yet

Current repo truth:
- the first Playwright OSS foundation slice is now in repo
- the initial smoke coverage is intentionally narrow:
  1. landing page core scan entry points
  2. scan form blocks submit when Turnstile verification is missing
  3. scan form happy path with mocked scan APIs through submit, redirect, and results render
  4. results-page checkout-return state before payment confirmation
  5. customer login page render
  6. admin login page render
  7. unauthenticated benchmark admin access redirects to login with the correct `next` path
  8. authenticated admin dashboard render after non-production-only E2E session setup
  9. authenticated benchmark overview render after non-production-only E2E admin-data setup
  10. report-page render from mocked report content
- this uses the open-source Playwright test runner and local browser binaries only; no paid Playwright product is part of the setup
- the scan happy-path coverage uses a non-production-only Turnstile bypass env for E2E plus mocked scan APIs; production behavior is unchanged
- the authenticated admin coverage uses a non-production-only E2E auth session cookie; production Supabase auth behavior is unchanged
- the benchmark overview coverage uses a non-production-only E2E admin-data seam for benchmark tables; production service-role behavior is unchanged
- the smoke lane now runs with one worker and no full-parallel mode because that is the stable setting for the current Next dev-server path; reliability is more important than nominal speed here

Acceptance:
- Playwright config and scripts exist in repo
- at least one browser smoke spec passes locally
- CI runs the smoke suite
- documentation is explicit about covered vs uncovered flows

### AH-009 — Second large-module decomposition slice

Goal:
- continue large-file reduction with another narrow slice, keeping browser proof attached only where the refactor touches real behavior

Scope:
- reduce `components/report-viewer.tsx` to a fetch/state shell
- move pure report-viewer helpers into a dedicated utility module
- move heavy report-viewer render sections into a dedicated component module
- add targeted helper tests
- add one browser proof for the report page render path

Current repo truth:
- the second large-module decomposition slice is now in repo
- `components/report-viewer.tsx` is reduced to a state/fetch shell
- report-viewer helper logic now lives in `lib/client/report-viewer.ts`
- report-viewer section rendering now lives in `components/report-viewer-sections.tsx`
- browser coverage now includes report-page render from mocked report content

Acceptance:
- the report-viewer route behavior stays the same
- extracted helpers have targeted tests
- report-page browser coverage passes

### AH-010 — Third large-module decomposition slice

Goal:
- continue large-file reduction on the benchmark admin surface without widening benchmark behavior

Scope:
- reduce `app/dashboard/benchmarks/page.tsx` to a data-loading shell
- move heavy benchmark overview rendering into a dedicated component module
- move pure benchmark-overview formatting and href helpers into a dedicated server utility module
- keep the existing benchmark overview browser proof rather than adding a redundant new Playwright test

Current repo truth:
- the third large-module decomposition slice is now in repo
- `app/dashboard/benchmarks/page.tsx` is reduced to a thin admin/data-loading shell
- benchmark overview rendering now lives in `components/benchmark-overview-view.tsx`
- pure overview helpers now live in `lib/server/benchmark-overview.ts` with targeted tests
- the existing authenticated benchmark overview Playwright case remains the browser proof for this route

Acceptance:
- benchmark overview route behavior stays the same
- extracted helpers have targeted tests
- existing benchmark overview browser coverage still passes after the refactor

### AH-011 — Fourth large-module decomposition slice

Goal:
- reduce duplication in the deep-audit report generators without changing report output or widening the browser test surface

Scope:
- extract shared report-preparation helpers out of `workers/report/build-deep-audit-pdf.ts`
- reuse those helpers from the markdown exporter where the seam is truly shared
- add targeted helper tests
- do not add Playwright coverage unless a user-visible route changes

Current repo truth:
- the fourth large-module decomposition slice is now in repo
- shared deep-audit report preparation helpers now live in `workers/report/deep-audit-report-helpers.ts`
- the PDF builder now imports shared parsing and narrative helpers instead of owning all preparation logic itself
- the markdown exporter now reuses the shared narrative helper and shared issue type instead of importing those indirectly from the PDF builder
- this is a worker-only refactor; no route behavior changed, so no new UI smoke test was needed for this slice

Acceptance:
- report behavior stays the same
- extracted helpers have targeted tests
- no new UI/browser verification is required unless a later slice changes route behavior

### AH-012 — Fifth large-module decomposition slice

Goal:
- reduce complexity in the deep-audit crawl engine by separating pure pending-state logic from the crawl loop

Scope:
- extract crawl-pending parsing and chunk-window planning into a dedicated state module
- keep fetch, audit, and persistence behavior inside `deep-audit-crawl.ts`
- add targeted state-helper tests
- do not add Playwright coverage unless a later slice changes route behavior

Current repo truth:
- the fifth large-module decomposition slice is now in repo
- crawl-pending parsing, config merge, browser-render stat merge, and continuation-window planning now live in `workers/scan-engine/deep-audit-crawl-state.ts`
- `workers/scan-engine/deep-audit-crawl.ts` now imports the pure state helpers instead of owning all pending-state math inline
- this is a worker-only refactor; no route behavior changed, so no new UI smoke test was needed for this slice

Acceptance:
- crawl behavior stays the same
- extracted state helpers have targeted tests
- no new UI/browser verification is required unless a later slice changes route behavior

### AH-013 — Sixth large-module decomposition slice

Goal:
- reduce duplication in the deep-audit email-delivery path by separating pure email-composition helpers from the network send

Scope:
- extract CTA, formatting, and small encoding helpers out of `workers/report/resend-delivery.ts`
- keep the actual Resend request path inside `resend-delivery.ts`
- add targeted helper tests
- do not add Playwright coverage unless a later slice changes route behavior

Current repo truth:
- the sixth large-module decomposition slice is now in repo
- shared resend-delivery composition helpers now live in `workers/report/resend-delivery-helpers.ts`
- `workers/report/resend-delivery.ts` now imports the CTA/formatting helpers and re-exports the shared delivery-link types to preserve current callers
- this is a worker-only refactor; no route behavior changed, so no new UI smoke test was needed for this slice

Acceptance:
- delivery behavior stays the same
- extracted helpers have targeted tests
- no new UI/browser verification is required unless a later slice changes route behavior

## Playwright readiness rules

Before Playwright lands, new UI work should follow these rules:
- add stable labels or `data-testid` hooks only where needed for durable flows
- avoid tying behavior to presentational text when state identifiers are clearer
- keep async UI states explicit and observable
- prefer one obvious success state and one obvious failure state
- avoid hidden multi-step transitions that only make sense to a human tester

## What should not happen

Do not:
- build a giant internal platform framework before the next real need appears
- replace small helpers with deep abstraction trees
- add observability that depends on shell access for routine use
- widen security-sensitive code paths without tests
- introduce Playwright-specific hacks into production UI

## Near-term priority order

1. AH-001 backlog + standards
2. AH-002 structured log persistence
3. AH-003 admin logs page
4. AH-004 Playwright readiness
5. AH-005 thin-route cleanup
6. AH-006 large-module decomposition
7. AH-007 admin auth maturity plan
8. AH-008 Playwright OSS foundation
9. AH-009 second large-module decomposition slice
10. AH-010 third large-module decomposition slice
11. AH-011 fourth large-module decomposition slice
12. AH-012 fifth large-module decomposition slice
13. AH-013 sixth large-module decomposition slice
