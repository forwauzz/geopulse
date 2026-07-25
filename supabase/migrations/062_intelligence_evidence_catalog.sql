-- INT-005: unified evidence metadata and lineage. Source rows and R2 objects remain authoritative.

CREATE TABLE public.intelligence_evidence_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version TEXT NOT NULL,
  stable_evidence_id TEXT NOT NULL UNIQUE,
  evidence_kind TEXT NOT NULL,
  object_class TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT,
  storage_kind TEXT NOT NULL,
  artifact_status TEXT NOT NULL,
  inline_excerpt TEXT,
  artifact_ref TEXT,
  r2_bucket TEXT,
  r2_key TEXT,
  r2_etag TEXT,
  run_id UUID REFERENCES public.intelligence_runs(id) ON DELETE SET NULL,
  canonical_domain_id UUID REFERENCES public.intelligence_domains(id) ON DELETE SET NULL,
  canonical_page_id UUID REFERENCES public.intelligence_pages(id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ,
  source_created_at TIMESTAMPTZ,
  parser_version TEXT,
  extractor_version TEXT,
  privacy TEXT NOT NULL DEFAULT 'internal',
  tenant_type TEXT,
  tenant_id UUID,
  retention_class TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_evidence_source_unique
    UNIQUE (source_kind, source_id, evidence_kind),
  CONSTRAINT intelligence_evidence_object_class_check CHECK (
    object_class IN ('original', 'extracted', 'parsed', 'computed', 'generated')
  ),
  CONSTRAINT intelligence_evidence_storage_check CHECK (
    storage_kind IN ('postgres_source', 'postgres_inline', 'r2', 'external', 'missing')
  ),
  CONSTRAINT intelligence_evidence_status_check CHECK (
    artifact_status IN ('present', 'missing', 'unverified')
  ),
  CONSTRAINT intelligence_evidence_privacy_check CHECK (
    privacy IN ('private_tenant', 'internal', 'shared', 'public')
  ),
  CONSTRAINT intelligence_evidence_missing_shape_check CHECK (
    (artifact_status = 'missing' AND storage_kind = 'missing')
    OR (artifact_status <> 'missing' AND storage_kind <> 'missing')
  ),
  CONSTRAINT intelligence_evidence_r2_shape_check CHECK (
    storage_kind <> 'r2' OR r2_key IS NOT NULL
  ),
  CONSTRAINT intelligence_evidence_tenant_shape_check CHECK (
    privacy <> 'private_tenant' OR (tenant_type IS NOT NULL AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE public.intelligence_evidence_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_evidence_id UUID NOT NULL REFERENCES public.intelligence_evidence_objects(id) ON DELETE CASCADE,
  to_evidence_id UUID NOT NULL REFERENCES public.intelligence_evidence_objects(id) ON DELETE RESTRICT,
  relation TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_evidence_edge_unique UNIQUE (from_evidence_id, to_evidence_id, relation),
  CONSTRAINT intelligence_evidence_relation_check CHECK (
    relation IN ('derived_from', 'parsed_from', 'supports', 'generated_from', 'verifies')
  )
);

CREATE INDEX intelligence_evidence_content_hash_idx
  ON public.intelligence_evidence_objects (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX intelligence_evidence_run_idx
  ON public.intelligence_evidence_objects (run_id, evidence_kind);
CREATE INDEX intelligence_evidence_domain_time_idx
  ON public.intelligence_evidence_objects (canonical_domain_id, collected_at DESC);
CREATE INDEX intelligence_evidence_page_idx
  ON public.intelligence_evidence_objects (canonical_page_id);
CREATE INDEX intelligence_evidence_tenant_idx
  ON public.intelligence_evidence_objects (tenant_type, tenant_id, privacy);
CREATE INDEX intelligence_evidence_edge_target_idx
  ON public.intelligence_evidence_edges (to_evidence_id, relation);

CREATE TRIGGER intelligence_evidence_objects_updated_at
  BEFORE UPDATE ON public.intelligence_evidence_objects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.intelligence_evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_evidence_edges ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.intelligence_evidence_objects IS
  'Metadata catalog for recoverable evidence; source rows and R2 objects are never moved or overwritten.';
COMMENT ON COLUMN public.intelligence_evidence_objects.content_hash IS
  'Deduplication hash only. It is intentionally non-unique so independent lineage is preserved.';
COMMENT ON COLUMN public.intelligence_evidence_objects.artifact_ref IS
  'Recoverable source pointer or external URL; not a canonical identity.';
COMMENT ON TABLE public.intelligence_evidence_edges IS
  'Many-to-many derivation and support graph from generated facts back to raw evidence.';
