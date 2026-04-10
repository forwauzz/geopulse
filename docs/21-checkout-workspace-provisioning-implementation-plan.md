# Checkout + Workspace Provisioning Byte Task Plan

Last updated: 2026-04-10

## Goal

Keep the post-signup path simple: show one stable checkout wait state, then keep startup/agency workspace provisioning aligned with the existing subscription-derived source of truth so connectors do not show a false no-workspace dead end. The current follow-on slice centralizes startup access through one resolver so dashboard, connectors, new-scan, and checkout all read the same subscription/workspace/membership state.

## Scope

In scope:
- pricing-page checkout wait state
- subscription-derived workspace provisioning visibility
- connectors-page pending-provisioning state
- docs/state alignment for the new flow

Out of scope:
- auth-model changes
- new workspace creation paths
- dashboard redesign
- billing/pricing mechanics unrelated to the wait state or connectors gating

## Byte Tasks

| Task ID | Task | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| BT-001 | Collapse the pricing-page autosubscribe flow into one stable checkout wait state before Stripe is ready | Frontend | DONE | `components/pricing-bundle-card.tsx` uses a single checkout-wait state with no stepwise visible state changes before Stripe redirect |
| BT-002 | Show connectors as provisioning-pending when a live startup/agency subscription exists but no workspace/account is linked yet | Backend + Frontend | DONE | `app/dashboard/connectors/lib/load-startup-connectors-context.ts` and `app/dashboard/connectors/page.tsx` surface a provisioning state with a dashboard return path instead of the false `No startup workspace` dead end |
| BT-003 | Update repo docs and current-state notes to record the checkout and workspace-provisioning contract | Orchestrator | DONE | `docs/01-current-state.md`, `docs/21-checkout-workspace-provisioning-implementation-plan.md`, `PLAYBOOK/checkout-workspace-provisioning-v1.md`, and `agents/memory/PROJECT_STATE.md` are aligned |
| BT-004 | Add a shared startup-access resolver so subscription, workspace, and membership state resolve from one helper | Backend | DONE | `lib/server/startup-access-resolver.ts` and `lib/server/startup-access-resolver.test.ts` normalize startup access into ready / needs-provisioning / membership-repair / no-subscription states |
| BT-005 | Wire startup dashboard and connectors to the shared startup-access resolver | Backend + Frontend | DONE | `app/dashboard/startup/lib/load-startup-dashboard-context.ts`, `app/dashboard/startup/page.tsx`, `app/dashboard/connectors/lib/load-startup-connectors-context.ts`, and `app/dashboard/connectors/page.tsx` now read the shared startup-access state |
| BT-006 | Wire new-scan to the shared startup-access resolver and update docs/state | Backend + Frontend + Orchestrator | DONE | `app/dashboard/new-scan/page.tsx`, `docs/01-current-state.md`, `docs/21-checkout-workspace-provisioning-implementation-plan.md`, `PLAYBOOK/checkout-workspace-provisioning-v1.md`, and `agents/memory/PROJECT_STATE.md` stay aligned |
| BT-007 | Wire checkout to the shared startup-access resolver so startup scans bypass Stripe from the same source of truth | Backend + Frontend | DONE | `app/api/checkout/route.ts`, `app/api/checkout/route.test.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run app/api/checkout/route.test.ts` |

## Operating Rules

- Keep each byte task isolated to one user-visible contract.
- Reuse the existing Stripe webhook provisioning path as the source of truth.
- Do not introduce a second workspace system or a second onboarding path.
- Update the living docs after each completed byte task.
