-- SL-010
-- Seed centralized bundle mappings for Slack services so they are first-class in /dashboard/services.

INSERT INTO public.service_bundle_services (
  bundle_id,
  service_id,
  enabled,
  access_mode,
  usage_limit,
  metadata
)
SELECT
  b.id AS bundle_id,
  s.id AS service_id,
  false AS enabled,
  'off' AS access_mode,
  NULL AS usage_limit,
  '{"seed":"sl010"}'::jsonb AS metadata
FROM public.service_bundles b
CROSS JOIN public.service_catalog s
WHERE b.bundle_key IN ('startup_lite', 'startup_dev', 'agency_core', 'agency_pro')
  AND s.service_key IN ('slack_integration', 'slack_notifications')
ON CONFLICT (bundle_id, service_id) DO NOTHING;
