-- Migration 051: recurring per-user site audits (Phase 3).
--
-- A granted user can schedule their site to be re-audited automatically. Each schedule stores its
-- own URL (workspace domains are often unset), a cadence, and the next due time. A daily worker
-- cron runs due schedules and persists a normal scan tagged run_source='recurring'.

-- Allow the recurring run source on scans.
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_run_source_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_run_source_check CHECK (
    run_source IN (
      'public_self_serve',
      'agency_dashboard',
      'startup_dashboard',
      'internal_benchmark',
      'admin_manual',
      'recurring'
    )
  );

CREATE TABLE IF NOT EXISTS public.recurring_audit_schedules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  startup_workspace_id  UUID        REFERENCES public.startup_workspaces(id) ON DELETE SET NULL,
  url                   TEXT        NOT NULL,
  cadence               TEXT        NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily', 'weekly')),
  enabled               BOOLEAN     NOT NULL DEFAULT true,
  last_run_at           TIMESTAMPTZ,
  next_run_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error            TEXT,
  created_by            UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

COMMENT ON TABLE public.recurring_audit_schedules IS
  'Per-user recurring site audit schedules (Phase 3). One per user. Service-role only; the '
  'dashboard control is gated on the user''s automation feature grant.';

CREATE INDEX recurring_audit_schedules_due_idx
  ON public.recurring_audit_schedules (next_run_at)
  WHERE enabled = true;

ALTER TABLE public.recurring_audit_schedules ENABLE ROW LEVEL SECURITY;
