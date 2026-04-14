-- SD-001
-- Centralized service catalog + bundle + entitlement foundation.
-- This migration is schema-first and does not switch runtime gating yet.

CREATE TYPE public.service_access_mode AS ENUM ('free', 'paid', 'trial', 'off');
CREATE TYPE public.service_entitlement_scope AS ENUM (
  'global',
  'bundle_default',
  'agency_account',
  'agency_client',
  'user'
);
CREATE TYPE public.service_model_policy_scope AS ENUM (
  'service_default',
  'bundle',
  'agency_account',
  'agency_client'
);

CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'core',
  default_access_mode public.service_access_mode NOT NULL DEFAULT 'off',
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_catalog_service_key_check CHECK (
    service_key ~ '^[a-z0-9_]+$'
  )
);

CREATE TABLE public.service_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  workspace_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_bundles_bundle_key_check CHECK (
    bundle_key ~ '^[a-z0-9_]+$'
  ),
  CONSTRAINT service_bundles_workspace_type_check CHECK (
    workspace_type IN ('startup', 'agency', 'platform')
  ),
  CONSTRAINT service_bundles_status_check CHECK (
    status IN ('active', 'paused', 'archived')
  )
);

CREATE TABLE public.service_bundle_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bundle_id UUID NOT NULL REFERENCES public.service_bundles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  access_mode public.service_access_mode,
  usage_limit INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_bundle_services_bundle_service_unique UNIQUE (bundle_id, service_id),
  CONSTRAINT service_bundle_services_usage_limit_check CHECK (
    usage_limit IS NULL OR usage_limit >= 0
  )
);

CREATE TABLE public.service_entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  scope_type public.service_entitlement_scope NOT NULL,
  bundle_id UUID REFERENCES public.service_bundles(id) ON DELETE CASCADE,
  agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  access_mode public.service_access_mode,
  usage_limit INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_entitlement_overrides_usage_limit_check CHECK (
    usage_limit IS NULL OR usage_limit >= 0
  ),
  CONSTRAINT service_entitlement_scope_shape_check CHECK (
    (
      scope_type = 'global'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND user_id IS NULL
    )
    OR (
      scope_type = 'bundle_default'
      AND bundle_id IS NOT NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND user_id IS NULL
    )
    OR (
      scope_type = 'agency_account'
      AND bundle_id IS NULL
      AND agency_account_id IS NOT NULL
      AND agency_client_id IS NULL
      AND user_id IS NULL
    )
    OR (
      scope_type = 'agency_client'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NOT NULL
      AND user_id IS NULL
    )
    OR (
      scope_type = 'user'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND user_id IS NOT NULL
    )
  )
);

CREATE TABLE public.service_model_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  scope_type public.service_model_policy_scope NOT NULL,
  bundle_id UUID REFERENCES public.service_bundles(id) ON DELETE CASCADE,
  agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  max_cost_usd NUMERIC(10, 4),
  fallback_provider_name TEXT,
  fallback_model_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_model_policies_provider_check CHECK (
    provider_name IN ('gemini', 'openai', 'anthropic', 'custom')
  ),
  CONSTRAINT service_model_policies_fallback_provider_check CHECK (
    fallback_provider_name IS NULL
    OR fallback_provider_name IN ('gemini', 'openai', 'anthropic', 'custom')
  ),
  CONSTRAINT service_model_policies_max_cost_check CHECK (
    max_cost_usd IS NULL OR max_cost_usd >= 0
  ),
  CONSTRAINT service_model_scope_shape_check CHECK (
    (
      scope_type = 'service_default'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
    )
    OR (
      scope_type = 'bundle'
      AND bundle_id IS NOT NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
    )
    OR (
      scope_type = 'agency_account'
      AND bundle_id IS NULL
      AND agency_account_id IS NOT NULL
      AND agency_client_id IS NULL
    )
    OR (
      scope_type = 'agency_client'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NOT NULL
    )
  )
);

-- Compatibility seam so existing agency feature-flag keys can be represented
-- in the centralized service catalog.
CREATE TABLE public.service_legacy_flag_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  legacy_flag_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_legacy_flag_map_unique UNIQUE (service_id, legacy_flag_key)
);

CREATE UNIQUE INDEX service_entitlement_global_unique_idx
  ON public.service_entitlement_overrides (service_id)
  WHERE scope_type = 'global';

CREATE UNIQUE INDEX service_entitlement_bundle_unique_idx
  ON public.service_entitlement_overrides (service_id, bundle_id)
  WHERE scope_type = 'bundle_default';

CREATE UNIQUE INDEX service_entitlement_agency_account_unique_idx
  ON public.service_entitlement_overrides (service_id, agency_account_id)
  WHERE scope_type = 'agency_account';

CREATE UNIQUE INDEX service_entitlement_agency_client_unique_idx
  ON public.service_entitlement_overrides (service_id, agency_client_id)
  WHERE scope_type = 'agency_client';

CREATE UNIQUE INDEX service_entitlement_user_unique_idx
  ON public.service_entitlement_overrides (service_id, user_id)
  WHERE scope_type = 'user';

CREATE UNIQUE INDEX service_model_default_unique_idx
  ON public.service_model_policies (service_id)
  WHERE scope_type = 'service_default';

CREATE UNIQUE INDEX service_model_bundle_unique_idx
  ON public.service_model_policies (service_id, bundle_id)
  WHERE scope_type = 'bundle';

CREATE UNIQUE INDEX service_model_agency_account_unique_idx
  ON public.service_model_policies (service_id, agency_account_id)
  WHERE scope_type = 'agency_account';

CREATE UNIQUE INDEX service_model_agency_client_unique_idx
  ON public.service_model_policies (service_id, agency_client_id)
  WHERE scope_type = 'agency_client';

CREATE INDEX service_catalog_category_created_at_idx
  ON public.service_catalog (category, created_at DESC);

CREATE INDEX service_bundles_workspace_created_at_idx
  ON public.service_bundles (workspace_type, created_at DESC);

CREATE INDEX service_bundle_services_bundle_created_at_idx
  ON public.service_bundle_services (bundle_id, created_at DESC);

CREATE INDEX service_entitlement_scope_created_at_idx
  ON public.service_entitlement_overrides (scope_type, created_at DESC);

CREATE INDEX service_model_scope_created_at_idx
  ON public.service_model_policies (scope_type, created_at DESC);

CREATE INDEX service_legacy_flag_key_idx
  ON public.service_legacy_flag_map (legacy_flag_key);

CREATE TRIGGER service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER service_bundles_updated_at
  BEFORE UPDATE ON public.service_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER service_bundle_services_updated_at
  BEFORE UPDATE ON public.service_bundle_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER service_entitlement_overrides_updated_at
  BEFORE UPDATE ON public.service_entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER service_model_policies_updated_at
  BEFORE UPDATE ON public.service_model_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER service_legacy_flag_map_updated_at
  BEFORE UPDATE ON public.service_legacy_flag_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_bundle_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_model_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_legacy_flag_map ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.service_catalog IS 'Canonical service catalog for centralized entitlement and billing control.';
COMMENT ON TABLE public.service_bundles IS 'Bundle definitions for startup/agency plan packaging.';
COMMENT ON TABLE public.service_bundle_services IS 'Per-bundle service toggle and access mode defaults.';
COMMENT ON TABLE public.service_entitlement_overrides IS 'Scope overrides over bundle defaults for service access and limits.';
COMMENT ON TABLE public.service_model_policies IS 'Scope-aware model-routing policy by service.';
COMMENT ON TABLE public.service_legacy_flag_map IS 'Compatibility map from centralized services to existing legacy agency feature-flag keys.';

COMMENT ON COLUMN public.service_catalog.default_access_mode IS 'Default access posture for a service before bundle/override logic applies.';
COMMENT ON COLUMN public.service_entitlement_overrides.scope_type IS 'Override scope: global, bundle default, agency account, agency client, or one user.';
COMMENT ON COLUMN public.service_model_policies.scope_type IS 'Model policy scope: service default, bundle, agency account, or agency client.';

INSERT INTO public.service_catalog (service_key, name, description, category, default_access_mode, metadata)
VALUES
  ('free_scan', 'Free Scan', 'Self-serve scan path and baseline results.', 'core', 'free', '{"seed":"sd001"}'::jsonb),
  ('deep_audit', 'Deep Audit', 'Paid or entitled deep audit report generation.', 'core', 'paid', '{"seed":"sd001"}'::jsonb),
  ('geo_tracker', 'GEO Tracker', 'Ongoing GEO trend tracking surfaces.', 'tracking', 'off', '{"seed":"sd001"}'::jsonb),
  ('startup_dashboard', 'Startup Dashboard', 'Founder-friendly startup workspace dashboard.', 'dashboard', 'free', '{"seed":"sd001"}'::jsonb),
  ('agency_dashboard', 'Agency Dashboard', 'Agency multi-client dashboard surfaces.', 'dashboard', 'paid', '{"seed":"sd001"}'::jsonb),
  ('markdown_audit_export', 'Markdown Audit Export', 'Downloadable markdown audit artifacts.', 'content', 'free', '{"seed":"sd001"}'::jsonb),
  ('markdown_plan_generator', 'Markdown Plan Generator', 'Convert markdown audit into implementation plans.', 'automation', 'off', '{"seed":"sd001"}'::jsonb),
  ('skills_library', 'Skills Library', 'Skills dashboard and reusable playbooks.', 'skills', 'free', '{"seed":"sd001"}'::jsonb),
  ('github_integration', 'GitHub Integration', 'GitHub App connect and repository sync.', 'integration', 'off', '{"seed":"sd001"}'::jsonb),
  ('agent_pr_execution', 'Agent PR Execution', 'Agent-authored pull request workflow.', 'automation', 'off', '{"seed":"sd001"}'::jsonb),
  ('api_access', 'API Access', 'API-as-a-service keys and usage path.', 'api', 'off', '{"seed":"sd001"}'::jsonb)
ON CONFLICT (service_key) DO NOTHING;

INSERT INTO public.service_bundles (bundle_key, name, workspace_type, status, metadata)
VALUES
  ('startup_lite', 'Startup Lite', 'startup', 'active', '{"seed":"sd001"}'::jsonb),
  ('startup_dev', 'Startup Dev', 'startup', 'active', '{"seed":"sd001"}'::jsonb),
  ('agency_core', 'Agency Core', 'agency', 'active', '{"seed":"sd001"}'::jsonb),
  ('agency_pro', 'Agency Pro', 'agency', 'active', '{"seed":"sd001"}'::jsonb)
ON CONFLICT (bundle_key) DO NOTHING;

WITH bundle_seed AS (
  SELECT b.id AS bundle_id, b.bundle_key, s.id AS service_id, s.service_key
  FROM public.service_bundles b
  CROSS JOIN public.service_catalog s
)
INSERT INTO public.service_bundle_services (bundle_id, service_id, enabled, access_mode, metadata)
SELECT
  bundle_id,
  service_id,
  CASE
    WHEN bundle_key = 'startup_lite' AND service_key IN ('startup_dashboard', 'free_scan', 'markdown_audit_export', 'skills_library') THEN true
    WHEN bundle_key = 'startup_dev' AND service_key IN ('startup_dashboard', 'free_scan', 'markdown_audit_export', 'skills_library', 'markdown_plan_generator', 'github_integration') THEN true
    WHEN bundle_key = 'agency_core' AND service_key IN ('agency_dashboard', 'free_scan', 'deep_audit', 'markdown_audit_export') THEN true
    WHEN bundle_key = 'agency_pro' AND service_key IN ('agency_dashboard', 'free_scan', 'deep_audit', 'markdown_audit_export', 'geo_tracker', 'skills_library') THEN true
    ELSE false
  END AS enabled,
  CASE
    WHEN service_key IN ('free_scan', 'startup_dashboard', 'markdown_audit_export', 'skills_library') THEN 'free'::public.service_access_mode
    WHEN service_key IN ('deep_audit', 'agency_dashboard') THEN 'paid'::public.service_access_mode
    ELSE 'off'::public.service_access_mode
  END AS access_mode,
  jsonb_build_object('seed', 'sd001')
FROM bundle_seed
ON CONFLICT (bundle_id, service_id) DO NOTHING;

INSERT INTO public.service_legacy_flag_map (service_id, legacy_flag_key, metadata)
SELECT s.id, x.legacy_flag_key, '{"seed":"sd001"}'::jsonb
FROM public.service_catalog s
JOIN (
  VALUES
    ('agency_dashboard', 'agency_dashboard_enabled'),
    ('free_scan', 'scan_launch_enabled'),
    ('deep_audit', 'deep_audit_enabled'),
    ('geo_tracker', 'geo_tracker_enabled')
) AS x(service_key, legacy_flag_key)
  ON s.service_key = x.service_key
ON CONFLICT (service_id, legacy_flag_key) DO NOTHING;
