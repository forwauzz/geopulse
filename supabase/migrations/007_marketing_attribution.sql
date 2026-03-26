-- GEO-Pulse Marketing Attribution Schema (Phase 2 parallel)
-- Migration: 007_marketing_attribution
-- Run via: supabase db push
--
-- Additive-only: creates new `analytics` schema + `marketing_events` table.
-- Also adds `scan_id` column to `leads` for identity stitching.
-- Does NOT modify existing tables' behavior.

-- ============================================================
-- SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS analytics;

-- ============================================================
-- marketing_events: Append-only canonical funnel events
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics.marketing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  anonymous_id TEXT,
  scan_id UUID,
  lead_id UUID,
  payment_id UUID,
  user_id UUID,
  email_hash TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer_url TEXT,
  landing_path TEXT,
  channel TEXT,
  content_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- If the table already existed (older shape), bring it up to v1 contract.
ALTER TABLE analytics.marketing_events
  ADD COLUMN IF NOT EXISTS event_id UUID,
  ADD COLUMN IF NOT EXISTS event_name TEXT,
  ADD COLUMN IF NOT EXISTS event_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymous_id TEXT,
  ADD COLUMN IF NOT EXISTS scan_id UUID,
  ADD COLUMN IF NOT EXISTS lead_id UUID,
  ADD COLUMN IF NOT EXISTS payment_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS email_hash TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS referrer_url TEXT,
  ADD COLUMN IF NOT EXISTS landing_path TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS content_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- Backfill and enforce required defaults for legacy rows.
UPDATE analytics.marketing_events
SET
  event_id = COALESCE(event_id, uuid_generate_v4()),
  event_ts = COALESCE(event_ts, now()),
  metadata_json = COALESCE(metadata_json, '{}'::jsonb),
  created_at = COALESCE(created_at, now())
WHERE
  event_id IS NULL
  OR event_ts IS NULL
  OR metadata_json IS NULL
  OR created_at IS NULL;

ALTER TABLE analytics.marketing_events
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN event_ts SET NOT NULL,
  ALTER COLUMN metadata_json SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE analytics.marketing_events
  ALTER COLUMN event_ts SET DEFAULT now(),
  ALTER COLUMN metadata_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now();

COMMENT ON TABLE analytics.marketing_events IS 'Append-only funnel events for first/last-touch attribution. Service-role only — no anon access.';
COMMENT ON COLUMN analytics.marketing_events.event_id IS 'Client-generated UUID for idempotent inserts.';
COMMENT ON COLUMN analytics.marketing_events.email_hash IS 'Full SHA-256 hex of normalized (lowercase+trim) email. Never store raw email here.';

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mktg_events_name_ts ON analytics.marketing_events (event_name, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_mktg_events_scan ON analytics.marketing_events (scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_payment ON analytics.marketing_events (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_anon_ts ON analytics.marketing_events (anonymous_id, event_ts DESC) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_utm ON analytics.marketing_events (utm_source, utm_campaign, event_ts DESC) WHERE utm_source IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mktg_events_event_id_unique ON analytics.marketing_events (event_id);

-- ============================================================
-- RLS — service_role only (no anon/user access)
-- ============================================================
ALTER TABLE analytics.marketing_events ENABLE ROW LEVEL SECURITY;
-- No policies = no access via anon/authenticated keys. Only service_role bypasses RLS.

-- ============================================================
-- leads: add scan_id for identity stitching
-- ============================================================
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_scan_id ON public.leads (scan_id) WHERE scan_id IS NOT NULL;
