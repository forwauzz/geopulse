-- GEO-Pulse API-as-a-Service Schema
-- Migration: 002_api_keys
-- Adds: api_keys, api_usage, api_webhooks tables
-- All tables have RLS enabled before the first row.

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE api_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE webhook_event AS ENUM ('scan.complete', 'scan.failed');

-- ============================================================
-- API KEYS TABLE
-- Stores hashed API keys — never plaintext
-- ============================================================
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- key_prefix: first ~14 chars including tier, e.g. "gp_pro_a3f8c2"
  -- Used for display so user can identify which key it is
  -- This is NOT sensitive — it's just for identification
  key_prefix TEXT NOT NULL,

  -- key_hash: sha256(full_api_key) — used for validation
  -- Store ONLY the hash, never the plaintext key
  key_hash TEXT NOT NULL UNIQUE,

  tier api_tier NOT NULL DEFAULT 'free',
  name TEXT NOT NULL DEFAULT 'Default Key', -- user-assigned label
  active BOOLEAN NOT NULL DEFAULT true,

  -- Usage tracking
  scans_used INTEGER NOT NULL DEFAULT 0,
  scans_limit INTEGER NOT NULL DEFAULT 100, -- 100 free, 2000 pro, custom enterprise
  scans_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),

  -- Stripe integration for paid API tiers
  stripe_subscription_id TEXT,

  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- API USAGE LOG
-- Append-only audit trail of every API call
-- ============================================================
CREATE TABLE public.api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,  -- e.g. '/api/v1/scans'
  method TEXT NOT NULL,    -- GET, POST, DELETE
  status_code INTEGER NOT NULL,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- API WEBHOOKS
-- Registered webhook endpoints per API key
-- ============================================================
CREATE TABLE public.api_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events webhook_event[] NOT NULL DEFAULT '{scan.complete}',

  -- webhook_secret_hash: sha256 of the user's signing secret
  -- We hash it for storage but the user uses the plaintext to verify our signatures
  -- Note: this is their secret for verification, not our secret for delivery
  webhook_secret_hash TEXT NOT NULL,

  active BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at TIMESTAMP WITH TIME ZONE,
  last_delivery_status INTEGER, -- HTTP status of last delivery
  failure_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- WEBHOOK DELIVERY LOG
-- ============================================================
CREATE TABLE public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES public.api_webhooks(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  event webhook_event NOT NULL,
  payload_json JSONB NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  delivered_at TIMESTAMP WITH TIME ZONE,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX ON public.api_keys(user_id);
CREATE INDEX ON public.api_keys(key_hash); -- critical for validation performance
CREATE INDEX ON public.api_keys(key_prefix);
CREATE INDEX ON public.api_usage(api_key_id);
CREATE INDEX ON public.api_usage(created_at DESC);
CREATE INDEX ON public.api_webhooks(api_key_id);
CREATE INDEX ON public.api_webhooks(user_id);
CREATE INDEX ON public.webhook_deliveries(webhook_id);
CREATE INDEX ON public.webhook_deliveries(scan_id);

-- ============================================================
-- ROW LEVEL SECURITY — enable on ALL tables before first row
-- ============================================================
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- api_keys: users can only see and manage their own keys
CREATE POLICY "api_keys_own" ON public.api_keys
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- api_usage: users can read their own usage
CREATE POLICY "api_usage_own_read" ON public.api_usage
  FOR SELECT
  USING (api_key_id IN (
    SELECT id FROM public.api_keys WHERE user_id = auth.uid()
  ));
-- Writes go through service_role only (Workers log usage server-side)

-- api_webhooks: users can manage their own webhooks
CREATE POLICY "api_webhooks_own" ON public.api_webhooks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- webhook_deliveries: users can read delivery logs for their webhooks
CREATE POLICY "webhook_deliveries_own_read" ON public.webhook_deliveries
  FOR SELECT
  USING (webhook_id IN (
    SELECT id FROM public.api_webhooks WHERE user_id = auth.uid()
  ));

-- ============================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MONTHLY QUOTA RESET FOR API KEYS
-- Call via Cloudflare Cron Trigger (same cron as scan count reset)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_api_key_quotas()
RETURNS void AS $$
BEGIN
  UPDATE public.api_keys
  SET
    scans_used = 0,
    scans_reset_at = date_trunc('month', now()) + interval '1 month'
  WHERE scans_reset_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SCANS_LIMIT BY TIER — helper function
-- Used when issuing a new API key to set the correct limit
-- ============================================================
CREATE OR REPLACE FUNCTION get_scans_limit_for_tier(tier api_tier)
RETURNS INTEGER AS $$
BEGIN
  CASE tier
    WHEN 'free' THEN RETURN 100;
    WHEN 'pro' THEN RETURN 2000;
    WHEN 'enterprise' THEN RETURN 999999; -- effectively unlimited
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
