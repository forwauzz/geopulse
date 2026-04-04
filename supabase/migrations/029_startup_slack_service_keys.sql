-- SL-002
-- Add Slack service keys to centralized service catalog for startup delivery MVP.

INSERT INTO public.service_catalog (service_key, name, description, category, default_access_mode, metadata)
VALUES
  (
    'slack_integration',
    'Slack Integration',
    'Connect startup workspaces to Slack workspaces.',
    'integration',
    'off',
    '{"seed":"sl002"}'::jsonb
  ),
  (
    'slack_notifications',
    'Slack Notifications',
    'Send startup audit and plan updates to Slack channels.',
    'integration',
    'off',
    '{"seed":"sl002"}'::jsonb
  )
ON CONFLICT (service_key) DO NOTHING;
