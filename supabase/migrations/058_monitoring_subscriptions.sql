-- Migration 058: monitoring subscriptions (the $39/mo "GEO-Pulse Monitoring" product).
--
-- A cold visitor runs the free audit, then subscribes to have that site re-audited every month
-- with the full report + local competitor ranking delivered by email. This is deliberately
-- DECOUPLED from user_subscriptions / workspace provisioning (which drive the richer startup &
-- agency tiers): the monitor product is consumer-simple and email-keyed, mirroring the guest
-- deep-audit path. No auth user is required — access to the live stats is via an unguessable
-- private token (served through the existing /share/<slug> capability on each monthly scan).
--
-- Service-role only. Degrades to a dormant feature until this migration is applied AND the
-- `show_monitor_subscription` UI flag is turned on (fail-closed).

-- Allow the 'monitor' run source on scans (recurring re-audits driven by a subscription).
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_run_source_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_run_source_check CHECK (
    run_source IN (
      'public_self_serve',
      'agency_dashboard',
      'startup_dashboard',
      'internal_benchmark',
      'admin_manual',
      'recurring',
      'monitor'
    )
  );

CREATE TABLE IF NOT EXISTS public.monitoring_subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT        NOT NULL,
  monitored_url           TEXT        NOT NULL,
  domain                  TEXT,
  plan                    TEXT        NOT NULL DEFAULT 'monthly' CHECK (plan IN ('monthly', 'annual')),
  status                  TEXT        NOT NULL DEFAULT 'incomplete'
                            CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  -- Unguessable capability token for the signed-out live-stats link.
  private_token           TEXT        NOT NULL UNIQUE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT        UNIQUE,
  stripe_price_id         TEXT,
  -- The free scan that seeded the subscription (for the "before" baseline).
  origin_scan_id          UUID        REFERENCES public.scans(id) ON DELETE SET NULL,
  current_period_end      TIMESTAMPTZ,
  last_audit_at           TIMESTAMPTZ,
  -- Due time for the next monthly re-audit (set when the subscription goes active).
  next_audit_at           TIMESTAMPTZ,
  last_error              TEXT,
  canceled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.monitoring_subscriptions IS
  'Email-keyed $39/mo monitoring subscriptions. One Stripe subscription per row. Service-role '
  'only; access to live stats is via private_token, not a login. Monthly re-audit driven by '
  'next_audit_at; report emailed with a /share/<slug> link.';

-- Due-work index for the monthly re-audit sweep.
CREATE INDEX IF NOT EXISTS monitoring_subscriptions_due_idx
  ON public.monitoring_subscriptions (next_audit_at)
  WHERE status = 'active';

-- One live subscription per email+domain (cheap dedupe; NULL domains excluded).
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_subscriptions_email_domain_active_idx
  ON public.monitoring_subscriptions (lower(email), domain)
  WHERE status IN ('active', 'trialing') AND domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS monitoring_subscriptions_email_idx
  ON public.monitoring_subscriptions (lower(email));

ALTER TABLE public.monitoring_subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies: service-role bypasses RLS; anon/authenticated get zero rows (private-token access
-- is resolved server-side through the service-role client, never via the anon key).
