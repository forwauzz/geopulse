-- Marketing attribution v1 (Phase 2)
-- Raw event log stored in a dedicated analytics schema (not public API surface)

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.marketing_events (
  id UUID PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_ts TIMESTAMPTZ NOT NULL,
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

CREATE INDEX IF NOT EXISTS marketing_events_event_name_event_ts_idx
  ON analytics.marketing_events (event_name, event_ts DESC);

CREATE INDEX IF NOT EXISTS marketing_events_scan_id_idx
  ON analytics.marketing_events (scan_id);

CREATE INDEX IF NOT EXISTS marketing_events_payment_id_idx
  ON analytics.marketing_events (payment_id);

CREATE INDEX IF NOT EXISTS marketing_events_anonymous_id_event_ts_idx
  ON analytics.marketing_events (anonymous_id, event_ts DESC);

CREATE INDEX IF NOT EXISTS marketing_events_utm_source_campaign_event_ts_idx
  ON analytics.marketing_events (utm_source, utm_campaign, event_ts DESC);

COMMENT ON TABLE analytics.marketing_events IS
  'Append-only attribution event facts for campaign/session -> conversion reporting';

COMMENT ON COLUMN analytics.marketing_events.email_hash IS
  'Lowercased+trimmed SHA-256 hex of email (full length, no truncation)';
