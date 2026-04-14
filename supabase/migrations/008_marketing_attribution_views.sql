-- GEO-Pulse Marketing Attribution Reporting Views (Phase 2)
-- Migration: 008_marketing_attribution_views
-- Run via: supabase db push
--
-- Creates analytics views for weekly funnel + first/last-touch conversions.
-- No PII: uses email_hash only; never joins on raw email.

CREATE SCHEMA IF NOT EXISTS analytics;

-- ============================================================
-- Safety: ensure marketing_events exists (007 may be recorded
-- as applied by Supabase even if partially run earlier)
-- ============================================================
CREATE TABLE IF NOT EXISTS analytics.marketing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_mktg_events_event_id_unique ON analytics.marketing_events (event_id);
CREATE INDEX IF NOT EXISTS idx_mktg_events_name_ts ON analytics.marketing_events (event_name, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_mktg_events_scan ON analytics.marketing_events (scan_id) WHERE scan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_payment ON analytics.marketing_events (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_anon_ts ON analytics.marketing_events (anonymous_id, event_ts DESC) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mktg_events_utm ON analytics.marketing_events (utm_source, utm_campaign, event_ts DESC) WHERE utm_source IS NOT NULL;
ALTER TABLE analytics.marketing_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_scan_id ON public.leads (scan_id) WHERE scan_id IS NOT NULL;

-- ============================================================
-- Helper view: payments as conversions (canonical)
-- ============================================================
CREATE OR REPLACE VIEW analytics.conversion_events_v1 AS
SELECT
  me.event_id,
  me.event_ts AS payment_ts,
  me.anonymous_id,
  me.scan_id,
  me.lead_id,
  me.payment_id,
  me.user_id,
  me.email_hash,
  me.utm_source,
  me.utm_medium,
  me.utm_campaign,
  me.utm_content,
  me.utm_term,
  me.referrer_url,
  me.landing_path,
  me.channel,
  me.content_id,
  me.metadata_json
FROM analytics.marketing_events me
WHERE me.event_name = 'payment_completed';

-- ============================================================
-- attribution_conversions_v1: first-touch + last-touch per conversion
-- Windows: first-touch 30d, last-touch 7d (v1 locked decision)
-- ============================================================
CREATE OR REPLACE VIEW analytics.attribution_conversions_v1 AS
WITH conv AS (
  SELECT * FROM analytics.conversion_events_v1
),
touches AS (
  SELECT
    c.event_id AS conversion_event_id,
    c.payment_ts,
    e.event_id AS touch_event_id,
    e.event_ts AS touch_ts,
    e.event_name AS touch_event_name,
    e.anonymous_id,
    e.scan_id,
    e.lead_id,
    e.payment_id,
    e.user_id,
    e.email_hash,
    e.utm_source,
    e.utm_medium,
    e.utm_campaign,
    e.utm_content,
    e.utm_term,
    e.referrer_url,
    e.landing_path,
    e.channel,
    e.content_id
  FROM conv c
  JOIN analytics.marketing_events e
    ON (
      (c.payment_id IS NOT NULL AND e.payment_id = c.payment_id)
      OR (c.scan_id IS NOT NULL AND e.scan_id = c.scan_id)
      OR (c.lead_id IS NOT NULL AND e.lead_id = c.lead_id)
      OR (c.email_hash IS NOT NULL AND e.email_hash = c.email_hash)
      OR (c.anonymous_id IS NOT NULL AND e.anonymous_id = c.anonymous_id)
    )
  WHERE
    e.event_ts <= c.payment_ts
    AND e.event_name IN ('session_started','scan_started','scan_completed','lead_submitted','checkout_started')
),
first_touch AS (
  SELECT DISTINCT ON (conversion_event_id)
    conversion_event_id,
    touch_ts AS first_touch_ts,
    COALESCE(channel, 'direct_or_unknown') AS first_touch_channel,
    utm_source AS first_touch_utm_source,
    utm_campaign AS first_touch_utm_campaign,
    content_id AS first_touch_content_id
  FROM touches
  WHERE touch_ts >= payment_ts - interval '30 days'
  ORDER BY conversion_event_id, touch_ts ASC
),
last_touch AS (
  SELECT DISTINCT ON (conversion_event_id)
    conversion_event_id,
    touch_ts AS last_touch_ts,
    COALESCE(channel, 'direct_or_unknown') AS last_touch_channel,
    utm_source AS last_touch_utm_source,
    utm_campaign AS last_touch_utm_campaign,
    content_id AS last_touch_content_id
  FROM touches
  WHERE touch_ts >= payment_ts - interval '7 days'
  ORDER BY conversion_event_id, touch_ts DESC
)
SELECT
  c.event_id AS conversion_event_id,
  c.payment_ts,
  c.payment_id,
  c.scan_id,
  c.anonymous_id,
  c.user_id,
  c.email_hash,
  ft.first_touch_ts,
  ft.first_touch_channel,
  ft.first_touch_utm_source,
  ft.first_touch_utm_campaign,
  ft.first_touch_content_id,
  lt.last_touch_ts,
  lt.last_touch_channel,
  lt.last_touch_utm_source,
  lt.last_touch_utm_campaign,
  lt.last_touch_content_id,
  EXTRACT(EPOCH FROM (c.payment_ts - ft.first_touch_ts))::bigint AS seconds_to_convert_from_first_touch
FROM conv c
LEFT JOIN first_touch ft ON ft.conversion_event_id = c.event_id
LEFT JOIN last_touch lt ON lt.conversion_event_id = c.event_id;

COMMENT ON VIEW analytics.attribution_conversions_v1 IS 'Per-conversion first-touch and last-touch attribution derived from analytics.marketing_events (v1 windows: 30d first, 7d last).';

-- ============================================================
-- Weekly funnel aggregate (by channel + campaign)
-- Uses event_ts buckets; counts distinct anonymous_id and scan_id where present.
-- ============================================================
CREATE OR REPLACE VIEW analytics.channel_funnel_weekly_v1 AS
WITH base AS (
  SELECT
    date_trunc('week', event_ts)::date AS week_start,
    COALESCE(NULLIF(channel, ''), 'direct_or_unknown') AS channel,
    utm_source,
    utm_campaign,
    event_name,
    anonymous_id,
    scan_id
  FROM analytics.marketing_events
  WHERE event_name IN (
    'session_started',
    'scan_started',
    'scan_completed',
    'lead_submitted',
    'checkout_started',
    'payment_completed'
  )
),
pivot AS (
  SELECT
    week_start,
    channel,
    utm_source,
    utm_campaign,
    COUNT(DISTINCT anonymous_id) FILTER (WHERE event_name = 'session_started') AS sessions,
    COUNT(DISTINCT scan_id) FILTER (WHERE event_name = 'scan_started') AS scans_started,
    COUNT(DISTINCT scan_id) FILTER (WHERE event_name = 'scan_completed') AS scans_completed,
    COUNT(DISTINCT scan_id) FILTER (WHERE event_name = 'lead_submitted') AS leads_submitted,
    COUNT(DISTINCT scan_id) FILTER (WHERE event_name = 'checkout_started') AS checkouts_started,
    COUNT(DISTINCT scan_id) FILTER (WHERE event_name = 'payment_completed') AS payments_completed
  FROM base
  GROUP BY 1,2,3,4
)
SELECT * FROM pivot;

COMMENT ON VIEW analytics.channel_funnel_weekly_v1 IS 'Weekly funnel counts by channel + utm_source + utm_campaign (v1).';

