-- Eval analytics metadata for site/history views in admin.
-- Service-role writers only; tables already have RLS enabled with no anon/auth policies.

ALTER TABLE public.report_eval_runs
  ADD COLUMN IF NOT EXISTS framework TEXT NOT NULL DEFAULT 'report_smoke',
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS site_url TEXT,
  ADD COLUMN IF NOT EXISTS prompt_set_name TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS report_eval_runs_framework_created_at_idx
  ON public.report_eval_runs (framework, created_at DESC);

CREATE INDEX IF NOT EXISTS report_eval_runs_domain_created_at_idx
  ON public.report_eval_runs (domain, created_at DESC);

COMMENT ON COLUMN public.report_eval_runs.framework IS 'Eval framework identifier, e.g. promptfoo_report.';
COMMENT ON COLUMN public.report_eval_runs.domain IS 'Normalized site domain used for grouping repeated eval runs.';
COMMENT ON COLUMN public.report_eval_runs.site_url IS 'Canonical site URL used for grouping repeated eval runs.';
COMMENT ON COLUMN public.report_eval_runs.prompt_set_name IS 'Prompt suite name within the framework.';
COMMENT ON COLUMN public.report_eval_runs.metadata IS 'Framework-specific metadata for admin analytics.';

ALTER TABLE public.retrieval_eval_runs
  ADD COLUMN IF NOT EXISTS framework TEXT NOT NULL DEFAULT 'retrieval_foundation',
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS site_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS retrieval_eval_runs_framework_created_at_idx
  ON public.retrieval_eval_runs (framework, created_at DESC);

CREATE INDEX IF NOT EXISTS retrieval_eval_runs_domain_created_at_idx
  ON public.retrieval_eval_runs (domain, created_at DESC);

COMMENT ON COLUMN public.retrieval_eval_runs.framework IS 'Eval framework identifier, e.g. promptfoo_retrieval or ragas_retrieval.';
COMMENT ON COLUMN public.retrieval_eval_runs.domain IS 'Normalized site domain used for grouping repeated eval runs.';
COMMENT ON COLUMN public.retrieval_eval_runs.site_url IS 'Canonical site URL used for grouping repeated eval runs.';
COMMENT ON COLUMN public.retrieval_eval_runs.metadata IS 'Framework-specific metadata for admin analytics.';
