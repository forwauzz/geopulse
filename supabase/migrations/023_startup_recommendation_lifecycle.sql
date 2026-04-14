-- SD-007
-- Startup recommendation lifecycle model + markdown-audit lineage mapping.

CREATE TYPE public.startup_recommendation_status AS ENUM (
  'suggested',
  'approved',
  'in_progress',
  'shipped',
  'validated',
  'failed'
);

CREATE TABLE public.startup_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL DEFAULT 'markdown_audit',
  source_ref TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  team_lane TEXT NOT NULL DEFAULT 'dev',
  priority TEXT NOT NULL DEFAULT 'medium',
  status public.startup_recommendation_status NOT NULL DEFAULT 'suggested',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_reason TEXT,
  status_updated_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  confidence NUMERIC(4, 3),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT startup_recommendations_source_kind_check CHECK (
    source_kind IN ('markdown_audit', 'manual', 'agent')
  ),
  CONSTRAINT startup_recommendations_team_lane_check CHECK (
    team_lane IN ('founder', 'dev', 'content', 'ops', 'cross_functional')
  ),
  CONSTRAINT startup_recommendations_priority_check CHECK (
    priority IN ('low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT startup_recommendations_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE TABLE public.startup_recommendation_status_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recommendation_id UUID NOT NULL REFERENCES public.startup_recommendations(id) ON DELETE CASCADE,
  startup_workspace_id UUID NOT NULL REFERENCES public.startup_workspaces(id) ON DELETE CASCADE,
  from_status public.startup_recommendation_status,
  to_status public.startup_recommendation_status NOT NULL,
  changed_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX startup_recommendations_workspace_status_created_at_idx
  ON public.startup_recommendations (startup_workspace_id, status, created_at DESC);

CREATE INDEX startup_recommendations_workspace_scan_idx
  ON public.startup_recommendations (startup_workspace_id, scan_id);

CREATE INDEX startup_recommendations_workspace_report_idx
  ON public.startup_recommendations (startup_workspace_id, report_id);

CREATE INDEX startup_recommendations_source_idx
  ON public.startup_recommendations (source_kind, source_ref);

CREATE INDEX startup_recommendation_status_events_workspace_created_at_idx
  ON public.startup_recommendation_status_events (startup_workspace_id, created_at DESC);

CREATE INDEX startup_recommendation_status_events_recommendation_created_at_idx
  ON public.startup_recommendation_status_events (recommendation_id, created_at DESC);

ALTER TABLE public.startup_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.startup_recommendation_status_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "startup_recommendations_member_read" ON public.startup_recommendations
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_recommendations_member_write" ON public.startup_recommendations
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_recommendations_member_update" ON public.startup_recommendations
  FOR UPDATE
  USING (public.is_startup_workspace_member(startup_workspace_id))
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_recommendation_events_member_read" ON public.startup_recommendation_status_events
  FOR SELECT
  USING (public.is_startup_workspace_member(startup_workspace_id));

CREATE POLICY "startup_recommendation_events_member_write" ON public.startup_recommendation_status_events
  FOR INSERT
  WITH CHECK (public.is_startup_workspace_member(startup_workspace_id));

CREATE TRIGGER startup_recommendations_updated_at
  BEFORE UPDATE ON public.startup_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.startup_recommendations IS 'Startup workspace implementation recommendations with lifecycle state and scan/report lineage.';
COMMENT ON TABLE public.startup_recommendation_status_events IS 'Append-only lifecycle transition history for startup recommendations.';
COMMENT ON COLUMN public.startup_recommendations.source_ref IS 'External source identifier, including markdown audit artifact key.';
