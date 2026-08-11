-- A buyer may work with more than one GEO-Pulse partner. Keep domain ownership
-- unique inside each agency account without making it globally exclusive.

ALTER TABLE public.agency_clients
  DROP CONSTRAINT IF EXISTS agency_clients_canonical_domain_unique;

ALTER TABLE public.agency_clients
  ADD CONSTRAINT agency_clients_account_canonical_domain_unique
  UNIQUE (agency_account_id, canonical_domain);

ALTER TABLE public.agency_client_domains
  ADD COLUMN IF NOT EXISTS agency_account_id UUID;

UPDATE public.agency_client_domains AS domain
SET agency_account_id = client.agency_account_id
FROM public.agency_clients AS client
WHERE client.id = domain.agency_client_id
  AND domain.agency_account_id IS NULL;

ALTER TABLE public.agency_client_domains
  ALTER COLUMN agency_account_id SET NOT NULL;

ALTER TABLE public.agency_client_domains
  ADD CONSTRAINT agency_client_domains_account_fk
  FOREIGN KEY (agency_account_id)
  REFERENCES public.agency_accounts(id)
  ON DELETE CASCADE;

ALTER TABLE public.agency_client_domains
  DROP CONSTRAINT IF EXISTS agency_client_domains_canonical_domain_unique;

ALTER TABLE public.agency_client_domains
  ADD CONSTRAINT agency_client_domains_account_canonical_domain_unique
  UNIQUE (agency_account_id, canonical_domain);

CREATE OR REPLACE FUNCTION public.sync_agency_client_domain_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  resolved_account_id UUID;
BEGIN
  SELECT agency_account_id
  INTO resolved_account_id
  FROM public.agency_clients
  WHERE id = NEW.agency_client_id;

  IF resolved_account_id IS NULL THEN
    RAISE EXCEPTION 'Agency client % does not exist.', NEW.agency_client_id
      USING ERRCODE = '23503';
  END IF;

  NEW.agency_account_id := resolved_account_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_client_domains_sync_account
  ON public.agency_client_domains;

CREATE TRIGGER agency_client_domains_sync_account
  BEFORE INSERT OR UPDATE OF agency_client_id, agency_account_id
  ON public.agency_client_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_agency_client_domain_account();

COMMENT ON COLUMN public.agency_client_domains.agency_account_id IS
  'Tenant key derived from agency_client_id and enforced by trigger.';
