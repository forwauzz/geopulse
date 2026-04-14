-- SL-003
-- Minimal startup Slack integration schema foundation.

CREATE TABLE public.startup_slack_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'slack',
  slack_team_id TEXT NOT NULL,
  slack_team_name TEXT,
  slack_team_domain TEXT,
  bot_user_id TEXT,
  bot_access_token TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  installed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_slack_installations_provider_check CHECK (provider IN ('slack')),
  CONSTRAINT startup_slack_installations_status_check CHECK (status IN ('active', 'disconnected')),
  CONSTRAINT startup_slack_installations_workspace_team_unique UNIQUE (startup_workspace_id, provider, slack_team_id)
);

CREATE TABLE public.startup_slack_destinations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  installation_id UUID NOT NULL REFERENCES public.startup_slack_installations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_slack_destinations_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT startup_slack_destinations_workspace_install_channel_unique UNIQUE (
    startup_workspace_id,
    installation_id,
    channel_id
  )
);

CREATE UNIQUE INDEX startup_slack_destinations_default_per_workspace_idx
  ON public.startup_slack_destinations (startup_workspace_id)
  WHERE is_default = true AND status = 'active';

CREATE TABLE public.startup_slack_delivery_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  installation_id UUID REFERENCES public.startup_slack_installations(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES public.startup_slack_destinations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  sent_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_slack_delivery_events_event_type_check CHECK (
    event_type IN ('new_audit_ready', 'plan_ready')
  ),
  CONSTRAINT startup_slack_delivery_events_status_check CHECK (
    status IN ('queued', 'sent', 'failed', 'skipped')
  )
);

CREATE INDEX startup_slack_installations_workspace_created_at_idx
  ON public.startup_slack_installations (startup_workspace_id, created_at DESC);

CREATE INDEX startup_slack_destinations_workspace_created_at_idx
  ON public.startup_slack_destinations (startup_workspace_id, created_at DESC);

CREATE INDEX startup_slack_delivery_events_workspace_created_at_idx
  ON public.startup_slack_delivery_events (startup_workspace_id, created_at DESC);

CREATE INDEX startup_slack_delivery_events_status_created_at_idx
  ON public.startup_slack_delivery_events (status, created_at DESC);

CREATE TRIGGER startup_slack_installations_updated_at
  BEFORE UPDATE ON public.startup_slack_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_slack_destinations_updated_at
  BEFORE UPDATE ON public.startup_slack_destinations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_slack_delivery_events_updated_at
  BEFORE UPDATE ON public.startup_slack_delivery_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.startup_slack_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_slack_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_slack_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_slack_installations_member_read" ON public.startup_slack_installations
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_installations_member_write" ON public.startup_slack_installations
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_installations_member_update" ON public.startup_slack_installations
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_destinations_member_read" ON public.startup_slack_destinations
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_destinations_member_write" ON public.startup_slack_destinations
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_destinations_member_update" ON public.startup_slack_destinations
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_destinations_member_delete" ON public.startup_slack_destinations
  FOR DELETE
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_delivery_events_member_read" ON public.startup_slack_delivery_events
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_delivery_events_member_write" ON public.startup_slack_delivery_events
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_slack_delivery_events_member_update" ON public.startup_slack_delivery_events
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

COMMENT ON TABLE public.startup_slack_installations IS 'Slack workspace installs connected to startup workspaces.';
COMMENT ON TABLE public.startup_slack_destinations IS 'Workspace/channel destination presets for startup Slack delivery.';
COMMENT ON TABLE public.startup_slack_delivery_events IS 'Per-send Slack delivery status log for startup report events.';
