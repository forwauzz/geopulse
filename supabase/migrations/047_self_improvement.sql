-- Migration 047: Admin-only autonomous self-improvement (OSS-REFACTOR-PLAN.md Loop 5a)
--
-- getgeopulse.com audits itself daily → emails the report to the admin → (later, with an
-- external headless coding-agent runtime) drafts + ships small improvements under self-gates.
--
-- This migration adds the CONTROL PLANE only:
--   1. self_improvement_runs      — ledger of each self-audit / self-improvement run.
--   2. self_improvement_settings  — single-row runtime switch: enabled + kill switch + recipient.
--   3. user_autonomy_flags        — per-user "no-human-in-the-loop" opt-in (admin-only for now,
--                                   modelled on platform_admin_users so it can be offered to
--                                   opted-in users later without schema change).
--
-- Security: all three tables enable RLS with NO policies — service-role only, like
-- platform_admin_users (036) and app_logs (013). App code uses the service-role client.

-- ── 1. Run ledger ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.self_improvement_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source  TEXT        NOT NULL DEFAULT 'worker_cron',   -- worker_cron | admin_manual | ci
  target_url      TEXT        NOT NULL,
  -- lifecycle: audited → (planning → implementing → reviewing → shipped) | skipped | failed
  status          TEXT        NOT NULL DEFAULT 'audited'
                    CHECK (status IN ('audited','skipped','planning','implementing','reviewing','shipped','failed')),
  scan_id         UUID        REFERENCES public.scans(id) ON DELETE SET NULL,
  score           INTEGER,
  letter_grade    TEXT,
  -- the actionable improvement plan (top failed checks → suggested fixes) + any agent output
  summary         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  pr_url          TEXT,
  deploy_version  TEXT,
  emailed_to      TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.self_improvement_runs IS
  'Ledger of autonomous self-improvement runs for getgeopulse.com (Loop 5a). Service-role only.';

CREATE INDEX self_improvement_runs_created_at_idx ON public.self_improvement_runs (created_at DESC);
CREATE INDEX self_improvement_runs_status_idx     ON public.self_improvement_runs (status);

ALTER TABLE public.self_improvement_runs ENABLE ROW LEVEL SECURITY;

-- ── 2. Runtime settings / kill switch (single row, id = 1) ───────────────────────
CREATE TABLE IF NOT EXISTS public.self_improvement_settings (
  id                INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- master enable for the daily self-audit + email loop. Off until explicitly turned on.
  enabled           BOOLEAN     NOT NULL DEFAULT false,
  -- hard stop: when true, NOTHING runs regardless of `enabled` or env flags.
  kill_switch       BOOLEAN     NOT NULL DEFAULT false,
  -- when true, the autonomous coding/ship step may run unattended (needs an admin with an
  -- autonomy flag + the external agent runtime). When false, runs stop after audit+email.
  autonomous_ship_enabled BOOLEAN NOT NULL DEFAULT false,
  report_recipient  TEXT,
  updated_by        UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.self_improvement_settings IS
  'Single-row runtime control for Loop 5a: enable, kill switch, autonomous-ship gate, recipient. '
  'Kill switch overrides everything. Service-role only.';

INSERT INTO public.self_improvement_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.self_improvement_settings ENABLE ROW LEVEL SECURITY;

-- ── 3. Per-user autonomy opt-in ("no human in the loop") ─────────────────────────
-- Admin-only for now (only platform admins are ever granted), but keyed by user_id so the
-- capability can be offered to opted-in users later without a schema change.
CREATE TABLE IF NOT EXISTS public.user_autonomy_flags (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  autonomy_enabled  BOOLEAN     NOT NULL DEFAULT false,
  granted_by        UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_autonomy_flags IS
  'Per-user no-human-in-the-loop autonomy opt-in (Loop 5a). Admin-only today. Service-role only.';

CREATE INDEX user_autonomy_flags_user_id_idx ON public.user_autonomy_flags (user_id);

ALTER TABLE public.user_autonomy_flags ENABLE ROW LEVEL SECURITY;
