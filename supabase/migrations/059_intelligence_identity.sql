-- INT-002: additive canonical domain/page identity for the GEO intelligence plane.
-- Existing operational foreign keys remain authoritative during rollout.

CREATE TABLE public.intelligence_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_host TEXT NOT NULL,
  display_name TEXT,
  vertical TEXT,
  subvertical TEXT,
  geography JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_state TEXT NOT NULL DEFAULT 'verified',
  normalization_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_domains_host_unique UNIQUE (normalized_host),
  CONSTRAINT intelligence_domains_review_state_check CHECK (
    review_state IN ('verified', 'needs_review', 'retired')
  )
);

CREATE TABLE public.intelligence_domain_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.intelligence_domains(id) ON DELETE CASCADE,
  alias_host TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'observed_alias',
  review_state TEXT NOT NULL DEFAULT 'verified',
  observed_from TEXT,
  normalization_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_domain_aliases_relationship_check CHECK (
    relationship IN ('canonical', 'observed_alias', 'redirect', 'rebrand')
  ),
  CONSTRAINT intelligence_domain_aliases_review_state_check CHECK (
    review_state IN ('verified', 'needs_review', 'rejected')
  ),
  CONSTRAINT intelligence_domain_aliases_domain_host_unique UNIQUE (domain_id, alias_host)
);

CREATE TABLE public.intelligence_domain_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.intelligence_domains(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id UUID,
  visibility TEXT NOT NULL DEFAULT 'internal',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_domain_owners_type_check CHECK (
    owner_type IN ('startup_workspace', 'agency_account', 'agency_client', 'user', 'internal_benchmark')
  ),
  CONSTRAINT intelligence_domain_owners_visibility_check CHECK (
    visibility IN ('tenant', 'internal', 'shared')
  ),
  CONSTRAINT intelligence_domain_owners_shape_check CHECK (
    (owner_type = 'internal_benchmark' AND owner_id IS NULL)
    OR (owner_type <> 'internal_benchmark' AND owner_id IS NOT NULL)
  )
);

CREATE TABLE public.intelligence_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.intelligence_domains(id) ON DELETE CASCADE,
  normalized_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_pages_normalized_url_unique UNIQUE (normalized_url)
);

CREATE TABLE public.intelligence_source_identity_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  canonical_domain_id UUID REFERENCES public.intelligence_domains(id) ON DELETE SET NULL,
  canonical_page_id UUID REFERENCES public.intelligence_pages(id) ON DELETE SET NULL,
  mapping_status TEXT NOT NULL,
  unmapped_reason TEXT,
  observed_host TEXT,
  observed_url TEXT,
  normalization_version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_source_identity_maps_status_check CHECK (
    mapping_status IN ('mapped', 'unmapped', 'needs_review')
  ),
  CONSTRAINT intelligence_source_identity_maps_shape_check CHECK (
    (mapping_status = 'mapped' AND canonical_domain_id IS NOT NULL AND unmapped_reason IS NULL)
    OR (mapping_status <> 'mapped' AND unmapped_reason IS NOT NULL)
  ),
  CONSTRAINT intelligence_source_identity_maps_source_unique UNIQUE (source_kind, source_id)
);

CREATE INDEX intelligence_domain_aliases_host_idx
  ON public.intelligence_domain_aliases (alias_host);
CREATE INDEX intelligence_domain_owners_domain_idx
  ON public.intelligence_domain_owners (domain_id, owner_type);
CREATE UNIQUE INDEX intelligence_domain_owners_unique_idx
  ON public.intelligence_domain_owners (domain_id, owner_type, owner_id)
  NULLS NOT DISTINCT;
CREATE INDEX intelligence_pages_domain_idx
  ON public.intelligence_pages (domain_id);
CREATE INDEX intelligence_source_identity_maps_domain_idx
  ON public.intelligence_source_identity_maps (canonical_domain_id, source_kind);
CREATE INDEX intelligence_source_identity_maps_status_idx
  ON public.intelligence_source_identity_maps (mapping_status, source_kind);

CREATE TRIGGER intelligence_domains_updated_at
  BEFORE UPDATE ON public.intelligence_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_domain_aliases_updated_at
  BEFORE UPDATE ON public.intelligence_domain_aliases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_domain_owners_updated_at
  BEFORE UPDATE ON public.intelligence_domain_owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_pages_updated_at
  BEFORE UPDATE ON public.intelligence_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER intelligence_source_identity_maps_updated_at
  BEFORE UPDATE ON public.intelligence_source_identity_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- No anon/authenticated policies are created. The identity layer is service-role
-- only until a later API projects tenant-filtered views through ownership links.
ALTER TABLE public.intelligence_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_domain_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_domain_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_source_identity_maps ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.intelligence_domains IS
  'Canonical domain identities indexed from operational sources; additive and service-role only.';
COMMENT ON TABLE public.intelligence_domain_aliases IS
  'Traceable aliases, redirects, and rebrands. Ambiguous aliases require review.';
COMMENT ON TABLE public.intelligence_domain_owners IS
  'Explicit tenant/internal ownership and visibility links for canonical domains.';
COMMENT ON TABLE public.intelligence_pages IS
  'Canonical page URLs retaining the first observed original URL.';
COMMENT ON TABLE public.intelligence_source_identity_maps IS
  'Idempotent source-record mapping to canonical identity or an explicit unmapped reason.';
