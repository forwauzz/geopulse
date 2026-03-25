-- DA-001: Deep audit multi-page storage (scan_runs + scan_pages) with RLS.
-- Service role writes from Workers; authenticated users read via owning scan.

CREATE TABLE public.scan_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'deep' CHECK (mode = 'deep'),
  config JSONB NOT NULL DEFAULT '{"page_limit": 10}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  coverage_summary JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scan_runs_one_per_scan UNIQUE (scan_id)
);

CREATE INDEX scan_runs_scan_id_idx ON public.scan_runs (scan_id);

CREATE TABLE public.scan_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.scan_runs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  canonical_url TEXT,
  parent_id UUID REFERENCES public.scan_pages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fetched', 'skipped', 'error')),
  discovered_by TEXT CHECK (discovered_by IS NULL OR discovered_by IN ('seed', 'sitemap', 'link')),
  http_status INTEGER,
  fetch_ms INTEGER,
  content_type TEXT,
  blocked_by_robots BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  issues_json JSONB,
  score INTEGER,
  letter_grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scan_pages_run_url_unique UNIQUE (run_id, normalized_url)
);

CREATE INDEX scan_pages_run_id_idx ON public.scan_pages (run_id);

ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_runs_select_own_scan" ON public.scan_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scans s
      WHERE s.id = scan_runs.scan_id
        AND s.user_id IS NOT NULL
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "scan_pages_select_via_run" ON public.scan_pages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scan_runs sr
      INNER JOIN public.scans s ON s.id = sr.scan_id
      WHERE sr.id = scan_pages.run_id
        AND s.user_id IS NOT NULL
        AND s.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.scan_runs IS 'Paid deep audit run metadata (one row per paid scan); written by service role';
COMMENT ON TABLE public.scan_pages IS 'Per-URL deep audit results; written by service role';
