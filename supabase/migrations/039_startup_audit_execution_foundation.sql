-- SAO-002
-- Startup audit execution foundation: one durable audit-to-action record plus append-only status events.

CREATE TABLE public.startup_audit_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL DEFAULT 'markdown_audit',
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  summary TEXT,
  error_message TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_audit_executions_source_kind_check CHECK (
    source_kind IN ('markdown_audit', 'manual', 'agent')
  ),
  CONSTRAINT startup_audit_executions_status_check CHECK (
    status IN ('received', 'planning', 'plan_ready', 'executing', 'waiting_manual', 'completed', 'failed', 'cancelled')
  )
);

CREATE TABLE public.startup_audit_execution_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES public.startup_audit_executions(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_audit_execution_events_from_status_check CHECK (
    from_status IS NULL
    OR from_status IN ('received', 'planning', 'plan_ready', 'executing', 'waiting_manual', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT startup_audit_execution_events_to_status_check CHECK (
    to_status IN ('received', 'planning', 'plan_ready', 'executing', 'waiting_manual', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX startup_audit_executions_workspace_created_at_idx
  ON public.startup_audit_executions (startup_workspace_id, created_at DESC);

CREATE INDEX startup_audit_executions_workspace_status_idx
  ON public.startup_audit_executions (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_audit_executions_source_idx
  ON public.startup_audit_executions (source_kind, source_ref);

CREATE INDEX startup_audit_execution_events_workspace_created_at_idx
  ON public.startup_audit_execution_events (startup_workspace_id, created_at DESC);

CREATE INDEX startup_audit_execution_events_execution_created_at_idx
  ON public.startup_audit_execution_events (execution_id, created_at DESC);

ALTER TABLE public.startup_audit_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_audit_execution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_audit_executions_member_read" ON public.startup_audit_executions
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_audit_executions_member_write" ON public.startup_audit_executions
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_audit_executions_member_update" ON public.startup_audit_executions
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_audit_execution_events_member_read" ON public.startup_audit_execution_events
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_audit_execution_events_member_write" ON public.startup_audit_execution_events
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_audit_executions_updated_at
  BEFORE UPDATE ON public.startup_audit_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_audit_executions IS 'Durable startup audit-to-action execution records spanning planning, approval, execution, and completion.';
COMMENT ON TABLE public.startup_audit_execution_events IS 'Append-only status history for startup audit executions.';
