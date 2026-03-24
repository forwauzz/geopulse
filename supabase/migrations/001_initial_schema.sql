-- GEO-Pulse Initial Schema
-- Migration: 001_initial_schema
-- Run via: supabase db push
--
-- CRITICAL: RLS is enabled on ALL tables before the first row is inserted.
-- The SQL Editor bypasses RLS — always test queries via the anon key client.
-- The leads table has NO user-facing RLS policy — service_role only.

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE scan_status AS ENUM ('queued', 'processing', 'complete', 'failed');
CREATE TYPE payment_type AS ENUM ('one_time_audit', 'pro_subscription', 'agency_subscription');
CREATE TYPE plan_type AS ENUM ('free', 'pro', 'agency');

-- ============================================================
-- TABLES
-- ============================================================

-- users: Auth + billing identity
-- Mirrors auth.users — created automatically by Supabase Auth trigger
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  plan plan_type NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT UNIQUE,
  scans_this_month INTEGER NOT NULL DEFAULT 0,
  scans_reset_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- scans: Every audit run, free and paid
CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- nullable: free scans before auth
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  status scan_status NOT NULL DEFAULT 'queued',
  score INTEGER, -- 0-100, null until complete
  letter_grade TEXT, -- A+, B, C, D, F
  issues_json JSONB, -- array of {check, weight, passed, finding, fix}
  full_results_json JSONB, -- all 15 check results (paid report only)
  is_public BOOLEAN NOT NULL DEFAULT false, -- true = shareable OG link
  share_slug TEXT UNIQUE, -- short slug for share URL
  scan_duration_ms INTEGER, -- performance tracking
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- leads: Pre-auth email captures (free scan gate)
-- NO user-facing RLS policy — accessed via service_role only
-- NEVER expose via anon key
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  score INTEGER,
  source TEXT, -- 'organic', 'social_share', 'agency_embed', 'cold_outreach'
  converted BOOLEAN NOT NULL DEFAULT false, -- true when they buy or subscribe
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- reports: Paid Deep Audit reports ($29 one-time)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pdf_url TEXT, -- R2 or Supabase Storage URL
  pdf_generated_at TIMESTAMP WITH TIME ZONE,
  email_delivered_at TIMESTAMP WITH TIME ZONE,
  type TEXT NOT NULL DEFAULT 'deep_audit', -- 'deep_audit', 'monitoring' (future)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- agencies: White-label configuration ($89/mo)
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  custom_domain TEXT UNIQUE,
  brand_color TEXT DEFAULT '#6366f1',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- payments: Audit trail of all transactions
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  stripe_session_id TEXT NOT NULL UNIQUE, -- Stripe Checkout Session ID
  stripe_event_id TEXT UNIQUE, -- for idempotency — store processed event IDs
  amount_cents INTEGER NOT NULL, -- amount in cents (e.g. 2900 = $29.00)
  currency TEXT NOT NULL DEFAULT 'usd',
  type payment_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'complete', 'refunded'
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES — Required for RLS policy performance
-- Missing indexes cause 2-11x slowdown on RLS policy evaluation
-- ============================================================
CREATE INDEX ON public.scans(user_id);
CREATE INDEX ON public.scans(domain);
CREATE INDEX ON public.scans(created_at DESC);
CREATE INDEX ON public.scans(share_slug) WHERE share_slug IS NOT NULL;
CREATE INDEX ON public.reports(user_id);
CREATE INDEX ON public.reports(scan_id);
CREATE INDEX ON public.leads(email);
CREATE INDEX ON public.leads(converted);
CREATE INDEX ON public.payments(user_id);
CREATE INDEX ON public.payments(stripe_event_id) WHERE stripe_event_id IS NOT NULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- CRITICAL: Enable on ALL tables before the first row is inserted
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- users: can only see and modify their own row
CREATE POLICY "users_own_row" ON public.users
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- scans: own scans + public share links
CREATE POLICY "scans_own" ON public.scans
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "scans_public_read" ON public.scans
  FOR SELECT
  USING (is_public = true);

-- leads: NO user-facing policy
-- The leads table is intentionally inaccessible to all authenticated users via anon key.
-- All reads/writes go through the service_role key in Workers only.
-- No CREATE POLICY statements here is correct and intentional.

-- reports: own reports only
CREATE POLICY "reports_own" ON public.reports
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- agencies: own agency config only
CREATE POLICY "agencies_own" ON public.agencies
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- payments: own payments only (read-only for users — writes via service_role)
CREATE POLICY "payments_own_read" ON public.payments
  FOR SELECT
  USING (user_id = auth.uid());

-- ============================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER scans_updated_at
  BEFORE UPDATE ON public.scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agencies_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTH TRIGGER
-- Auto-create a row in public.users when a new auth.users row is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MONTHLY SCAN RESET FUNCTION
-- Call via Supabase cron or Cloudflare Cron Trigger
-- ============================================================
CREATE OR REPLACE FUNCTION reset_monthly_scan_counts()
RETURNS void AS $$
BEGIN
  UPDATE public.users
  SET
    scans_this_month = 0,
    scans_reset_at = date_trunc('month', now()) + interval '1 month'
  WHERE scans_reset_at <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SUPABASE KEEP-ALIVE NOTE
-- Free tier pauses after 7 days of inactivity.
-- Set a Cloudflare Cron Trigger to call the Supabase health endpoint every 24h:
--   https://your-project.supabase.co/rest/v1/
-- Configure in wrangler.jsonc under [triggers] crons
-- ============================================================
