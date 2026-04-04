# Startup Dashboard + Entitlements Implementation Plan

Last updated: 2026-04-04

## Current Status

- `SD-001` complete in repo:
  - `supabase/migrations/021_service_entitlements_foundation.sql`
  - `lib/server/service-entitlements-contract.ts`
  - `lib/server/service-entitlements-contract.test.ts`
- `SD-002` complete in repo:
  - `lib/server/service-entitlements.ts`
  - `lib/server/service-entitlements.test.ts`
  - `lib/server/agency-access.ts` (centralized resolver + legacy fallback)
  - `lib/server/agency-access.test.ts` (centralized + fallback coverage)
- `SD-003` complete in repo:
  - `app/dashboard/services/page.tsx`
  - `app/dashboard/services/actions.ts`
  - `components/service-control-admin-view.tsx`
  - `lib/server/service-control-admin-data.ts`
  - `components/dashboard-sidebar.tsx` (admin nav link)
- `SD-004` complete in repo:
  - `supabase/migrations/022_startup_workspace_foundation.sql`
  - `app/dashboard/startups/page.tsx`
  - `app/dashboard/startups/actions.ts`
  - `components/startup-admin-control-view.tsx`
  - `lib/server/startup-admin-data.ts`
  - `lib/server/startup-dashboard-data.ts`
  - `lib/server/startup-dashboard-data.test.ts`
  - `app/dashboard/page.tsx` (startup workspace selector/context)
- `SD-005` complete in repo:
  - `app/dashboard/startup/page.tsx`
  - `lib/server/startup-dashboard-shell.ts`
  - `lib/server/startup-dashboard-shell.test.ts`
  - `components/dashboard-sidebar.tsx` (startup nav)
  - `app/dashboard/page.tsx` (startup dashboard entry link)
- `SD-006` complete in repo:
  - `lib/server/startup-tracking-metrics.ts`
  - `lib/server/startup-tracking-metrics.test.ts`
  - `lib/server/startup-dashboard-data.ts` (report timestamps for burn-down events)
  - `app/dashboard/startup/page.tsx` (burn-down, funnel, 7/14/30 windows)
- `SD-007` complete in repo:
  - `supabase/migrations/023_startup_recommendation_lifecycle.sql`
  - `lib/server/startup-recommendation-lifecycle.ts`
  - `lib/server/startup-recommendation-lifecycle.test.ts`
  - `lib/server/startup-dashboard-data.ts` (recommendation read model)
  - `lib/server/startup-tracking-metrics.ts` (funnel from lifecycle statuses)
  - `app/dashboard/startup/page.tsx` (lifecycle-aware funnel panels)
- `SD-008` complete in repo:
  - `supabase/migrations/024_startup_implementation_plan.sql`
  - `lib/server/startup-implementation-plan.ts`
  - `lib/server/startup-implementation-plan.test.ts`
  - `app/dashboard/startup/page.tsx` (implementation lane plan cards)
- `SD-009` complete in repo:
  - `supabase/migrations/025_startup_github_integration_foundation.sql`
  - `lib/server/startup-github-integration.ts`
  - `lib/server/startup-github-integration.test.ts`
  - `app/dashboard/startup/actions.ts`
  - `app/api/startup/github/callback/route.ts`
  - `app/dashboard/startup/page.tsx` (entitlement-gated connect + allowlist controls)
- `SD-010` complete in repo:
  - `supabase/migrations/026_startup_agent_pr_workflow.sql`
  - `lib/server/startup-agent-pr-workflow.ts`
  - `lib/server/startup-agent-pr-workflow.test.ts`
  - `app/dashboard/startup/actions.ts` (queue + status-sync actions)
  - `app/dashboard/startup/page.tsx` (PR run controls + status list)
- `SD-011` complete in repo:
  - `supabase/migrations/027_startup_model_policy_scope.sql`
  - `lib/server/startup-model-policy.ts`
  - `lib/server/startup-model-policy.test.ts`
  - `lib/server/startup-implementation-plan.ts` (policy metadata stamping)
  - `app/dashboard/startup/actions.ts` + `lib/server/startup-agent-pr-workflow.ts` (PR execution policy metadata)
- `SD-012` complete in repo:
  - `supabase/migrations/028_service_billing_mappings.sql`
  - `lib/server/service-billing-guard.ts`
  - `lib/server/service-billing-guard.test.ts`
  - `app/dashboard/startup/actions.ts` (billing guard on GitHub connect + PR queue actions)
  - `app/dashboard/startup/page.tsx` (billing-blocked status messaging)
- `SD-013` complete in repo:
  - `lib/server/startup-service-gates.ts`
  - `lib/server/startup-service-gates.test.ts`
  - `lib/server/startup-github-integration.ts` (shared startup bundle resolver export)
  - `lib/server/agency-access.ts` + `lib/server/agency-access.test.ts` (centralized agency UI gate mapping)
  - `app/dashboard/startup/actions.ts` + `app/dashboard/startup/page.tsx` (startup UI/actions switched to centralized gate resolver)
  - `app/dashboard/page.tsx` (agency UI switched to centralized gate mapping)
- `SD-014` complete in repo:
  - `lib/server/startup-admin-data.ts` + `lib/server/startup-admin-data.test.ts` (startup workspace timeline read model from structured logs)
  - `components/startup-admin-control-view.tsx` (admin startup timeline panel)
  - `lib/server/startup-model-policy.ts` (model-policy resolution structured events)
  - `lib/server/startup-recommendation-lifecycle.ts` (recommendation transition structured events)
  - `lib/server/startup-agent-pr-workflow.ts` (PR workflow queue/status structured events)
  - `lib/server/startup-github-integration.ts` (GitHub integration/session/allowlist structured events)
  - `lib/server/startup-implementation-plan.ts` (plan-generation structured events with model-policy metadata)
  - `app/dashboard/startup/actions.ts` (service gate blocked-event logs)
- `SD-015` complete in repo:
  - `lib/server/startup-rollout-flags.ts` + `lib/server/startup-rollout-flags.test.ts` (centralized rollout-flag resolver)
  - `app/dashboard/startups/actions.ts` + `components/startup-admin-control-view.tsx` (admin rollout-flag toggles per startup workspace)
  - `app/dashboard/startup/actions.ts` + `app/dashboard/startup/page.tsx` (startup rollout enforcement + suggest-only auto-PR default)
  - `lib/server/startup-admin-data.ts` (rollout-flag read model and timeline summary support)
  - `lib/server/cf-env.ts` (optional env-level rollout overrides)
- Next step: pilot rollout execution using SD-015 controls (`startup_dashboard`, `github_agent`, `auto_pr`) for one startup workspace.

## Objective

Build a centralized, feature-flagged, maintainable platform that supports:
- startup-friendly dark dashboard with actionable tracking and graphs
- agency and startup experiences on one backend model
- service bundling (on/off) by user type and plan
- model routing by tier/service/bundle
- GitHub-agent implementation flow (recommendation -> PR -> merge -> impact)

## Non-negotiables

- One centralized entitlement resolver for UI, API, and jobs.
- No hard-coded plan logic in components/routes.
- Free now, paid later must be a config switch, not a refactor.
- Startup dashboard is action-first (no vanity widgets).
- Every graph must map to a concrete action list.

## Delivery Phases

1. Control Plane Foundation
2. Startup Dashboard MVP
3. GitHub Agent Execution MVP
4. Bundle Billing + Model Routing
5. Hardening + Rollout

## Bite-Sized Tasks

### SD-001 - Service Catalog + Entitlement Schema
- Scope:
  - Add canonical service catalog and bundle schema.
  - Add workspace entitlement override schema.
  - Add model policy scope schema (service/bundle/workspace).
- Output:
  - Supabase migration and type definitions.
  - Initial seeded services and bundles (skills free by default).
- Dependencies: none
- Estimate: 1 day
- Done when:
  - Migration applies cleanly.
  - Existing agency flags can be represented in the new model.
  - Service keys are typed and stable.

### SD-002 - Unified Entitlement Resolver
- Scope:
  - Build one resolver to evaluate effective access:
    - global flag -> bundle -> workspace override -> client override.
  - Add unit tests for precedence and fallback behavior.
- Output:
  - `lib/server` resolver module + tests.
- Dependencies: SD-001
- Estimate: 1 day
- Done when:
  - Resolver drives both startup and agency checks.
  - Existing agency entitlement checks can be migrated with parity.

### SD-003 - Admin Service Control Center (v1)
- Scope:
  - Create admin page for:
    - service on/off per bundle
    - workspace overrides
    - free/paid/trial mode per service
    - Stripe mapping placeholders
  - Add change audit logging.
- Output:
  - New admin surface under dashboard admin.
- Dependencies: SD-001, SD-002
- Estimate: 1.5 days
- Done when:
  - Admin can toggle one service and see effect in runtime gating.
  - Audit trail records before/after state.

### SD-004 - Startup Workspace Model
- Scope:
  - Add startup workspace type using current tenancy model.
  - Support founder + team member roles.
- Output:
  - Workspace records and membership mapping for startup path.
- Dependencies: SD-001
- Estimate: 1 day
- Done when:
  - Startup workspace can be created and selected in dashboard context.

### SD-005 - Startup Dashboard Shell (Dark Theme)
- Scope:
  - Implement dark-only startup route shell.
  - Add module slots for trend, backlog, implementation, PR activity.
- Output:
  - New startup dashboard route and base UI components.
- Dependencies: SD-004
- Estimate: 1 day
- Done when:
  - Founder can load startup dashboard with no agency noise.

### SD-006 - Actionable Tracking Metrics + Graphs
- Scope:
  - Add metrics model and graphs:
    - score trend over time
    - issue burn-down
    - recommendation status funnel
    - merged-PR to impact delta windows (7/14/30 days)
  - Each chart links to actionable items.
- Output:
  - Data query layer + chart components.
- Dependencies: SD-005
- Estimate: 2 days
- Done when:
  - Every chart has a linked list of concrete tasks.

### SD-007 - Recommendation Lifecycle Model
- Scope:
  - Add normalized recommendation tracking:
    - suggested, approved, in_progress, shipped, validated, failed.
  - Store markdown audit mapping to recommendation records.
- Output:
  - Tables and server helpers for recommendation lifecycle.
- Dependencies: SD-001
- Estimate: 1.5 days
- Done when:
  - One audit can generate trackable recommendation records.

### SD-008 - Markdown-to-Plan Generator (Team Implementation Plan)
- Scope:
  - Convert markdown audit output into implementation tasks by team lane:
    - founder, dev, content, ops.
  - Add confidence and evidence fields.
- Output:
  - Job path to generate and persist implementation plan rows.
- Dependencies: SD-007
- Estimate: 1.5 days
- Done when:
  - Startup team can open one generated plan from latest audit.

### SD-009 - GitHub App Integration Foundation
- Scope:
  - Add GitHub App install/connect flow.
  - Store installation, repo allowlist, and minimal permissions config.
- Output:
  - GitHub integration schema + auth callbacks + admin/startup connect UI.
- Dependencies: SD-004
- Estimate: 2 days
- Done when:
  - Workspace can connect one repo via GitHub App.

### SD-010 - Agent PR Workflow (Suggest + PR)
- Scope:
  - Implement execution path:
    - approved recommendation -> branch -> commit -> PR.
  - Sync PR status back to recommendation state.
- Output:
  - Async job pipeline and lifecycle updates.
- Dependencies: SD-008, SD-009
- Estimate: 2 days
- Done when:
  - One recommendation can produce one PR and status sync.

### SD-011 - Multi-Model Policy Routing
- Scope:
  - Route by policy scope:
    - service default, bundle override, workspace override.
  - Add per-service budget guardrail and fallback model.
- Output:
  - Model resolver + validation + tests.
- Dependencies: SD-001, SD-002
- Estimate: 1.5 days
- Done when:
  - Model selection is deterministic and auditable per run.

### SD-012 - Stripe Bundle Mapping
- Scope:
  - Map bundles/services to Stripe product/price IDs.
  - Preserve free mode toggles for skills and startup onboarding.
- Output:
  - Billing mapping table + runtime billing guard checks.
- Dependencies: SD-003
- Estimate: 1 day
- Done when:
  - Service access can be switched from free to paid by config only.

### SD-013 - Feature-Flagged UI Gating Cleanup
- Scope:
  - Replace scattered checks with centralized entitlement hooks.
  - Ensure startup and agency surfaces use same gate contract.
- Output:
  - UI gating refactor + regression tests for key routes.
- Dependencies: SD-002, SD-005
- Estimate: 1.5 days
- Done when:
  - UI modules consistently hide/disable based on centralized entitlements.

### SD-014 - Observability + Auditability
- Scope:
  - Add structured logs and admin audit views for:
    - entitlement changes
    - model policy resolution
    - GitHub execution steps
    - recommendation status transitions
- Output:
  - Event schema and admin timeline view.
- Dependencies: SD-003, SD-010, SD-011
- Estimate: 1 day
- Done when:
  - Admin can reconstruct who changed what and what executed.

### SD-015 - Beta Rollout Guardrails
- Scope:
  - Add rollout flags:
    - startup dashboard enabled
    - github agent enabled
    - auto-pr enabled
  - Add fail-safe “suggest-only” mode default.
- Output:
  - Flag checks and rollout runbook notes.
- Dependencies: SD-010
- Estimate: 0.5 day
- Done when:
  - Feature can launch safely to one startup workspace first.

## Immediate Start Task (Start Here)

### Task to start now: Pilot rollout execution

1. Choose one startup workspace as pilot and enable `startup_dashboard` only first.
2. Validate startup timeline events + workflow visibility during dashboard-only phase.
3. Enable `github_agent` for pilot workspace and verify connect/allowlist path.
4. Keep `auto_pr` off initially (suggest-only), then enable after operator sign-off.
5. Record rollout outcomes and block reasons in startup timeline before enabling broader cohorts.

## Initial Service Catalog (v1 seed)

- `free_scan`
- `deep_audit`
- `geo_tracker`
- `startup_dashboard`
- `agency_dashboard`
- `markdown_audit_export`
- `markdown_plan_generator`
- `skills_library`
- `github_integration`
- `agent_pr_execution`
- `api_access`

## Initial Bundle Targets (v1 seed)

- `startup_lite`
  - on: startup dashboard, scans, markdown export, skills
  - off: github integration, agent PR execution
- `startup_dev`
  - on: startup_lite + github integration + markdown plan generator
  - optional: agent PR execution (suggest-only default)
- `agency_core`
  - on: agency dashboard, multi-client tracking, deep audit
- `agency_pro`
  - on: agency_core + geo tracker + advanced automation

## Production Best-Practice Notes

- Use GitHub App (not OAuth App) for repo automation.
- Keep PR automation in suggest/approve flow by default.
- Never bypass centralized entitlement checks in route handlers.
- Keep env flags for operational kill switches only.
- Keep pricing logic as data configuration, not code branches.
