# Checkout + Workspace Provisioning v1

Last updated: 2026-04-10

## Purpose

Keep the post-signup flow lean: one stable checkout wait state before Stripe appears, then a connectors experience that reflects the real subscription-derived provisioning state instead of showing a false no-workspace dead end.

This playbook is the product truth companion for the checkout/workspace-provisioning stream.
Execution tasks are tracked in `docs/21-checkout-workspace-provisioning-implementation-plan.md` and `agents/memory/PROJECT_STATE.md`.
The current follow-on slice centralizes startup access through a shared resolver so dashboard, connectors, new-scan, and checkout all read the same subscription/workspace/membership state.

## Non-Negotiable Rules

1. One stable checkout wait state.
- The pricing page should not cycle the user through multiple visible “verifying / preparing / redirecting” screens.
- The user should stay on one loading state until the Stripe screen is ready.

2. Subscription-derived provisioning remains the source of truth.
- Startup workspaces and agency accounts still come from the existing subscription provisioning path.
- The connectors page should reflect provisioning progress and offer a dashboard return path instead of implying the package is missing a workspace when one is still being linked.

3. Shared startup-access resolution stays centralized.
- Subscription, workspace, and membership state should resolve through one helper before dashboard, connectors, new-scan, or checkout make their own decision.
- Startup access should remain auditable as a single contract rather than being re-derived separately in each page.

4. Checkout now consumes the same startup-access resolver.
- The checkout bypass decision should use the same startup-access state as dashboard, connectors, and new-scan.
- Startup scans should not need a second independent startup validator just to decide whether payment is required.

5. Keep slices small.
- Each byte task must touch one narrow concern.
- Do not combine checkout loading changes with unrelated auth, billing, or dashboard refactors.

## Byte Task Order

1. BT-001: Collapse the pricing-page autosubscribe flow into one stable checkout wait state before Stripe is ready.
2. BT-002: Show connectors as provisioning-pending when a live startup/agency subscription exists but no workspace/account is linked yet.
3. BT-003: Update repo docs and current-state notes to record the checkout and workspace-provisioning contract.
4. BT-004: Add a shared startup-access resolver so subscription, workspace, and membership state resolve from one helper.
5. BT-005: Wire startup dashboard and connectors to the shared startup-access resolver.
6. BT-006: Wire new-scan to the shared startup-access resolver and update docs/state.
7. BT-007: Wire checkout to the shared startup-access resolver so startup scans bypass Stripe from the same source of truth.

## Completion Criteria

- Every byte task has explicit acceptance criteria in the task registry.
- Every completed byte task updates `agents/memory/PROJECT_STATE.md` and the current-state doc.
- The connectors page should only show `No startup workspace` when there is truly no qualifying workspace/subscription state.
