-- BM-042
-- Narrow internal competitor/cohort benchmark storage.
-- Keeps cohort framing explicit without adding a second benchmark subsystem.

CREATE TABLE public.benchmark_cohorts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  query_set_id UUID NOT NULL REFERENCES public.benchmark_query_sets(id) ON DELETE RESTRICT,
  model_id TEXT NOT NULL,
  run_mode TEXT NOT NULL,
  vertical TEXT,
  benchmark_window_label TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_cohorts_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT benchmark_cohorts_run_mode_check CHECK (
    run_mode IN ('ungrounded_inference', 'grounded_site')
  )
);

CREATE TABLE public.benchmark_cohort_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cohort_id UUID NOT NULL REFERENCES public.benchmark_cohorts(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.benchmark_domains(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_cohort_members_role_check CHECK (
    role IN ('measured_customer', 'competitor')
  ),
  CONSTRAINT benchmark_cohort_members_unique UNIQUE (cohort_id, domain_id)
);

CREATE INDEX benchmark_cohorts_query_set_created_at_idx
  ON public.benchmark_cohorts (query_set_id, created_at DESC);

CREATE INDEX benchmark_cohorts_status_created_at_idx
  ON public.benchmark_cohorts (status, created_at DESC);

CREATE INDEX benchmark_cohort_members_domain_id_idx
  ON public.benchmark_cohort_members (domain_id);

CREATE INDEX benchmark_cohort_members_cohort_id_idx
  ON public.benchmark_cohort_members (cohort_id);

ALTER TABLE public.benchmark_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_cohort_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.benchmark_cohorts IS 'Internal benchmark cohort definitions with an explicit comparison frame; service-role only.';
COMMENT ON TABLE public.benchmark_cohort_members IS 'Domain membership and role within an internal benchmark cohort; service-role only.';
COMMENT ON COLUMN public.benchmark_cohorts.model_id IS 'Single-model lane identifier frozen for this cohort frame.';
COMMENT ON COLUMN public.benchmark_cohorts.run_mode IS 'Frozen run mode for the cohort comparison frame.';
COMMENT ON COLUMN public.benchmark_cohort_members.role IS 'Explicit comparative role for the domain inside the cohort.';
