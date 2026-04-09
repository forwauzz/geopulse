# Checkout + Workspace Provisioning v1

Last updated: 2026-04-09

## Purpose

Keep the post-signup flow lean: one stable checkout wait state before Stripe appears, then a connectors experience that reflects the real subscription-derived provisioning state instead of showing a false no-workspace dead end.

This playbook is the product truth companion for the checkout/workspace-provisioning stream.
Execution tasks are tracked in `docs/21-checkout-workspace-provisioning-implementation-plan.md` and `agents/memory/PROJECT_STATE.md`.

## Non-Negotiable Rules

1. One stable checkout wait state.
- The pricing page should not cycle the user through multiple visible “verifying / preparing / redirecting” screens.
- The user should stay on one loading state until the Stripe screen is ready.

2. Subscription-derived provisioning remains the source of truth.
- Startup workspaces and agency accounts still come from the existing subscription provisioning path.
- The connectors page should reflect provisioning progress and offer a dashboard return path instead of implying the package is missing a workspace when one is still being linked.

3. Keep slices small.
- Each byte task must touch one narrow concern.
- Do not combine checkout loading changes with unrelated auth, billing, or dashboard refactors.

## Byte Task Order

1. BT-001: Collapse the pricing-page autosubscribe flow into one stable checkout wait state before Stripe is ready.
2. BT-002: Show connectors as provisioning-pending when a live startup/agency subscription exists but no workspace/account is linked yet.
3. BT-003: Update repo docs and current-state notes to record the checkout and workspace-provisioning contract.

## Completion Criteria

- Every byte task has explicit acceptance criteria in the task registry.
- Every completed byte task updates `agents/memory/PROJECT_STATE.md` and the current-state doc.
- The connectors page should only show `No startup workspace` when there is truly no qualifying workspace/subscription state.
