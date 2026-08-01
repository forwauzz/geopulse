-- Agency report v2: one canonical multi-engine artifact per measurement snapshot.
-- Existing per-engine v1 rows remain readable; new generation writes platform='combined'.

ALTER TABLE public.gpm_reports
  DROP CONSTRAINT IF EXISTS gpm_reports_platform_check;

ALTER TABLE public.gpm_reports
  ADD CONSTRAINT gpm_reports_platform_check CHECK (
    platform IN ('chatgpt', 'gemini', 'perplexity', 'combined')
  );

ALTER TABLE public.gpm_reports
  ADD COLUMN IF NOT EXISTS agency_client_id UUID
  REFERENCES public.agency_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gpm_reports_agency_client_generated_at_idx
  ON public.gpm_reports (agency_client_id, generated_at DESC)
  WHERE agency_client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.report_view_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES public.gpm_reports(id) ON DELETE CASCADE,
  agency_client_id UUID REFERENCES public.agency_clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT report_view_events_event_type_check CHECK (event_type IN ('view', 'download'))
);

CREATE INDEX IF NOT EXISTS report_view_events_report_occurred_at_idx
  ON public.report_view_events (report_id, occurred_at DESC);

ALTER TABLE public.report_view_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.report_view_events IS
  'Service-role-only evidence that a revocable client report link was viewed or downloaded.';
COMMENT ON COLUMN public.gpm_reports.agency_client_id IS
  'Direct ownership link used to authorize report viewing and private R2 downloads.';
COMMENT ON COLUMN public.gpm_reports.pdf_url IS
  'Legacy public artifact URL. Agency report v2 rows leave this null and use authenticated routes.';
