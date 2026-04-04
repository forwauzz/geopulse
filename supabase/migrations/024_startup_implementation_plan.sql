-- SD-008
-- Markdown-audit to startup implementation-plan model.

CREATE TABLE public.startup_implementation_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL DEFAULT 'markdown_audit',
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_implementation_plans_source_kind_check CHECK (
    source_kind IN ('markdown_audit', 'manual', 'agent')
  ),
  CONSTRAINT startup_implementation_plans_status_check CHECK (
    status IN ('draft', 'ready', 'archived')
  )
);

CREATE TABLE public.startup_implementation_plan_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.startup_implementation_plans(id) ON DELETE CASCADE,
  recommendation_id UUID REFERENCES public.startup_recommendations(id) ON DELETE SET NULL,
  team_lane TEXT NOT NULL DEFAULT 'dev',
  title TEXT NOT NULL,
  detail TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  confidence NUMERIC(4, 3),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  owner_label TEXT,
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_implementation_plan_tasks_team_lane_check CHECK (
    team_lane IN ('founder', 'dev', 'content', 'ops', 'cross_functional')
  ),
  CONSTRAINT startup_implementation_plan_tasks_priority_check CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT startup_implementation_plan_tasks_status_check CHECK (
    status IN ('todo', 'in_progress', 'blocked', 'done', 'failed')
  ),
  CONSTRAINT startup_implementation_plan_tasks_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX startup_implementation_plans_workspace_created_at_idx
  ON public.startup_implementation_plans (startup_workspace_id, created_at DESC);

CREATE INDEX startup_implementation_plans_source_idx
  ON public.startup_implementation_plans (source_kind, source_ref);

CREATE INDEX startup_implementation_plan_tasks_plan_sort_idx
  ON public.startup_implementation_plan_tasks (plan_id, sort_order, created_at ASC);

CREATE INDEX startup_implementation_plan_tasks_workspace_lane_idx
  ON public.startup_implementation_plan_tasks (startup_workspace_id, team_lane, status, created_at DESC);

CREATE INDEX startup_implementation_plan_tasks_recommendation_idx
  ON public.startup_implementation_plan_tasks (recommendation_id);

ALTER TABLE public.startup_implementation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_implementation_plan_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_implementation_plans_member_read" ON public.startup_implementation_plans
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_implementation_plans_member_write" ON public.startup_implementation_plans
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_implementation_plans_member_update" ON public.startup_implementation_plans
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_implementation_plan_tasks_member_read" ON public.startup_implementation_plan_tasks
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_implementation_plan_tasks_member_write" ON public.startup_implementation_plan_tasks
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_implementation_plan_tasks_member_update" ON public.startup_implementation_plan_tasks
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_implementation_plans_updated_at
  BEFORE UPDATE ON public.startup_implementation_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER startup_implementation_plan_tasks_updated_at
  BEFORE UPDATE ON public.startup_implementation_plan_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_implementation_plans IS 'Workspace-level generated implementation plans sourced from markdown audits or manual flows.';
COMMENT ON TABLE public.startup_implementation_plan_tasks IS 'Implementation tasks grouped into founder/dev/content/ops lanes with confidence and evidence metadata.';
