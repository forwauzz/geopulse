-- GPM-012
-- Register geo_performance_monitoring in service_catalog and map to bundles.
-- startup_dev → paid (monthly, up to 10 prompts/run)
-- agency_core → paid (monthly + biweekly, up to 15 prompts/run)
-- agency_pro  → paid (all cadences, unlimited prompts/run)
-- startup_lite → off (service disabled for this tier)

INSERT INTO public.service_catalog (service_key, name, description, category, default_access_mode, metadata)
VALUES (
  'geo_performance_monitoring',
  'GEO Performance Monitoring',
  'Tracks AI search visibility across ChatGPT, Gemini, and Perplexity for a client domain and benchmark query set. Delivers scheduled visibility reports with competitor co-citation analysis.',
  'analytics',
  'off',
  '{
    "seed": "gpm012",
    "cadence_caps": {
      "startup_dev":  ["monthly"],
      "agency_core":  ["monthly", "biweekly"],
      "agency_pro":   ["monthly", "biweekly", "weekly"]
    },
    "prompt_caps": {
      "startup_dev":  10,
      "agency_core":  15,
      "agency_pro":   null
    },
    "delivery_surfaces": {
      "startup_dev":  ["email"],
      "agency_core":  ["email", "slack"],
      "agency_pro":   ["email", "slack", "portal"]
    }
  }'::jsonb
)
ON CONFLICT (service_key) DO NOTHING;

-- Seed bundle mappings — off by default for all bundles first
INSERT INTO public.service_bundle_services (bundle_id, service_id, enabled, access_mode, usage_limit, metadata)
SELECT
  b.id  AS bundle_id,
  s.id  AS service_id,
  false AS enabled,
  'off' AS access_mode,
  NULL  AS usage_limit,
  '{"seed":"gpm012"}'::jsonb AS metadata
FROM public.service_bundles b
CROSS JOIN public.service_catalog s
WHERE b.bundle_key IN ('startup_lite', 'startup_dev', 'agency_core', 'agency_pro')
  AND s.service_key = 'geo_performance_monitoring'
ON CONFLICT (bundle_id, service_id) DO NOTHING;

-- Enable for paid bundles
UPDATE public.service_bundle_services sbs
SET
  enabled     = true,
  access_mode = 'paid'
FROM public.service_bundles b, public.service_catalog s
WHERE sbs.bundle_id = b.id
  AND sbs.service_id = s.id
  AND b.bundle_key IN ('startup_dev', 'agency_core', 'agency_pro')
  AND s.service_key = 'geo_performance_monitoring';
