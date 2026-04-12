-- SL-011
-- Enable slack_integration and slack_notifications for paid bundles.
-- Migration 032 seeded these as enabled=false / access_mode='off' for all bundles
-- (including startup_dev) with ON CONFLICT DO NOTHING, so they were never enabled.
-- This corrects that so startup_dev, agency_core, and agency_pro users can connect
-- Slack and receive scheduled audit deliveries.

UPDATE public.service_bundle_services sbs
SET enabled = true, access_mode = 'free'
FROM public.service_bundles b, public.service_catalog s
WHERE sbs.bundle_id = b.id
  AND sbs.service_id = s.id
  AND b.bundle_key IN ('startup_dev', 'agency_core', 'agency_pro')
  AND s.service_key IN ('slack_integration', 'slack_notifications');
