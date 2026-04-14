-- SD-011
-- Extend centralized service model policies to support startup workspace scope.

ALTER TYPE public.service_model_policy_scope
  ADD VALUE IF NOT EXISTS 'startup_workspace';

ALTER TABLE public.service_model_policies
  ADD COLUMN startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.service_model_policies DROP CONSTRAINT IF EXISTS service_model_scope_shape_check;
ALTER TABLE public.service_model_policies
  ADD CONSTRAINT service_model_scope_shape_check CHECK (
    (
      scope_type = 'service_default'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND startup_workspace_id IS NULL
    )
    OR (
      scope_type = 'bundle'
      AND bundle_id IS NOT NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND startup_workspace_id IS NULL
    )
    OR (
      scope_type = 'agency_account'
      AND bundle_id IS NULL
      AND agency_account_id IS NOT NULL
      AND agency_client_id IS NULL
      AND startup_workspace_id IS NULL
    )
    OR (
      scope_type = 'agency_client'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NOT NULL
      AND startup_workspace_id IS NULL
    )
    OR (
      scope_type::text = 'startup_workspace'
      AND bundle_id IS NULL
      AND agency_account_id IS NULL
      AND agency_client_id IS NULL
      AND startup_workspace_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS service_model_startup_workspace_unique_idx
  ON public.service_model_policies (service_id, startup_workspace_id)
  WHERE startup_workspace_id IS NOT NULL;

COMMENT ON COLUMN public.service_model_policies.startup_workspace_id IS 'Startup workspace scope target for startup-specific model policy overrides.';
