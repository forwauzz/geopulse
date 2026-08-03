-- Reconcile the production schema after migration 080 was applied before the final VCI-8
-- delivery-safety review. Every statement is additive or idempotent so fresh databases (where
-- 080 already contains these changes) and existing production databases converge safely.

COMMENT ON COLUMN public.outreach_contacts.source_class IS
  '"verified_published" means the source file labels this address as published; it is not by '
  'itself a legal, consent, deliverability, or send-eligibility conclusion. '
  '"constructed_unverified" = pattern-guessed, no consent basis, never sendable through import. '
  '"rejection_evidence" = retained provenance that must never become sendable.';

-- One immutable provider idempotency key per campaign/contact/step. A provider-accepted request
-- followed by an internal write failure must reconcile on retry, not allocate a second ledger row.
ALTER TABLE public.outreach_sends
  ADD COLUMN IF NOT EXISTS campaign_send_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS outreach_sends_campaign_send_key_idx
  ON public.outreach_sends (campaign_send_key)
  WHERE campaign_send_key IS NOT NULL;

-- The control room uses service-role access. Keep the required legacy-table privileges in the
-- migration chain instead of relying on a manual production grant.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.outreach_contacts,
           public.outreach_prospects,
           public.outreach_sends
  TO service_role;
