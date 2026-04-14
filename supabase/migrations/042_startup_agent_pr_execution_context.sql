-- SAO-012
-- Extend startup PR workflow records so runs can be linked to audit executions and
-- bounded implementation-plan task groups instead of recommendation rows only.

ALTER TABLE public.startup_agent_pr_runs
  ALTER COLUMN recommendation_id DROP NOT NULL;

ALTER TABLE public.startup_agent_pr_runs
  ADD COLUMN execution_id UUID REFERENCES public.startup_audit_executions(id) ON DELETE SET NULL,
  ADD COLUMN plan_task_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.startup_agent_pr_run_events
  ALTER COLUMN recommendation_id DROP NOT NULL;

ALTER TABLE public.startup_agent_pr_run_events
  ADD COLUMN execution_id UUID REFERENCES public.startup_audit_executions(id) ON DELETE SET NULL,
  ADD COLUMN plan_task_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX startup_agent_pr_runs_execution_idx
  ON public.startup_agent_pr_runs (execution_id, created_at DESC);

COMMENT ON COLUMN public.startup_agent_pr_runs.execution_id IS 'Optional startup audit execution linked to this PR run.';
COMMENT ON COLUMN public.startup_agent_pr_runs.plan_task_ids IS 'Optional bounded task group from the latest startup implementation plan.';
COMMENT ON COLUMN public.startup_agent_pr_run_events.execution_id IS 'Optional startup audit execution linked to this PR run event.';
COMMENT ON COLUMN public.startup_agent_pr_run_events.plan_task_ids IS 'Optional bounded task group echoed into PR run events.';
