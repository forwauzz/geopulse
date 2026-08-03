-- Migration 080 (VCI-8 / ECP-1): fail-closed contact eligibility and immutable campaign
-- audiences for the centralized email campaign control room.
--
-- Two things the existing model could not express safely:
--
--   1. WHY a saved contact may or may not be emailed. `outreach_contacts` recorded provenance
--      loosely ("source") and nothing about consent basis. A published address and a constructed
--      guess looked identical once imported, so nothing structurally prevented a guessed address
--      from being promoted into the sequence. Eligibility is now explicit and defaults to the
--      restrictive value.
--
--   2. WHICH contacts a scheduled campaign actually locked. `outreach_contacts.prospect_id` holds
--      one prospect per contact, so a second campaign over the same person would overwrite the
--      first campaign's history. The audience/enrollment ledgers below keep one immutable snapshot
--      per campaign version, which is also what makes retries idempotent (ECP-3).
--
-- Every new object is service-role only, matching the rest of outreach.

-- ── Contact eligibility and provenance ──────────────────────────────────────────

ALTER TABLE public.outreach_contacts
  -- Restrictive default on purpose: a row written by any path that predates or ignores the
  -- intake contract is saved but NOT selectable for sending.
  ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'needs_verification'
    CHECK (eligibility_status IN (
      'eligible', 'needs_verification', 'suppressed', 'rejected', 'enrolled', 'converted'
    )),
  ADD COLUMN IF NOT EXISTS eligibility_reason TEXT,
  -- Consent/provenance class of the address itself, not of the campaign.
  ADD COLUMN IF NOT EXISTS source_class TEXT NOT NULL DEFAULT 'operator_manual'
    CHECK (source_class IN (
      'verified_published', 'constructed_unverified', 'rejection_evidence', 'operator_manual'
    )),
  ADD COLUMN IF NOT EXISTS source_file TEXT,
  ADD COLUMN IF NOT EXISTS source_file_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS source_row_number INTEGER,
  ADD COLUMN IF NOT EXISTS company_domain TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS contact_title TEXT,
  ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS outreach_contacts_eligibility_idx
  ON public.outreach_contacts (eligibility_status, segment);
CREATE INDEX IF NOT EXISTS outreach_contacts_source_class_idx
  ON public.outreach_contacts (source_class, region);

COMMENT ON COLUMN public.outreach_contacts.eligibility_status IS
  'Fail-closed send eligibility. Only "eligible" may enter a campaign audience, and only after '
  'the ECP-3 preflight re-checks suppression, conversion, and sequence conflicts.';
COMMENT ON COLUMN public.outreach_contacts.source_class IS
  '"verified_published" = the person published this address (CASL implied-consent evidence). '
  '"constructed_unverified" = pattern-guessed, no consent basis, never sendable through import. '
  '"rejection_evidence" = retained provenance that must never become sendable.';
COMMENT ON COLUMN public.outreach_contacts.provenance IS
  'Public-source evidence for the address (source file, row, verification state, notes). '
  'Never store credentials or reply bodies here.';

-- Existing contacts predate the eligibility contract. They keep their behaviour through the
-- legacy segment promotion path, but they are not silently promoted to "eligible".
UPDATE public.outreach_contacts
SET source_class = 'operator_manual',
    eligibility_status = 'needs_verification',
    eligibility_reason = 'imported_before_eligibility_contract',
    company_domain = COALESCE(company_domain, lower(split_part(email, '@', 2)))
WHERE eligibility_reason IS NULL;

-- ── Immutable campaign audiences ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.outreach_campaign_audiences (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES public.growth_campaigns(id) ON DELETE CASCADE,
  intervention_id     UUID        NOT NULL REFERENCES public.growth_campaign_interventions(id) ON DELETE CASCADE,
  -- One audience per campaign version: "agency-reporting-montreal-v1@3".
  audience_key        TEXT        NOT NULL UNIQUE,
  campaign_version    INTEGER     NOT NULL CHECK (campaign_version >= 1),
  source_segment      TEXT,
  recipient_count     INTEGER     NOT NULL CHECK (recipient_count >= 0),
  -- Checksum over the ordered recipient list. A drifting segment cannot silently change a
  -- frozen audience: the checksum stops matching and the ECP-3 preflight fails closed.
  checksum            TEXT        NOT NULL,
  selection_reason    TEXT        NOT NULL,
  excluded_counts     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  frozen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outreach_campaign_audiences_intervention_idx
  ON public.outreach_campaign_audiences (intervention_id, campaign_version DESC);

CREATE TABLE IF NOT EXISTS public.outreach_campaign_audience_members (
  audience_id  UUID    NOT NULL REFERENCES public.outreach_campaign_audiences(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: a frozen audience is evidence of who was locked in. Deleting a
  -- contact must not quietly rewrite what a scheduled campaign said it would send.
  contact_id   UUID    NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE RESTRICT,
  email        TEXT    NOT NULL,
  position     INTEGER NOT NULL CHECK (position >= 1),
  PRIMARY KEY (audience_id, contact_id),
  UNIQUE (audience_id, position)
);

CREATE TABLE IF NOT EXISTS public.outreach_campaign_enrollments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id      UUID        NOT NULL REFERENCES public.outreach_campaign_audiences(id) ON DELETE CASCADE,
  contact_id       UUID        NOT NULL REFERENCES public.outreach_contacts(id) ON DELETE RESTRICT,
  campaign_id      UUID        NOT NULL REFERENCES public.growth_campaigns(id) ON DELETE CASCADE,
  intervention_id  UUID        NOT NULL REFERENCES public.growth_campaign_interventions(id) ON DELETE CASCADE,
  campaign_version INTEGER     NOT NULL CHECK (campaign_version >= 1),
  prospect_id      UUID        REFERENCES public.outreach_prospects(id) ON DELETE SET NULL,
  -- Derived from campaign version + audience + contact. The unique constraint is what makes a
  -- retried schedule a no-op instead of a duplicate enrollment (ECP-3).
  idempotency_key  TEXT        NOT NULL UNIQUE,
  status           TEXT        NOT NULL DEFAULT 'enrolled'
                               CHECK (status IN ('enrolled', 'sending', 'completed', 'stopped')),
  exit_reason      TEXT,
  enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (audience_id, contact_id)
);

CREATE INDEX IF NOT EXISTS outreach_campaign_enrollments_contact_idx
  ON public.outreach_campaign_enrollments (contact_id, status);
CREATE INDEX IF NOT EXISTS outreach_campaign_enrollments_campaign_idx
  ON public.outreach_campaign_enrollments (campaign_id, intervention_id, status);

DROP TRIGGER IF EXISTS outreach_campaign_enrollments_updated_at
  ON public.outreach_campaign_enrollments;
CREATE TRIGGER outreach_campaign_enrollments_updated_at
  BEFORE UPDATE ON public.outreach_campaign_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.outreach_campaign_audiences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_campaign_audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_campaign_enrollments      ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: service-role access only, same posture as outreach_prospects.

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.outreach_campaign_audiences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.outreach_campaign_audience_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.outreach_campaign_enrollments TO service_role;

COMMENT ON TABLE public.outreach_campaign_audiences IS
  'Immutable recipient snapshot for one campaign version. Segment membership changing later '
  'must never change what a scheduled campaign sends.';
COMMENT ON TABLE public.outreach_campaign_enrollments IS
  'Per-contact participation in one campaign version. Lets one contact take part in more than '
  'one campaign over time without overwriting outreach_contacts.prospect_id.';
