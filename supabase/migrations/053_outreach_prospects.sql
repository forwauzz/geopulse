-- Outreach v1: admin-managed prospects who receive recurring audit scorecards by email,
-- no account required. Sends are tracked with a first-party open pixel.

CREATE TABLE IF NOT EXISTS public.outreach_prospects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  name          TEXT,
  company       TEXT,
  url           TEXT        NOT NULL,
  cadence       TEXT        NOT NULL DEFAULT 'monthly'
                CHECK (cadence IN ('hourly', 'daily', 'weekly', 'monthly')),
  enabled       BOOLEAN     NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_scan_id  UUID        REFERENCES public.scans(id) ON DELETE SET NULL,
  last_error    TEXT,
  created_by    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email, url)
);

COMMENT ON TABLE public.outreach_prospects IS
  'Admin-managed outreach recipients: recurring audit scorecards emailed without an account. '
  'Service-role only; managed from /admin/outreach.';

CREATE INDEX IF NOT EXISTS outreach_prospects_due_idx
  ON public.outreach_prospects (next_run_at)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS public.outreach_sends (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id  UUID        NOT NULL REFERENCES public.outreach_prospects(id) ON DELETE CASCADE,
  scan_id      UUID        REFERENCES public.scans(id) ON DELETE SET NULL,
  score        INTEGER,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at    TIMESTAMPTZ,
  open_count   INTEGER     NOT NULL DEFAULT 0
);

COMMENT ON COLUMN public.outreach_sends.opened_at IS
  'First open, recorded by the first-party pixel at /api/outreach/open/[sendId]. '
  'Pixel-based opens undercount (image blocking) — treat as a floor, not a truth.';

CREATE INDEX IF NOT EXISTS outreach_sends_prospect_idx
  ON public.outreach_sends (prospect_id, sent_at DESC);

ALTER TABLE public.outreach_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sends ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service-role access only.
