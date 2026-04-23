-- GPM-014
-- Add workspace scope FK columns to benchmark_run_groups so client runs can be
-- filtered and queried per startup workspace or agency account without leaking
-- across accounts. Both columns are nullable so existing internal benchmark
-- runs (which have no workspace affiliation) are unaffected.

ALTER TABLE public.benchmark_run_groups
  ADD COLUMN startup_workspace_id UUID REFERENCES public.startup_workspaces(id) ON DELETE SET NULL,
  ADD COLUMN agency_account_id    UUID REFERENCES public.agency_accounts(id)    ON DELETE SET NULL;

-- At most one workspace type may be set (both null is allowed for internal runs)
ALTER TABLE public.benchmark_run_groups
  ADD CONSTRAINT benchmark_run_groups_workspace_xor CHECK (
    (startup_workspace_id IS NOT NULL)::int + (agency_account_id IS NOT NULL)::int <= 1
  );

CREATE INDEX benchmark_run_groups_startup_workspace_created_at_idx
  ON public.benchmark_run_groups (startup_workspace_id, created_at DESC)
  WHERE startup_workspace_id IS NOT NULL;

CREATE INDEX benchmark_run_groups_agency_account_created_at_idx
  ON public.benchmark_run_groups (agency_account_id, created_at DESC)
  WHERE agency_account_id IS NOT NULL;

COMMENT ON COLUMN public.benchmark_run_groups.startup_workspace_id IS 'Set for GPM client runs scoped to a startup workspace; null for internal benchmark runs.';
COMMENT ON COLUMN public.benchmark_run_groups.agency_account_id    IS 'Set for GPM client runs scoped to an agency account; null for internal benchmark runs.';
