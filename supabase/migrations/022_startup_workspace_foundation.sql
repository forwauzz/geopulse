-- SD-004
-- Startup workspace tenancy foundation with founder/team memberships.

CREATE TABLE public.startup_workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  primary_domain TEXT,
  canonical_domain TEXT,
  status TEXT NOT NULL DEFAULT 'pilot',
  billing_mode TEXT NOT NULL DEFAULT 'free',
  default_bundle_id UUID REFERENCES public.service_bundles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_workspaces_workspace_key_check CHECK (
    workspace_key ~ '^[a-z0-9-]+$'
  ),
  CONSTRAINT startup_workspaces_status_check CHECK (
    status IN ('pilot', 'active', 'paused', 'archived')
  ),
  CONSTRAINT startup_workspaces_billing_mode_check CHECK (
    billing_mode IN ('free', 'paid', 'trial')
  )
);

CREATE TABLE public.startup_workspace_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_workspace_users_workspace_user_unique UNIQUE (startup_workspace_id, user_id),
  CONSTRAINT startup_workspace_users_role_check CHECK (
    role IN ('founder', 'admin', 'member', 'viewer')
  ),
  CONSTRAINT startup_workspace_users_status_check CHECK (
    status IN ('invited', 'active', 'suspended')
  )
);

CREATE TABLE public.startup_workspace_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  site_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_workspace_domains_workspace_domain_unique UNIQUE (startup_workspace_id, canonical_domain)
);

CREATE UNIQUE INDEX startup_workspace_domains_primary_idx
  ON public.startup_workspace_domains (startup_workspace_id)
  WHERE is_primary = true;

CREATE INDEX startup_workspace_users_user_status_idx
  ON public.startup_workspace_users (user_id, status, created_at DESC);

CREATE INDEX startup_workspaces_status_created_at_idx
  ON public.startup_workspaces (status, created_at DESC);

ALTER TABLE public.scans
  ADD COLUMN startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.reports
  ADD COLUMN startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_run_source_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_run_source_check CHECK (
    run_source IN (
      'public_self_serve',
      'agency_dashboard',
      'startup_dashboard',
      'internal_benchmark',
      'admin_manual'
    )
  );

CREATE INDEX scans_startup_workspace_created_at_idx
  ON public.scans (startup_workspace_id, created_at DESC);

CREATE INDEX reports_startup_workspace_created_at_idx
  ON public.reports (startup_workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_startup_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.startup_workspace_users swu
    WHERE swu.startup_workspace_id = workspace_uuid
      AND swu.user_id = auth.uid()
      AND swu.status = 'active'
  );
$$ LANGUAGE sql STABLE;

ALTER TABLE public.startup_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_workspace_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_workspace_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_workspaces_member_read" ON public.startup_workspaces
  FOR SELECT
  USING (public.is_startup_workspace_member(id));

CREATE POLICY "startup_workspace_users_member_read" ON public.startup_workspace_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_startup_workspace_member(startup_workspace_id)
  );

CREATE POLICY "startup_workspace_domains_member_read" ON public.startup_workspace_domains
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "scans_startup_member_read" ON public.scans
  FOR SELECT
  USING (
    startup_workspace_id IS NOT NULL
    AND public.is_startup_workspace_member(startup_workspace_id)
  );

CREATE POLICY "reports_startup_member_read" ON public.reports
  FOR SELECT
  USING (
    startup_workspace_id IS NOT NULL
    AND public.is_startup_workspace_member(startup_workspace_id)
  );

CREATE TRIGGER startup_workspaces_updated_at
  BEFORE UPDATE ON public.startup_workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_workspace_users_updated_at
  BEFORE UPDATE ON public.startup_workspace_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_workspace_domains_updated_at
  BEFORE UPDATE ON public.startup_workspace_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_workspaces IS 'Startup founder/team workspaces for startup-specific dashboard and workflows.';
COMMENT ON TABLE public.startup_workspace_users IS 'Auth-user membership records in startup workspaces.';
COMMENT ON TABLE public.startup_workspace_domains IS 'Tracked domains attached to one startup workspace.';
COMMENT ON COLUMN public.startup_workspaces.default_bundle_id IS 'Default startup bundle used for entitlement resolution.';
