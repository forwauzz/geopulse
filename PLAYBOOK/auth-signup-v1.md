# Auth + Signup v1

Last updated: 2026-04-09

## Purpose

Keep the public auth entry simple: one sign-up path for pricing-tier clicks, one secondary sign-in link beneath it, then preserve the selected bundle through the rest of onboarding.

This playbook is the product truth companion for the byte-sized auth/signup stream.
Execution tasks are tracked in `docs/20-auth-signup-implementation-plan.md` and `agents/memory/PROJECT_STATE.md`.

## Non-Negotiable Rules

1. One primary signup path.
- Tier clicks should land on a single sign-up experience.
- The sign-up experience should not present side-by-side competing actions.

2. One secondary sign-in escape hatch.
- The sign-up page should include a clear `Or sign in` link beneath the primary action.
- The sign-in path should remain available without hiding the signup path.

3. Preserve bundle context.
- If the user came from a pricing tier, keep the selected bundle through the auth flow.
- The auth page should not drop the tier context during navigation.

4. Keep slices small.
- Each byte task must touch one narrow concern.
- No auth-model rewrite should be combined with UI cleanup unless the slice is purely documentation.

## Byte Task Order

1. BT-001: Simplify the public auth entry into a single sign-up path with a secondary sign-in link beneath it.
2. BT-002: Replace magic-link signup with password signup plus password confirmation.
3. BT-003: Preserve the selected bundle through signup so checkout resumes on the correct tier.
4. BT-004: Align auth callback and onboarding redirects with the password-based signup flow.
5. BT-005: Add focused tests for signup UI, bundle preservation, and redirect behavior.
6. BT-006: Update repo docs and current-state notes after each completed slice.

## Completion Criteria

- Every byte task has explicit acceptance criteria in the task registry.
- Every completed byte task updates `agents/memory/PROJECT_STATE.md` and the current-state doc.
- Public auth changes must keep the signup path easy to find from the pricing page.
