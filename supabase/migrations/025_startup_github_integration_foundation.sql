-- SD-009
-- Startup GitHub App integration foundation: install linkage + repo allowlist + callback sessions.

CREATE TABLE public.startup_github_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  installation_id BIGINT,
  account_login TEXT,
  account_type TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_github_installations_provider_check CHECK (provider IN ('github')),
  CONSTRAINT startup_github_installations_status_check CHECK (
    status IN ('disconnected', 'pending', 'connected', 'error')
  ),
  CONSTRAINT startup_github_installations_workspace_provider_unique UNIQUE (startup_workspace_id, provider),
  CONSTRAINT startup_github_installations_installation_unique UNIQUE (installation_id)
);

CREATE TABLE public.startup_github_installation_repositories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  installation_row_id UUID NOT NULL REFERENCES public.startup_github_installations(id) ON DELETE CASCADE,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_github_installation_repositories_unique UNIQUE (installation_row_id, repo_owner, repo_name)
);

CREATE TABLE public.startup_github_install_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  state_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  redirect_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_github_install_sessions_provider_check CHECK (provider IN ('github')),
  CONSTRAINT startup_github_install_sessions_status_check CHECK (
    status IN ('pending', 'consumed', 'expired', 'cancelled')
  )
);

CREATE INDEX startup_github_installations_workspace_status_idx
  ON public.startup_github_installations (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_github_repositories_workspace_idx
  ON public.startup_github_installation_repositories (startup_workspace_id, is_enabled, created_at DESC);

CREATE INDEX startup_github_sessions_workspace_status_idx
  ON public.startup_github_install_sessions (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_github_sessions_expires_idx
  ON public.startup_github_install_sessions (expires_at);

ALTER TABLE public.startup_github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_github_installation_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_github_install_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_github_installations_member_read" ON public.startup_github_installations
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_installations_member_write" ON public.startup_github_installations
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_installations_member_update" ON public.startup_github_installations
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_repositories_member_read" ON public.startup_github_installation_repositories
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_repositories_member_write" ON public.startup_github_installation_repositories
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_repositories_member_update" ON public.startup_github_installation_repositories
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_repositories_member_delete" ON public.startup_github_installation_repositories
  FOR DELETE
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_sessions_member_read" ON public.startup_github_install_sessions
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_sessions_member_write" ON public.startup_github_install_sessions
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_github_sessions_member_update" ON public.startup_github_install_sessions
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_github_installations_updated_at
  BEFORE UPDATE ON public.startup_github_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_github_repositories_updated_at
  BEFORE UPDATE ON public.startup_github_installation_repositories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_github_sessions_updated_at
  BEFORE UPDATE ON public.startup_github_install_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_github_installations IS 'Startup workspace GitHub App installation linkage and connection status.';
COMMENT ON TABLE public.startup_github_installation_repositories IS 'Repository allowlist for startup GitHub installation scope.';
COMMENT ON TABLE public.startup_github_install_sessions IS 'Short-lived callback state records for GitHub install/connect flow.';
