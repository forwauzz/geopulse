-- Migration 050: per-user feature grants (super-admin "assign feature to a user").
--
-- Lets a super-admin grant a specific user access to an opt-in feature (e.g. automation /
-- recurring audits) without making them a full platform admin. Service-role only (RLS, no
-- policies) — resolved server-side and gated in the UI.

CREATE TABLE IF NOT EXISTS public.user_feature_grants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feature     TEXT        NOT NULL,
  granted     BOOLEAN     NOT NULL DEFAULT true,
  granted_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature)
);

COMMENT ON TABLE public.user_feature_grants IS
  'Per-user opt-in feature grants (e.g. automation, recurring_audits) assigned by a super-admin. '
  'Service-role only.';

CREATE INDEX user_feature_grants_user_id_idx ON public.user_feature_grants (user_id);

ALTER TABLE public.user_feature_grants ENABLE ROW LEVEL SECURITY;
