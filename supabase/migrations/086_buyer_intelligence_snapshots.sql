-- MBI-3b
-- Immutable canonical buyer-intelligence snapshots. Product views reference this record rather
-- than rebuilding truth from report-specific tables.

CREATE TABLE public.buyer_intelligence_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  contract_version TEXT NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id UUID,
  organization_identity_id UUID NOT NULL,
  context_id TEXT NOT NULL,
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  previous_snapshot_id TEXT REFERENCES public.buyer_intelligence_snapshots(snapshot_id),
  input_fingerprint TEXT NOT NULL,
  report_eligibility TEXT NOT NULL,
  evidence_ids TEXT[] NOT NULL,
  run_ids TEXT[] NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT buyer_intelligence_snapshots_contract_check
    CHECK (contract_version = 'buyer-intelligence-snapshot-v1'),
  CONSTRAINT buyer_intelligence_snapshots_owner_type_check
    CHECK (owner_type IN ('agency_account', 'agency_client', 'startup_workspace', 'user', 'internal_benchmark')),
  CONSTRAINT buyer_intelligence_snapshots_owner_id_check
    CHECK (
      (owner_type = 'internal_benchmark' AND owner_id IS NULL)
      OR (owner_type <> 'internal_benchmark' AND owner_id IS NOT NULL)
    ),
  CONSTRAINT buyer_intelligence_snapshots_period_check CHECK (period_start < period_end),
  CONSTRAINT buyer_intelligence_snapshots_fingerprint_check
    CHECK (input_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CONSTRAINT buyer_intelligence_snapshots_eligibility_check
    CHECK (report_eligibility IN ('eligible', 'quarantined')),
  CONSTRAINT buyer_intelligence_snapshots_payload_check
    CHECK (
      snapshot ->> 'snapshotId' = snapshot_id
      AND snapshot ->> 'contractVersion' = contract_version
      AND snapshot #>> '{owner,type}' = owner_type
      AND coalesce(snapshot #>> '{owner,id}', '') = coalesce(owner_id::text, '')
      AND snapshot #>> '{organization,identityId}' = organization_identity_id::text
      AND snapshot #>> '{organization,contextId}' = context_id
      AND snapshot #>> '{organization,contextVersion}' = context_version
      AND snapshot #>> '{organization,contextHash}' = context_hash
      AND (snapshot #>> '{period,start}')::timestamptz = period_start
      AND (snapshot #>> '{period,end}')::timestamptz = period_end
      AND snapshot #>> '{provenance,inputFingerprint}' = input_fingerprint
      AND snapshot #>> '{reportEligibility,state}' = report_eligibility
    )
);

CREATE INDEX buyer_intelligence_snapshots_owner_created_idx
  ON public.buyer_intelligence_snapshots (owner_type, owner_id, created_at DESC);

CREATE INDEX buyer_intelligence_snapshots_identity_period_idx
  ON public.buyer_intelligence_snapshots (organization_identity_id, period_end DESC);

CREATE OR REPLACE FUNCTION public.validate_buyer_intelligence_snapshot_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_type = 'agency_account'
    AND NOT EXISTS (SELECT 1 FROM public.agency_accounts WHERE id = NEW.owner_id) THEN
    RAISE EXCEPTION 'unknown buyer intelligence snapshot owner';
  ELSIF NEW.owner_type = 'agency_client'
    AND NOT EXISTS (SELECT 1 FROM public.agency_clients WHERE id = NEW.owner_id) THEN
    RAISE EXCEPTION 'unknown buyer intelligence snapshot owner';
  ELSIF NEW.owner_type = 'startup_workspace'
    AND NOT EXISTS (SELECT 1 FROM public.startup_workspaces WHERE id = NEW.owner_id) THEN
    RAISE EXCEPTION 'unknown buyer intelligence snapshot owner';
  ELSIF NEW.owner_type = 'user'
    AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.owner_id) THEN
    RAISE EXCEPTION 'unknown buyer intelligence snapshot owner';
  END IF;

  IF NEW.previous_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.buyer_intelligence_snapshots previous
    WHERE previous.snapshot_id = NEW.previous_snapshot_id
      AND previous.owner_type = NEW.owner_type
      AND previous.owner_id IS NOT DISTINCT FROM NEW.owner_id
      AND previous.organization_identity_id = NEW.organization_identity_id
  ) THEN
    RAISE EXCEPTION 'previous buyer intelligence snapshot must have the same owner and organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER buyer_intelligence_snapshots_validate_owner
  BEFORE INSERT ON public.buyer_intelligence_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.validate_buyer_intelligence_snapshot_owner();

CREATE OR REPLACE FUNCTION public.prevent_buyer_intelligence_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'buyer intelligence snapshots are append-only';
END;
$$;

CREATE TRIGGER buyer_intelligence_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.buyer_intelligence_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_buyer_intelligence_snapshot_mutation();

ALTER TABLE public.buyer_intelligence_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.buyer_intelligence_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.buyer_intelligence_snapshots TO service_role;

COMMENT ON TABLE public.buyer_intelligence_snapshots IS
  'Append-only canonical buyer-intelligence snapshots used by all product views.';
