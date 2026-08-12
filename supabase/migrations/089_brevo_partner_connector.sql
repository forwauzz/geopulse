-- MBI-6/7: tenant-scoped Brevo OAuth and held prospect selection.
-- Provider tokens never enter browser-visible tables or application contracts.

CREATE TABLE public.crm_connector_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider = 'brevo'),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_connector_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'brevo'),
  external_account_id TEXT NOT NULL,
  credential_ref UUID NOT NULL UNIQUE REFERENCES public.crm_connector_credentials(id) ON DELETE RESTRICT,
  scopes TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected', 'expired', 'revoked', 'disconnected', 'error')),
  connected_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_connector_accounts_scope_check CHECK ('contacts:read' = ANY(scopes)),
  CONSTRAINT crm_connector_accounts_disconnect_check CHECK (
    (status = 'disconnected' AND disconnected_at IS NOT NULL)
    OR (status <> 'disconnected' AND disconnected_at IS NULL)
  ),
  UNIQUE (agency_account_id, provider)
);

CREATE TABLE public.crm_connector_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^sha256:[0-9a-f]{64}$'),
  provider TEXT NOT NULL CHECK (provider = 'brevo'),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_connector_oauth_states_expiry_idx
  ON public.crm_connector_oauth_states (expires_at);

CREATE TABLE public.crm_prospect_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  connector_account_id UUID NOT NULL REFERENCES public.crm_connector_accounts(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'cancelled')),
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.crm_prospect_batch_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.crm_prospect_batches(id) ON DELETE CASCADE,
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  connector_account_id UUID NOT NULL REFERENCES public.crm_connector_accounts(id) ON DELETE RESTRICT,
  provider_contact_id TEXT NOT NULL,
  first_name TEXT,
  company_name TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  email TEXT NOT NULL,
  source_list_ids TEXT[] NOT NULL DEFAULT '{}',
  suppression_state TEXT NOT NULL CHECK (suppression_state = 'eligible'),
  source_version TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_prospect_batch_contacts_domain_check
    CHECK (canonical_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  CONSTRAINT crm_prospect_batch_contacts_email_check CHECK (position('@' in email) > 1),
  UNIQUE (agency_account_id, connector_account_id, provider_contact_id)
);
CREATE INDEX crm_prospect_batches_account_created_idx
  ON public.crm_prospect_batches (agency_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_crm_held_batch(
  p_agency_account_id UUID,
  p_connector_account_id UUID,
  p_created_by_user_id UUID,
  p_contacts JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_contacts) <> 'array' THEN
    RAISE EXCEPTION 'contacts must be an array';
  END IF;
  v_count := jsonb_array_length(p_contacts);
  IF v_count < 1 OR v_count > 10 THEN
    RAISE EXCEPTION 'held batch requires between 1 and 10 contacts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_connector_accounts account
    WHERE account.id = p_connector_account_id
      AND account.agency_account_id = p_agency_account_id
      AND account.provider = 'brevo'
      AND account.status = 'connected'
  ) THEN
    RAISE EXCEPTION 'connector is unavailable for this tenant';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_contacts) item
    WHERE item->>'suppression_state' <> 'eligible'
      OR coalesce(item->>'provider_contact_id', '') = ''
      OR coalesce(item->>'company_name', '') = ''
      OR coalesce(item->>'canonical_domain', '') = ''
      OR coalesce(item->>'email', '') = ''
  ) THEN
    RAISE EXCEPTION 'held batch contains an ineligible contact';
  END IF;

  INSERT INTO public.crm_prospect_batches (
    agency_account_id, connector_account_id, created_by_user_id
  ) VALUES (
    p_agency_account_id, p_connector_account_id, p_created_by_user_id
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.crm_prospect_batch_contacts (
    batch_id, agency_account_id, connector_account_id, provider_contact_id,
    first_name, company_name, canonical_domain, email, source_list_ids,
    suppression_state, source_version, observed_at
  )
  SELECT
    v_batch_id,
    p_agency_account_id,
    p_connector_account_id,
    item->>'provider_contact_id',
    nullif(item->>'first_name', ''),
    item->>'company_name',
    item->>'canonical_domain',
    lower(item->>'email'),
    ARRAY(SELECT jsonb_array_elements_text(item->'source_list_ids')),
    item->>'suppression_state',
    item->>'source_version',
    (item->>'observed_at')::timestamptz
  FROM jsonb_array_elements(p_contacts) item;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON public.crm_connector_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crm_connector_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crm_connector_oauth_states FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crm_prospect_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.crm_prospect_batch_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_connector_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_connector_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_connector_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.crm_prospect_batches TO service_role;
GRANT SELECT, INSERT ON public.crm_prospect_batch_contacts TO service_role;
REVOKE ALL ON FUNCTION public.create_crm_held_batch(UUID, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_crm_held_batch(UUID, UUID, UUID, JSONB) TO service_role;

ALTER TABLE public.crm_connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_connector_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_connector_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_prospect_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_prospect_batch_contacts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.crm_connector_accounts IS
  'Tenant-scoped provider identity and least-privilege scopes; token material lives only in the credential table.';
COMMENT ON TABLE public.crm_prospect_batches IS
  'Explicitly selected CRM contacts held for partner review; creating a batch never sends or enrolls anyone.';
