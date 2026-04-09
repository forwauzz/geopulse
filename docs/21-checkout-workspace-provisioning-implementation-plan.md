# Checkout + Workspace Provisioning Byte Task Plan

Last updated: 2026-04-09

## Goal

Keep the post-signup path simple: show one stable checkout wait state, then keep startup/agency workspace provisioning aligned with the existing subscription-derived source of truth so connectors do not show a false no-workspace dead end.

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

## Operating Rules

- Keep each byte task isolated to one user-visible contract.
- Reuse the existing Stripe webhook provisioning path as the source of truth.
- Do not introduce a second workspace system or a second onboarding path.
- Update the living docs after each completed byte task.
