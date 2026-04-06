-- ============================================================
-- 033_subscription_billing_foundation.sql
--
-- Adds self-serve subscription billing support:
--   1. Extend service_bundles with billing_mode, stripe_price_id,
--      monthly_price_cents, and trial_period_days
--   2. New user_subscriptions table for Stripe subscription tracking
--      and workspace association
-- ============================================================

-- ============================================================
-- PART 1: Extend service_bundles
-- ============================================================

ALTER TABLE public.service_bundles
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'free'
    CHECK (billing_mode IN ('free', 'monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS monthly_price_cents INTEGER,
  -- trial_period_days: 0 = no trial. Admin can update per-bundle without code changes.
  ADD COLUMN IF NOT EXISTS trial_period_days INTEGER NOT NULL DEFAULT 0;

-- Seed billing_mode per bundle
UPDATE public.service_bundles
  SET billing_mode = 'free'
  WHERE bundle_key = 'startup_lite';

UPDATE public.service_bundles
  SET billing_mode = 'monthly'
  WHERE bundle_key IN ('startup_dev', 'agency_core', 'agency_pro');

-- Seed default 7-day trial for paid tiers
-- Operator can change this at any time via direct UPDATE or admin UI
UPDATE public.service_bundles
  SET trial_period_days = 7
  WHERE bundle_key IN ('startup_dev', 'agency_core', 'agency_pro');

-- ============================================================
-- PART 2: user_subscriptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bundle_key              TEXT        NOT NULL,
  stripe_customer_id      TEXT        NOT NULL,
  stripe_subscription_id  TEXT        NOT NULL UNIQUE,
  stripe_price_id         TEXT        NOT NULL,

  -- Maps to Stripe subscription statuses + our own 'cancelled' alias for 'canceled'
  status                  TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'incomplete')),

  -- Billing period window (updated on each invoice.payment_succeeded)
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,

  -- Exactly one of these will be non-null (set after workspace auto-provision)
  startup_workspace_id    UUID        REFERENCES public.startup_workspaces(id) ON DELETE SET NULL,
  agency_account_id       UUID        REFERENCES public.agency_accounts(id) ON DELETE SET NULL,

  cancelled_at            TIMESTAMPTZ,
  metadata                JSONB       NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx
  ON public.user_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS user_subscriptions_stripe_sub_id_idx
  ON public.user_subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx
  ON public.user_subscriptions(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_user_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_user_subscriptions_updated_at();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions (dashboard, pricing page state checks)
CREATE POLICY "user_subscriptions_self_read"
  ON public.user_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (used by webhook handlers) can do everything — bypasses RLS by default
-- No additional policy needed for service role
