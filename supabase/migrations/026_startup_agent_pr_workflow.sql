-- SD-010
-- Startup recommendation -> PR execution workflow + lifecycle sync records.

CREATE TABLE public.startup_agent_pr_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES public.startup_recommendations(id) ON DELETE CASCADE,
  github_installation_row_id UUID REFERENCES public.startup_github_installations(id) ON DELETE SET NULL,
  github_repository_row_id UUID REFERENCES public.startup_github_installation_repositories(id) ON DELETE SET NULL,
  repository_owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  branch_name TEXT,
  commit_sha TEXT,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  queued_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_agent_pr_runs_status_check CHECK (
    status IN ('queued', 'running', 'pr_opened', 'merged', 'closed', 'failed', 'cancelled')
  ),
  CONSTRAINT startup_agent_pr_runs_pr_number_check CHECK (
    pull_request_number IS NULL OR pull_request_number > 0
  ),
  CONSTRAINT startup_agent_pr_runs_repository_slug_check CHECK (
    repository_owner ~ '^[A-Za-z0-9_.-]+$' AND repository_name ~ '^[A-Za-z0-9_.-]+$'
  )
);

CREATE TABLE public.startup_agent_pr_run_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.startup_agent_pr_runs(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES public.startup_recommendations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_agent_pr_run_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN ('queued', 'running', 'pr_opened', 'merged', 'closed', 'failed', 'cancelled')
  ),
  CONSTRAINT startup_agent_pr_run_events_to_status_check CHECK (
    to_status IN ('queued', 'running', 'pr_opened', 'merged', 'closed', 'failed', 'cancelled')
  )
);

CREATE INDEX startup_agent_pr_runs_workspace_created_at_idx
  ON public.startup_agent_pr_runs (startup_workspace_id, created_at DESC);

CREATE INDEX startup_agent_pr_runs_workspace_status_idx
  ON public.startup_agent_pr_runs (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_agent_pr_runs_recommendation_idx
  ON public.startup_agent_pr_runs (recommendation_id, created_at DESC);

CREATE INDEX startup_agent_pr_run_events_workspace_created_at_idx
  ON public.startup_agent_pr_run_events (startup_workspace_id, created_at DESC);

CREATE INDEX startup_agent_pr_run_events_run_created_at_idx
  ON public.startup_agent_pr_run_events (run_id, created_at DESC);

ALTER TABLE public.startup_agent_pr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_agent_pr_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_agent_pr_runs_member_read" ON public.startup_agent_pr_runs
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_agent_pr_runs_member_write" ON public.startup_agent_pr_runs
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_agent_pr_runs_member_update" ON public.startup_agent_pr_runs
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_agent_pr_run_events_member_read" ON public.startup_agent_pr_run_events
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_agent_pr_run_events_member_write" ON public.startup_agent_pr_run_events
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_agent_pr_runs_updated_at
  BEFORE UPDATE ON public.startup_agent_pr_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_agent_pr_runs IS 'One execution record for recommendation-driven PR workflow in startup workspaces.';
COMMENT ON TABLE public.startup_agent_pr_run_events IS 'Append-only status transitions for PR workflow execution records.';
