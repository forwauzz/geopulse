-- INT-006: replayable derived quality, eligibility, quarantine, and alert records.

CREATE TABLE public.intelligence_quality_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version TEXT NOT NULL UNIQUE,
  definition JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ
);

INSERT INTO public.intelligence_quality_policies (policy_version, definition, is_active)
VALUES (
  'quality-policy-v1',
  '{
    "staleRunningHours": 6,
    "validStates": ["valid", "valid_partial"],
    "requiredBenchmarkModes": ["grounded", "ungrounded"],
    "wholeCohortMinimumRuns": 3,
    "citationRateDiscontinuityThreshold": 0.75,
    "issue104Relationship": "classification only; does not repair cron-tail starvation"
  }'::jsonb,
  true
);

CREATE TABLE public.intelligence_run_quality_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_classification_id TEXT NOT NULL UNIQUE,
  policy_version TEXT NOT NULL REFERENCES public.intelligence_quality_policies(policy_version),
  run_id UUID REFERENCES public.intelligence_runs(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  original_status TEXT,
  quality_state TEXT NOT NULL,
  reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_hours NUMERIC,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_quality_state_check CHECK (
    quality_state IN (
      'valid', 'valid_partial', 'incomplete', 'provider_failure', 'orphaned',
      'parser_suspect', 'configuration_mismatch', 'duplicate', 'quarantined'
    )
  )
);

CREATE TABLE public.intelligence_window_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version TEXT NOT NULL REFERENCES public.intelligence_quality_policies(policy_version),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  lane_id UUID REFERENCES public.intelligence_measurement_lanes(id) ON DELETE SET NULL,
  window_id UUID REFERENCES public.intelligence_measurement_windows(id) ON DELETE SET NULL,
  eligible BOOLEAN NOT NULL,
  coverage_ratio NUMERIC NOT NULL,
  expected_cell_count INTEGER NOT NULL,
  valid_cell_count INTEGER NOT NULL,
  missing_cells JSONB NOT NULL DEFAULT '[]'::jsonb,
  anomaly_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot TEXT NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_window_assessment_unique
    UNIQUE (policy_version, source_kind, source_id, source_snapshot),
  CONSTRAINT intelligence_window_coverage_check CHECK (
    coverage_ratio >= 0 AND coverage_ratio <= 1
  )
);

CREATE TABLE public.intelligence_quarantine_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.intelligence_runs(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_quarantine_action_check CHECK (
    action IN ('quarantine', 'release', 'validate')
  ),
  CONSTRAINT intelligence_quarantine_actor_check CHECK (
    actor_type IN ('policy', 'operator', 'system')
  )
);

CREATE TABLE public.intelligence_quality_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version TEXT NOT NULL REFERENCES public.intelligence_quality_policies(policy_version),
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT,
  reason_code TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_quality_alert_unique UNIQUE (policy_version, alert_key, observed_at),
  CONSTRAINT intelligence_quality_alert_severity_check CHECK (
    severity IN ('info', 'warning', 'critical')
  )
);

CREATE INDEX intelligence_run_quality_source_idx
  ON public.intelligence_run_quality_classifications (source_kind, source_id, classified_at DESC);
CREATE INDEX intelligence_run_quality_state_idx
  ON public.intelligence_run_quality_classifications (quality_state, classified_at DESC);
CREATE INDEX intelligence_window_quality_eligible_idx
  ON public.intelligence_window_quality_assessments (eligible, assessed_at DESC);
CREATE INDEX intelligence_quarantine_source_idx
  ON public.intelligence_quarantine_events (source_kind, source_id, created_at DESC);
CREATE INDEX intelligence_quality_alert_open_idx
  ON public.intelligence_quality_alerts (severity, created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.intelligence_quality_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_run_quality_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_window_quality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_quarantine_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_quality_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.intelligence_run_quality_classifications IS
  'Append-only derived quality; original source status is preserved verbatim.';
COMMENT ON TABLE public.intelligence_window_quality_assessments IS
  'Replayable coverage and anomaly gate. Only eligible rows may feed analytical marts.';
COMMENT ON TABLE public.intelligence_quarantine_events IS
  'Append-only operator/policy quarantine, release, and validation audit trail.';
COMMENT ON TABLE public.intelligence_quality_alerts IS
  'Operator-facing stale, incomplete, provider, parser, and cohort anomaly alerts.';
