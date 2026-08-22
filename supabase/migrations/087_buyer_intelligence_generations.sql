-- MBI-5
-- Mutable operational ledger for partner-generated views. Truth remains in the append-only snapshot.

CREATE TABLE public.buyer_intelligence_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_account_id UUID NOT NULL REFERENCES public.agency_accounts(id) ON DELETE CASCADE,
  agency_client_id UUID NOT NULL REFERENCES public.agency_clients(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES public.buyer_intelligence_snapshots(snapshot_id),
  view_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  branding JSONB NOT NULL DEFAULT '{}'::jsonb,
  hero_r2_key TEXT,
  artifact_r2_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buyer_intelligence_generations_view_check
    CHECK (view_kind IN ('prospect_preview', 'full_baseline', 'monthly_brief')),
  CONSTRAINT buyer_intelligence_generations_status_check
    CHECK (status IN ('queued', 'rendering', 'succeeded', 'failed')),
  CONSTRAINT buyer_intelligence_generations_idempotency_check
    CHECK (idempotency_key ~ '^[A-Za-z0-9:_-]{8,160}$'),
  CONSTRAINT buyer_intelligence_generations_attempts_check CHECK (attempts > 0),
  CONSTRAINT buyer_intelligence_generations_success_check CHECK (
    (status = 'succeeded' AND artifact_r2_key IS NOT NULL AND completed_at IS NOT NULL AND error_code IS NULL)
    OR status <> 'succeeded'
  ),
  CONSTRAINT buyer_intelligence_generations_failure_check CHECK (
    (status = 'failed' AND error_code IS NOT NULL AND completed_at IS NOT NULL)
    OR status <> 'failed'
  ),
  CONSTRAINT buyer_intelligence_generations_artifact_state_check CHECK (
    status = 'succeeded' OR artifact_r2_key IS NULL
  ),
  CONSTRAINT buyer_intelligence_generations_account_key_unique
    UNIQUE (agency_account_id, idempotency_key)
);

CREATE INDEX buyer_intelligence_generations_client_created_idx
  ON public.buyer_intelligence_generations (agency_client_id, created_at DESC);
CREATE INDEX buyer_intelligence_generations_status_updated_idx
  ON public.buyer_intelligence_generations (status, updated_at);

CREATE OR REPLACE FUNCTION public.validate_buyer_intelligence_generation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_clients client
    WHERE client.id = NEW.agency_client_id
      AND client.agency_account_id = NEW.agency_account_id
      AND client.status = 'active'
  ) THEN
    RAISE EXCEPTION 'buyer intelligence generation client is outside the agency account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.buyer_intelligence_snapshots snapshot
    WHERE snapshot.snapshot_id = NEW.snapshot_id
      AND snapshot.owner_type = 'agency_client'
      AND snapshot.owner_id = NEW.agency_client_id
      AND snapshot.report_eligibility = 'eligible'
  ) THEN
    RAISE EXCEPTION 'buyer intelligence generation requires an eligible client snapshot';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.agency_account_id IS DISTINCT FROM OLD.agency_account_id
    OR NEW.agency_client_id IS DISTINCT FROM OLD.agency_client_id
    OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
    OR NEW.view_kind IS DISTINCT FROM OLD.view_kind
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id
    OR NEW.branding IS DISTINCT FROM OLD.branding
    OR NEW.hero_r2_key IS DISTINCT FROM OLD.hero_r2_key
  ) THEN
    RAISE EXCEPTION 'buyer intelligence generation lineage is immutable';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      (OLD.status = 'queued' AND NEW.status IN ('rendering', 'failed'))
      OR (OLD.status = 'rendering' AND NEW.status IN ('succeeded', 'failed'))
      OR (OLD.status = 'failed' AND NEW.status = 'queued')
    )
  THEN
    RAISE EXCEPTION 'invalid buyer intelligence generation transition: % -> %', OLD.status, NEW.status;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER buyer_intelligence_generations_validate
  BEFORE INSERT OR UPDATE ON public.buyer_intelligence_generations
  FOR EACH ROW EXECUTE FUNCTION public.validate_buyer_intelligence_generation();

ALTER TABLE public.buyer_intelligence_generations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buyer_intelligence_generations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.buyer_intelligence_generations TO service_role;

COMMENT ON TABLE public.buyer_intelligence_generations IS
  'Tenant-scoped operational history for partner-generated artifacts; immutable truth remains in buyer_intelligence_snapshots.';
