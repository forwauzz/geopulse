-- ADM/EVAL: admin report artifacts + offline quality eval runs (service_role writes only).

-- Deep audit markdown URL for eval tooling (R2 public URL).
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS markdown_url TEXT,
  ADD COLUMN IF NOT EXISTS report_payload_version INTEGER;

COMMENT ON COLUMN public.reports.markdown_url IS 'Public R2 URL for markdown export; used for offline evals.';
COMMENT ON COLUMN public.reports.report_payload_version IS 'DeepAuditReportPayload.version when the report was generated.';

-- Offline report quality evaluations (no PII in metrics JSON).
-- IF NOT EXISTS: safe when the table was already created (e.g. MCP apply + local db push).
CREATE TABLE IF NOT EXISTS public.report_eval_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES public.scans(id) ON DELETE SET NULL,
  rubric_version TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_score NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_eval_runs_created_at_idx ON public.report_eval_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS report_eval_runs_rubric_idx ON public.report_eval_runs (rubric_version);

COMMENT ON TABLE public.report_eval_runs IS 'Report quality eval runs; insert via service_role only. RLS enabled with no policies for anon/auth.';

ALTER TABLE public.report_eval_runs ENABLE ROW LEVEL SECURITY;
