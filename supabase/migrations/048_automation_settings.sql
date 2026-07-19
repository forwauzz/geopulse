-- Migration 048: generic automation settings (admin Automation console).
--
-- A single, feature-keyed control table so admin autonomy toggles are live-editable from the UI
-- without a redeploy. Self-improvement keeps its own richer table (047); the marketing autopilot
-- (and future automations) live here. Service-role only (RLS enabled, no policies) like 047.

CREATE TABLE IF NOT EXISTS public.automation_settings (
  feature      TEXT        PRIMARY KEY,
  enabled      BOOLEAN     NOT NULL DEFAULT false,
  kill_switch  BOOLEAN     NOT NULL DEFAULT false,
  config       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.automation_settings IS
  'Feature-keyed runtime toggles for the admin Automation console (Loop 5). Kill switch overrides '
  'enabled. Service-role only.';

INSERT INTO public.automation_settings (feature, config)
VALUES ('marketing_autopilot', '{"daily_cap": 2}'::jsonb)
ON CONFLICT (feature) DO NOTHING;

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;
