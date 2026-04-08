# Billing + Onboarding Byte Task Plan

Last updated: 2026-04-08

## Goal

Keep the self-serve billing/onboarding stream lean, auditable, and easy to manage while proving the end-to-end path:
signup -> subscribe -> webhook provisioning -> dashboard -> audit access.

## Scope

In scope:
- new-user onboarding into the pricing/subscription flow
- subscription provisioning and workspace setup
- bundle-level audit entitlement behavior
- admin visibility into bundle readiness
- end-to-end tests for the supported paths

Out of scope:
- anonymous checkout
- broader API billing
- redesign of unrelated dashboard systems
- mixed-purpose refactors that are not needed for onboarding truth

## Byte Tasks

| Task ID | Task | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| BT-001 | Freeze the billing/onboarding stream in project state, playbook, and task registry | Orchestrator | DONE | `agents/memory/PROJECT_STATE.md`, `PLAYBOOK/billing-onboarding-v1.md`, and this plan exist together; stream order is explicit; no runtime behavior changes are introduced |
| BT-002 | Lock the canonical product truth for bundle access and full-audit payment behavior | Product + Backend | DONE | `PLAYBOOK/billing-onboarding-v1.md` product truth matrix; `agents/memory/PROJECT_STATE.md`; `docs/01-current-state.md` |
| BT-003 | Normalize the runtime contract for checkout modes and subscription state | Backend + Frontend | DONE | `lib/shared/deep-audit-checkout-mode.ts`, `app/api/scans/[id]/route.ts`, `components/results-view.tsx`, `components/deep-audit-checkout.tsx`, `npm.cmd tsc --noEmit`, `npx.cmd vitest run lib/shared/deep-audit-checkout-mode.test.ts` |
| BT-004 | Align results UI with backend checkout modes so bypass paths never fall through to Stripe | Frontend | DONE | `components/results-view.tsx`, `components/deep-audit-checkout.tsx`, `npx.cmd tsc --noEmit` |
| BT-005 | Add an admin bundle readiness check for billing, entitlements, and mappings | Frontend + Backend | DONE | `lib/server/bundle-readiness.ts`, `lib/server/bundle-readiness.test.ts`, `app/admin/bundles/[bundleKey]/page.tsx`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/server/bundle-readiness.test.ts` |
| BT-006 | Add end-to-end onboarding coverage from signup through dashboard and audit access | QA + Backend + Frontend | DONE | `lib/server/billing-onboarding-flow.ts`, `lib/server/billing-onboarding-flow.test.ts`, `app/auth/callback/route.ts`, `app/api/billing/subscribe/route.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/server/billing-onboarding-flow.test.ts` |
| BT-007 | Harden subscription provisioning so webhook retries converge on the same workspace/account | Backend | DONE | `lib/server/billing/provision-workspace-for-subscription.ts`, `lib/server/billing/provision-workspace-for-subscription.test.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/server/billing/provision-workspace-for-subscription.test.ts` |
| BT-008 | Normalize coarse user.plan from the live subscription set instead of resetting to free on cancel | Backend | DONE | `lib/server/subscription-plan-sync.ts`, `lib/server/subscription-plan-sync.test.ts`, `app/admin/users/actions.ts`, `lib/server/stripe/subscription-handlers.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/server/subscription-plan-sync.test.ts` |
| BT-009 | Lock the Stripe webhook route dispatch contract for subscription, invoice, and checkout events | QA + Backend | DONE | `app/api/webhooks/stripe/route.test.ts`, `app/api/webhooks/stripe/route.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run app/api/webhooks/stripe/route.test.ts` |
| BT-010 | Clarify admin bundle/service-control boundaries for self-serve onboarding and audit bypass setup | Frontend + Docs | DONE | `app/admin/bundles/[bundleKey]/page.tsx`, `components/service-control-admin-view.tsx`, `docs/01-current-state.md`, `agents/memory/PROJECT_STATE.md`, `npx.cmd tsc --noEmit` |
| BT-011 | Converge admin auth to one DB-backed platform-admin allowlist and remove legacy email fallback from runtime gates | Backend + Security + Docs | DONE | `lib/server/require-admin.ts`, `lib/server/admin-runtime.ts`, `app/admin/layout.tsx`, `app/admin/login/actions.ts`, `app/dashboard/layout.tsx`, `middleware.ts`, `lib/server/distribution-oauth-admin-gate.ts`, `npx.cmd tsc --noEmit` |
| BT-012 | Add a hard-delete admin user flow that removes test accounts, related artifacts, billing state, and auth access | Backend + Frontend + QA | DONE | `lib/server/user-deletion.ts`, `lib/server/user-deletion.test.ts`, `app/admin/users/actions.ts`, `app/admin/users/[userId]/page.tsx`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run lib/server/user-deletion.test.ts` |

## Operating Rules

- Keep each implementation slice independently mergeable.
- Do not combine multiple byte tasks into one change unless the work is only documentation.
- Update `agents/memory/PROJECT_STATE.md` and the current-state doc after each completed byte task.
- Record evidence before marking a byte task done.
