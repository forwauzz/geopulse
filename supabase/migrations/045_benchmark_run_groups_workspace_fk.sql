-- GPM-014
-- Add workspace scope FK columns to benchmark_run_groups so client runs can be
-- filtered and queried per startup workspace or agency account without leaking
-- across accounts. Both columns are nullable so existing internal benchmark
-- runs (which have no workspace affiliation) are unaffected.
-- Written idempotently (IF NOT EXISTS) so re-running in the SQL editor is safe.

ALTER TABLE public.benchmark_run_groups
  ADD COLUMN IF NOT EXISTS startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL;

ALTER TABLE public.benchmark_run_groups
  ADD COLUMN IF NOT EXISTS agency_account_id UUID REFERENCES public.agency_accounts(id) ON DELETE SET NULL;

-- At most one workspace type may be set (both null is allowed for internal runs)
DO $$ BEGIN
  ALTER TABLE public.benchmark_run_groups
    ADD CONSTRAINT benchmark_run_groups_workspace_xor CHECK (
      (startup_workspace_id IS NOT NULL)::int + (agency_account_id IS NOT NULL)::int <= 1
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS benchmark_run_groups_startup_workspace_created_at_idx
  ON public.benchmark_run_groups (startup_workspace_id, created_at DESC)
  WHERE startup_workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS benchmark_run_groups_agency_account_created_at_idx
  ON public.benchmark_run_groups (agency_account_id, created_at DESC)
  WHERE agency_account_id IS NOT NULL;

COMMENT ON COLUMN public.benchmark_run_groups.startup_workspace_id IS 'Set for GPM client runs scoped to a startup workspace; null for internal benchmark runs.';
COMMENT ON COLUMN public.benchmark_run_groups.agency_account_id    IS 'Set for GPM client runs scoped to an agency account; null for internal benchmark runs.';
