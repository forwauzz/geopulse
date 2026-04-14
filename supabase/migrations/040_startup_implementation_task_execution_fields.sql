-- SAO-005
-- Extend startup implementation plan tasks so orchestrated execution can track
-- execution mode, dependencies, evidence requirements, and manual follow-up.

ALTER TABLE public.startup_implementation_plan_tasks
  ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'implementation',
  ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'approval_required',
  ADD COLUMN depends_on_task_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN acceptance_criteria TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN evidence_required TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN artifact_refs TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN blocked_reason TEXT,
  ADD COLUMN agent_role TEXT,
  ADD COLUMN manual_instructions TEXT;

ALTER TABLE public.startup_implementation_plan_tasks
  ADD CONSTRAINT startup_implementation_plan_tasks_task_kind_check CHECK (
    task_kind IN ('implementation', 'review', 'manual_action', 'approval', 'verification')
  ),
  ADD CONSTRAINT startup_implementation_plan_tasks_execution_mode_check CHECK (
    execution_mode IN ('auto', 'manual', 'approval_required')
  ),
  ADD CONSTRAINT startup_implementation_plan_tasks_agent_role_check CHECK (
    agent_role IS NULL OR agent_role IN (
      'orchestrator',
      'repo_review',
      'db_review',
      'risk_review',
      'execution_worker',
      'manual_operator',
      'founder_approval',
      'qa_verification'
    )
  );

CREATE INDEX startup_implementation_plan_tasks_execution_idx
  ON public.startup_implementation_plan_tasks (
    startup_workspace_id,
    execution_mode,
    status,
    created_at DESC
  );

COMMENT ON COLUMN public.startup_implementation_plan_tasks.task_kind IS 'Task classification for orchestrated startup audit execution.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.execution_mode IS 'Whether a task can run automatically, requires manual work, or waits on explicit approval.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.depends_on_task_ids IS 'Task IDs that must complete before this task can progress.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.acceptance_criteria IS 'Plain-language exit criteria for a task to count as complete.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.evidence_required IS 'Evidence artifacts or proof needed to validate the task.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.artifact_refs IS 'Linked artifact references such as markdown refs, URLs, or file paths relevant to the task.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.blocked_reason IS 'Latest blocker reason when a task is in blocked state.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.agent_role IS 'Assigned orchestration role expected to review or execute the task.';
COMMENT ON COLUMN public.startup_implementation_plan_tasks.manual_instructions IS 'Explicit operator instructions when execution mode is manual.';
