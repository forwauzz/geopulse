-- Guest checkout: deep-audit reports before Supabase Auth (Phase 2).
-- Service role inserts reports with user_id NULL; RLS keeps them invisible to anon/auth clients.

ALTER TABLE public.reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

COMMENT ON COLUMN public.reports.guest_email IS 'Recipient email for paid guest reports when user_id is null';

CREATE INDEX IF NOT EXISTS reports_guest_email_idx ON public.reports (guest_email)
  WHERE guest_email IS NOT NULL;
