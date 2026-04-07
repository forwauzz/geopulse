-- Migration 035: Prevent duplicate active/trialing subscriptions per user+bundle
--
-- PREREQUISITE: Run ADM-012 operational SQL first to clean up any existing
-- duplicate active/trialing rows before applying this index.
-- The index creation will fail if duplicate active rows exist.
--
-- This partial unique index enforces the business rule:
--   A user may have at most ONE active or trialing subscription per bundle at a time.
--   Cancelled/past_due/incomplete rows are excluded — historical rows are retained.
--
-- Covers the race condition window where the subscribe route's DB duplicate check
-- passes before the webhook has written the user_subscriptions row from a prior checkout.

CREATE UNIQUE INDEX user_subscriptions_one_active_per_bundle
  ON public.user_subscriptions (user_id, bundle_key)
  WHERE status IN ('active', 'trialing');

-- Index comment for documentation
COMMENT ON INDEX public.user_subscriptions_one_active_per_bundle IS
  'Prevents duplicate active/trialing subscriptions for the same user+bundle. '
  'Cancelled and past_due rows are intentionally excluded so subscription history is retained.';
