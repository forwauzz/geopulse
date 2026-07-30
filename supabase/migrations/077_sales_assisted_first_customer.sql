-- Sales-assisted path for the first recurring customer.
--
-- This migration extends the existing lead and outreach control planes instead
-- of introducing a separate CRM. All fields remain service-role only.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS request_type TEXT
    CHECK (request_type IS NULL OR request_type IN ('walkthrough')),
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT
    CHECK (status IS NULL OR status IN ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost')),
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS closure_condition TEXT;

CREATE INDEX IF NOT EXISTS leads_sales_request_status_idx
  ON public.leads (status, created_at DESC)
  WHERE request_type IS NOT NULL;

ALTER TABLE public.outreach_contacts
  ADD COLUMN IF NOT EXISTS personalization_reason TEXT,
  ADD COLUMN IF NOT EXISTS personalization_source_url TEXT
    CHECK (
      personalization_source_url IS NULL
      OR personalization_source_url ~ '^https://'
    ),
  ADD COLUMN IF NOT EXISTS personalization_verified_at TIMESTAMPTZ;

ALTER TABLE public.outreach_prospects
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS personalization_reason TEXT,
  ADD COLUMN IF NOT EXISTS personalization_source_url TEXT
    CHECK (
      personalization_source_url IS NULL
      OR personalization_source_url ~ '^https://'
    ),
  ADD COLUMN IF NOT EXISTS personalization_verified_at TIMESTAMPTZ;

UPDATE public.outreach_prospects AS prospect
SET segment = contact.segment,
    personalization_reason = contact.personalization_reason,
    personalization_source_url = contact.personalization_source_url,
    personalization_verified_at = contact.personalization_verified_at,
    updated_at = now()
FROM public.outreach_contacts AS contact
WHERE contact.prospect_id = prospect.id
  AND (
    prospect.segment IS NULL
    OR prospect.personalization_reason IS NULL
    OR prospect.personalization_source_url IS NULL
  );

CREATE TABLE IF NOT EXISTS public.outreach_reply_events (
  provider_event_id TEXT PRIMARY KEY,
  provider_email_id TEXT NOT NULL UNIQUE,
  sender_email_hash TEXT NOT NULL,
  prospect_id UUID REFERENCES public.outreach_prospects(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  classification TEXT
    CHECK (
      classification IS NULL
      OR classification IN (
        'positive', 'neutral', 'not_interested', 'out_of_office',
        'wrong_person', 'unsubscribed', 'automated'
      )
    ),
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'unmatched', 'retrieval_failed')),
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  body_retained BOOLEAN NOT NULL DEFAULT false
    CHECK (body_retained = false),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_reply_events_prospect_idx
  ON public.outreach_reply_events (prospect_id, received_at DESC)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS outreach_reply_events_lead_idx
  ON public.outreach_reply_events (lead_id, received_at DESC)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.outreach_reply_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.outreach_reply_events IS
  'Minimal Resend inbound-reply ledger. Stores classification and provider ids, never message bodies or subjects.';
COMMENT ON COLUMN public.outreach_reply_events.body_retained IS
  'Privacy invariant: inbound message bodies and subjects are processed in memory and never retained.';

