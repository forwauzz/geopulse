-- SL-004
-- Startup Slack OAuth session state table for connect callback validation.

CREATE TABLE public.startup_slack_install_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'slack',
  state_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  redirect_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_slack_install_sessions_provider_check CHECK (provider IN ('slack')),
  CONSTRAINT startup_slack_install_sessions_status_check CHECK (
    status IN ('pending', 'consumed', 'expired', 'cancelled')
  )
);

CREATE INDEX startup_slack_sessions_workspace_status_idx
  ON public.startup_slack_install_sessions (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_slack_sessions_expires_idx
  ON public.startup_slack_install_sessions (expires_at);

ALTER TABLE public.startup_slack_install_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_slack_sessions_member_read" ON public.startup_slack_install_sessions
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_sessions_member_write" ON public.startup_slack_install_sessions
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_sessions_member_update" ON public.startup_slack_install_sessions
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_slack_sessions_updated_at
  BEFORE UPDATE ON public.startup_slack_install_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_slack_install_sessions IS 'Short-lived callback state records for Slack install/connect flow.';
