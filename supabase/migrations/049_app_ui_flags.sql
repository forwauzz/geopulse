-- Migration 049: global app UI visibility flags (super-admin "App Settings" panel).
--
-- Simple key→boolean switches that show/hide whole sections of the app (pricing, about-in-nav,
-- free-trial CTA, connectors, etc.). Distinct from the service-role-only autonomy/entitlement
-- tables because UI visibility is NON-SENSITIVE and read on every page — so this table is
-- PUBLIC-READABLE (anon SELECT) and cacheable. Writes remain service-role only (admin panel).

CREATE TABLE IF NOT EXISTS public.app_ui_flags (
  key         TEXT        PRIMARY KEY,
  enabled     BOOLEAN     NOT NULL DEFAULT true,
  updated_by  UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_ui_flags IS
  'Global UI section visibility toggles for the super-admin App Settings panel. Public-readable; '
  'writes service-role only.';

ALTER TABLE public.app_ui_flags ENABLE ROW LEVEL SECURITY;

-- Anyone may READ visibility flags (they only decide what UI to render). No write policy → only
-- the service-role client (admin panel) can change them.
DROP POLICY IF EXISTS app_ui_flags_public_read ON public.app_ui_flags;
CREATE POLICY app_ui_flags_public_read ON public.app_ui_flags FOR SELECT USING (true);

-- OSS-simplifying defaults (super-admin can flip any of these live from /admin/settings).
INSERT INTO public.app_ui_flags (key, enabled) VALUES
  ('show_pricing',    false),
  ('show_about_nav',  false),
  ('show_free_trial', false),
  ('show_connectors', false),
  ('show_billing',    true),
  ('show_blog',       true)
ON CONFLICT (key) DO NOTHING;
