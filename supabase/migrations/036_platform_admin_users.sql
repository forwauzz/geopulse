-- Migration 036: Platform admin users table
--
-- Defines the DB-backed allowlist for platform-admin access.
-- Multiple users can be platform admins. Access is managed via /admin/admins UI.
--
-- Security: table has RLS enabled with NO select policy for anon/authenticated roles.
-- Only the service-role client (used by server-side admin code) can read/write this table.
--
-- is_platform_admin() is a SECURITY DEFINER helper used inside other SQL functions
-- if needed. App code uses the service-role client directly.

CREATE TABLE public.platform_admin_users (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admin_users IS
  'Allowlist of users with platform-admin access. Managed via /admin/admins UI. '
  'Only service-role client may read/write — no RLS policies for anon/authenticated roles.';

-- RLS enabled but intentionally no policies for regular roles
-- Service-role bypasses RLS entirely, so admin server code always has access
ALTER TABLE public.platform_admin_users ENABLE ROW LEVEL SECURITY;

-- Index for fast user_id lookup
CREATE INDEX platform_admin_users_user_id_idx ON public.platform_admin_users (user_id);

-- SQL helper: check if a UUID is a platform admin
-- SECURITY DEFINER so it can read platform_admin_users regardless of caller's RLS context
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admin_users WHERE user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin(UUID) IS
  'Returns true if the given user_id is in platform_admin_users. '
  'SECURITY DEFINER — safe to call from RLS policies or triggers.';

-- ── Seed instruction (run manually after migration) ───────────────────────────
-- After applying this migration, seed the initial admin by running:
--
--   INSERT INTO public.platform_admin_users (user_id, notes)
--   SELECT id, 'Initial platform admin seeded manually'
--   FROM public.users
--   WHERE email = '<your-admin-email>'
--   ON CONFLICT (user_id) DO NOTHING;
--
-- Then you can manage additional admins via /admin/admins in the UI.
-- There is no env-var fallback path for admin access.
