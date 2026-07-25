-- INT-003: versioned measurement lanes and scheduled windows.

CREATE TABLE public.intelligence_measurement_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  protocol_version TEXT NOT NULL,
  frame_kind TEXT NOT NULL,
  vertical TEXT NOT NULL,
  subvertical TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  run_mode TEXT NOT NULL,
  protocol JSONB NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'verified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_measurement_lanes_frame_check CHECK (
    frame_kind IN ('broad_vertical', 'business_counsel', 'startup_pilot', 'domain_specific', 'user_prompt', 'legacy_unknown')
  ),
  CONSTRAINT intelligence_measurement_lanes_review_check CHECK (
    review_state IN ('verified', 'legacy_unknown', 'needs_review', 'retired')
  )
);

CREATE TABLE public.intelligence_measurement_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lane_id UUID NOT NULL REFERENCES public.intelligence_measurement_lanes(id) ON DELETE CASCADE,
  window_key TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expected_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_state TEXT NOT NULL DEFAULT 'unknown',
  source_schedule_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_measurement_windows_quality_check CHECK (
    quality_state IN ('unknown', 'running', 'complete', 'partial', 'failed', 'quarantined')
  ),
  CONSTRAINT intelligence_measurement_windows_lane_key_unique UNIQUE (lane_id, window_key)
);

CREATE TABLE public.intelligence_measurement_run_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  lane_id UUID NOT NULL REFERENCES public.intelligence_measurement_lanes(id) ON DELETE CASCADE,
  window_id UUID REFERENCES public.intelligence_measurement_windows(id) ON DELETE SET NULL,
  mapping_status TEXT NOT NULL DEFAULT 'mapped',
  mapping_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_measurement_run_mappings_status_check CHECK (
    mapping_status IN ('mapped', 'legacy_unknown', 'needs_review')
  ),
  CONSTRAINT intelligence_measurement_run_mappings_source_unique UNIQUE (source_kind, source_id)
);

CREATE INDEX intelligence_measurement_lanes_frame_idx
  ON public.intelligence_measurement_lanes (frame_kind, vertical, subvertical);
CREATE INDEX intelligence_measurement_windows_schedule_idx
  ON public.intelligence_measurement_windows (scheduled_for DESC);
CREATE INDEX intelligence_measurement_run_mappings_lane_idx
  ON public.intelligence_measurement_run_mappings (lane_id, source_kind);

CREATE TRIGGER intelligence_measurement_lanes_updated_at
  BEFORE UPDATE ON public.intelligence_measurement_lanes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_measurement_windows_updated_at
  BEFORE UPDATE ON public.intelligence_measurement_windows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_measurement_run_mappings_updated_at
  BEFORE UPDATE ON public.intelligence_measurement_run_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.intelligence_measurement_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_measurement_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_measurement_run_mappings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.intelligence_measurement_lanes IS
  'Immutable-compatible protocol fingerprints for benchmark, scan, and eval measurements.';
COMMENT ON TABLE public.intelligence_measurement_windows IS
  'One scheduled occurrence of a lane with expected versus observed coverage.';
COMMENT ON TABLE public.intelligence_measurement_run_mappings IS
  'Additive mapping from operational runs to a versioned lane/window.';
