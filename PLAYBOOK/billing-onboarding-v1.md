# Billing + Onboarding v1

Last updated: 2026-04-08

## Purpose

Freeze the smallest safe implementation path for self-serve subscription onboarding, bundle entitlement truth, and audit-access routing.

This playbook is the product truth companion for the byte-sized billing/onboarding stream.
Execution tasks are tracked in `docs/19-billing-onboarding-implementation-plan.md` and `agents/memory/PROJECT_STATE.md`.

## Non-Negotiable Rules

1. One subscription truth.
- `user_subscriptions` remains the canonical Stripe-backed subscription record.
- `users.plan` stays coarse and must not be used as bundle-level billing truth.

2. One audit-access truth.
- Paid bundle access, startup workspace access, and one-time full-audit checkout must be represented explicitly.
- The UI must never infer a Stripe paywall when backend checkout mode says a bypass applies.

3. One admin readiness path.
- Bundle billing mode, Stripe price, included services, and entitlement overrides must be checkable in one operator flow.
- Admin configuration should be readable before it is writable.

4. Keep slices small.
- Each byte task must touch one narrow concern.
- No mixed schema/UI/runtime changes in the same slice unless the slice is purely documentation.

## Product Truth Matrix

1. `startup_lite`
- Free bundle.
- No Stripe subscription.
- No full-audit entitlement.
- May access the free scan and the startup workspace path when enabled by startup membership.

2. `startup_dev`
- Paid subscription bundle.
- Uses Stripe recurring monthly checkout.
- Provisions a startup workspace on webhook success.
- Does not imply full-audit payment bypass by itself.
- Full-audit access must still resolve through the explicit startup workspace bypass path.

3. `agency_core`
- Paid subscription bundle.
- Uses Stripe recurring monthly checkout.
- Provisions agency access on webhook success.
- Includes deep-audit entitlement in the bundle truth.
- Full-audit checkout should bypass Stripe when agency entitlement and payment guardrails say the audit is covered.

4. `agency_pro`
- Paid subscription bundle.
- Uses Stripe recurring monthly checkout.
- Provisions agency access on webhook success.
- Includes deep-audit entitlement in the bundle truth.
- Full-audit checkout should bypass Stripe when agency entitlement and payment guardrails say the audit is covered.

5. Full-audit checkout
- Stripe is still required for users who do not have a paid bundle that covers the audit.
- The UI must follow the backend checkout mode.
- `startup_bypass` and `agency_bypass` are product truths, not UI guesses.

## Admin Control Knobs

- `service_bundles.billing_mode`
- `service_bundles.stripe_price_id`
- `service_bundles.trial_period_days`
- `service_bundle_services`
- `service_entitlement_overrides`
- `service_model_policies`
- `agency` and `startup_workspace` membership context

## Byte Task Order

1. BT-001: Freeze the stream in project state, playbook, and task registry.
2. BT-002: Lock the canonical product truth for bundle access and full-audit payment behavior.
3. BT-003: Normalize the runtime contract for checkout modes and subscription state.
4. BT-004: Align results UI with backend checkout modes so bypass paths never fall through to Stripe.
5. BT-005: Add an admin bundle readiness check for billing, entitlements, and mappings.
6. BT-006: Add end-to-end onboarding coverage from signup through dashboard and audit access.

## Completion Criteria

- Every byte task has explicit acceptance criteria in the task registry.
- Every completed byte task updates `agents/memory/PROJECT_STATE.md` and the current-state doc.
- Runtime slices require focused tests before the task can be marked done.
- Documentation slices require only the relevant state and plan updates.
