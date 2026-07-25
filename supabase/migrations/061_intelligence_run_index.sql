-- INT-004: append-oriented canonical run index.

CREATE TABLE public.intelligence_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  canonical_domain_id UUID REFERENCES public.intelligence_domains(id) ON DELETE SET NULL,
  canonical_page_id UUID REFERENCES public.intelligence_pages(id) ON DELETE SET NULL,
  lane_id UUID REFERENCES public.intelligence_measurement_lanes(id) ON DELETE SET NULL,
  window_id UUID REFERENCES public.intelligence_measurement_windows(id) ON DELETE SET NULL,
  parent_run_id UUID REFERENCES public.intelligence_runs(id) ON DELETE SET NULL,
  source_status TEXT,
  quality_state TEXT NOT NULL DEFAULT 'unknown',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ,
  provider TEXT,
  model_id TEXT,
  run_mode TEXT,
  versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_ref TEXT,
  tenant_type TEXT,
  tenant_id UUID,
  visibility TEXT NOT NULL DEFAULT 'internal',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_runs_source_unique UNIQUE (source_kind, source_id),
  CONSTRAINT intelligence_runs_visibility_check CHECK (visibility IN ('tenant', 'internal', 'shared')),
  CONSTRAINT intelligence_runs_tenant_shape_check CHECK (
    (visibility = 'tenant' AND tenant_type IS NOT NULL AND tenant_id IS NOT NULL)
    OR visibility <> 'tenant'
  )
);

CREATE TABLE public.intelligence_backfill_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backfill_key TEXT NOT NULL UNIQUE,
  contract_version TEXT NOT NULL,
  last_source_key TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  indexed_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  orphan_count INTEGER NOT NULL DEFAULT 0,
  source_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_backfill_checkpoints_status_check CHECK (
    status IN ('running', 'complete', 'failed', 'needs_review')
  )
);

CREATE INDEX intelligence_runs_domain_observed_idx
  ON public.intelligence_runs (canonical_domain_id, observed_at DESC);
CREATE INDEX intelligence_runs_lane_window_idx
  ON public.intelligence_runs (lane_id, window_id);
CREATE INDEX intelligence_runs_parent_idx
  ON public.intelligence_runs (parent_run_id);
CREATE INDEX intelligence_runs_quality_idx
  ON public.intelligence_runs (quality_state, source_kind);

CREATE TRIGGER intelligence_runs_updated_at
  BEFORE UPDATE ON public.intelligence_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_backfill_checkpoints_updated_at
  BEFORE UPDATE ON public.intelligence_backfill_checkpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.intelligence_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_backfill_checkpoints ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.intelligence_runs IS
  'Common execution envelope with reversible source pointers; source tables remain authoritative.';
COMMENT ON COLUMN public.intelligence_runs.source_snapshot IS
  'Hash of preserved source envelope fields used for non-mutation reconciliation.';
COMMENT ON TABLE public.intelligence_backfill_checkpoints IS
  'Restartable progress and reconciliation summaries for intelligence backfills.';
