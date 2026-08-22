-- MBI-7C: durable, tenant-scoped CRM report projection and provider delivery ledger.

CREATE TABLE public.crm_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  connector_account_id UUID NOT NULL REFERENCES public.crm_connector_accounts(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.crm_prospect_batches(id) ON DELETE CASCADE,
  provider_contact_id TEXT NOT NULL,
  generation_id UUID NOT NULL REFERENCES public.buyer_intelligence_generations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'synced', 'sending', 'delivered', 'failed', 'uncertain')),
  report_url TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_code TEXT,
  synced_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_report_deliveries_email_check CHECK (recipient_email = lower(recipient_email) AND position('@' in recipient_email) > 1),
  CONSTRAINT crm_report_deliveries_unique UNIQUE (connector_account_id, provider_contact_id, generation_id),
  CONSTRAINT crm_report_deliveries_success_check CHECK (
    (status = 'delivered' AND provider_message_id IS NOT NULL AND delivered_at IS NOT NULL)
    OR status <> 'delivered'
  )
);

CREATE INDEX crm_report_deliveries_account_created_idx
  ON public.crm_report_deliveries (agency_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_crm_report_delivery()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.crm_prospect_batch_contacts contact
    JOIN public.crm_prospect_batches batch ON batch.id = contact.batch_id
    JOIN public.buyer_intelligence_generations generation
      ON generation.id = NEW.generation_id
    WHERE contact.batch_id = NEW.batch_id
      AND contact.provider_contact_id = NEW.provider_contact_id
      AND contact.email = NEW.recipient_email
      AND contact.agency_account_id = NEW.agency_account_id
      AND contact.connector_account_id = NEW.connector_account_id
      AND batch.status = 'held'
      AND generation.agency_account_id = NEW.agency_account_id
      AND generation.status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'CRM report delivery lineage is invalid or no longer eligible';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.agency_account_id IS DISTINCT FROM OLD.agency_account_id
    OR NEW.connector_account_id IS DISTINCT FROM OLD.connector_account_id
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.provider_contact_id IS DISTINCT FROM OLD.provider_contact_id
    OR NEW.generation_id IS DISTINCT FROM OLD.generation_id
    OR NEW.report_url IS DISTINCT FROM OLD.report_url
    OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
    OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
  ) THEN
    RAISE EXCEPTION 'CRM report delivery lineage is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER crm_report_deliveries_validate
  BEFORE INSERT OR UPDATE ON public.crm_report_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.validate_crm_report_delivery();

ALTER TABLE public.crm_report_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_report_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.crm_report_deliveries TO service_role;

COMMENT ON TABLE public.crm_report_deliveries IS
  'Provider-native report projection and delivery ledger. Unique lineage and atomic sending claims prevent duplicate CRM messages.';
