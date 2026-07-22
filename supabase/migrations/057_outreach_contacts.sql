-- Migration 057: outreach contact bank (Brevo-style saved segments).
--
-- Contacts are SAVED, not scheduled: companies + their point-of-contact email, tagged into
-- segments (one primary segment + free-form tags) so a whole segment can be added to the
-- outreach sequence with one click when the operator is ready. Consent posture: rows here
-- receive NO email until explicitly added to the sequence; the add action re-checks the
-- email-keyed unsubscribe guard at that moment.

CREATE TABLE IF NOT EXISTS public.outreach_contacts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT        NOT NULL,
  name                  TEXT,
  company               TEXT,
  url                   TEXT        NOT NULL,
  -- Primary segment key, kebab-case ("marketing-agencies-qc", "msp-qc").
  segment               TEXT        NOT NULL,
  tags                  TEXT[]      NOT NULL DEFAULT '{}',
  city                  TEXT,
  -- Where the contact came from ("directory-mining", "google-pack", "manual").
  source                TEXT,
  added_to_sequence_at  TIMESTAMPTZ,
  prospect_id           UUID        REFERENCES public.outreach_prospects(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT outreach_contacts_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS outreach_contacts_segment_idx ON public.outreach_contacts (segment);
CREATE INDEX IF NOT EXISTS outreach_contacts_sequence_idx ON public.outreach_contacts (added_to_sequence_at);

ALTER TABLE public.outreach_contacts ENABLE ROW LEVEL SECURITY;
-- Service-role only: no policies on purpose. Admin server actions are the only reader/writer.

COMMENT ON TABLE public.outreach_contacts IS
  'Saved outreach contacts (Brevo-style bank): tagged segments held OUT of the sequence until '
  'an admin adds a segment explicitly. Service-role only.';
COMMENT ON COLUMN public.outreach_contacts.segment IS 'Primary segment key used for one-click add-to-sequence.';
