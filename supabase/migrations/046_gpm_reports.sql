-- GPM-017
-- Persistent record for each generated GEO Performance Report PDF.
-- One row per platform run per window period per client config.
-- R2 key stored so the file can be retrieved even if the public URL changes.

CREATE TABLE public.gpm_reports (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id             UUID NOT NULL REFERENCES public.client_benchmark_configs(id) ON DELETE CASCADE,
  run_group_id          UUID NOT NULL REFERENCES public.benchmark_run_groups(id)     ON DELETE CASCADE,
  startup_workspace_id  UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL,
  agency_account_id     UUID REFERENCES public.agency_accounts(id)    ON DELETE SET NULL,
  platform              TEXT NOT NULL,
  window_date           TEXT NOT NULL,
  pdf_r2_key            TEXT,
  pdf_url               TEXT,
  report_payload_version TEXT NOT NULL DEFAULT '1',
  narrative_generated   BOOLEAN NOT NULL DEFAULT false,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gpm_reports_platform_check CHECK (
    platform IN ('chatgpt', 'gemini', 'perplexity')
  ),
  -- At most one workspace type
  CONSTRAINT gpm_reports_workspace_xor CHECK (
    (startup_workspace_id IS NOT NULL)::int + (agency_account_id IS NOT NULL)::int <= 1
  ),
  -- One report per config + platform + window
  CONSTRAINT gpm_reports_config_platform_window_unique UNIQUE (config_id, platform, window_date)
);

CREATE INDEX gpm_reports_config_created_at_idx
  ON public.gpm_reports (config_id, created_at DESC);

CREATE INDEX gpm_reports_run_group_idx
  ON public.gpm_reports (run_group_id);

CREATE INDEX gpm_reports_startup_workspace_idx
  ON public.gpm_reports (startup_workspace_id, created_at DESC)
  WHERE startup_workspace_id IS NOT NULL;

CREATE INDEX gpm_reports_agency_account_idx
  ON public.gpm_reports (agency_account_id, created_at DESC)
  WHERE agency_account_id IS NOT NULL;

ALTER TABLE public.gpm_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.gpm_reports IS 'Generated GEO Performance Report records — one per client config, platform, and window period.';
COMMENT ON COLUMN public.gpm_reports.pdf_r2_key IS 'R2 object key for the stored PDF; null if R2 is not configured.';
COMMENT ON COLUMN public.gpm_reports.pdf_url IS 'Public URL for the PDF if DEEP_AUDIT_R2_PUBLIC_BASE is set; null otherwise.';
COMMENT ON COLUMN public.gpm_reports.window_date IS 'ISO window identifier: YYYY-MM for monthly, YYYY-WNN for weekly/biweekly.';
COMMENT ON COLUMN public.gpm_reports.narrative_generated IS 'True when a Claude-generated executive narrative was included in this report.';
