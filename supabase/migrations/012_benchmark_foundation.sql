-- Benchmark / measurement foundation (BM-009)
-- Service-role only tables for internal benchmark runs, citations, and aggregate metrics.

CREATE TABLE public.benchmark_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  site_url TEXT,
  display_name TEXT,
  vertical TEXT,
  subvertical TEXT,
  geo_region TEXT,
  is_customer BOOLEAN NOT NULL DEFAULT false,
  is_competitor BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_domains_canonical_domain_unique UNIQUE (canonical_domain)
);

CREATE TABLE public.benchmark_query_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  vertical TEXT,
  version TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_query_sets_name_version_unique UNIQUE (name, version),
  CONSTRAINT benchmark_query_sets_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE TABLE public.benchmark_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_set_id UUID NOT NULL REFERENCES public.benchmark_query_sets(id) ON DELETE CASCADE,
  query_key TEXT NOT NULL,
  query_text TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  topic TEXT,
  weight NUMERIC(6,3) NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_queries_query_set_query_key_unique UNIQUE (query_set_id, query_key),
  CONSTRAINT benchmark_queries_intent_type_check CHECK (intent_type IN ('direct', 'comparative', 'discovery'))
);

CREATE TABLE public.benchmark_run_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_set_id UUID NOT NULL REFERENCES public.benchmark_query_sets(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  run_scope TEXT NOT NULL DEFAULT 'internal_benchmark',
  model_set_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_run_groups_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE public.query_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_group_id UUID NOT NULL REFERENCES public.benchmark_run_groups(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.benchmark_domains(id) ON DELETE CASCADE,
  query_id UUID NOT NULL REFERENCES public.benchmark_queries(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  auditor_model_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  response_text TEXT,
  response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT query_runs_run_group_domain_query_model_unique UNIQUE (run_group_id, domain_id, query_id, model_id),
  CONSTRAINT query_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped'))
);

CREATE TABLE public.query_citations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query_run_id UUID NOT NULL REFERENCES public.query_runs(id) ON DELETE CASCADE,
  cited_domain TEXT,
  cited_url TEXT,
  rank_position INTEGER,
  citation_type TEXT NOT NULL DEFAULT 'explicit_url',
  sentiment TEXT,
  confidence NUMERIC(5,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT query_citations_citation_type_check CHECK (
    citation_type IN ('explicit_url', 'explicit_domain', 'brand_mention', 'paraphrased_reference')
  ),
  CONSTRAINT query_citations_sentiment_check CHECK (
    sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'unknown')
  )
);

CREATE TABLE public.benchmark_domain_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_group_id UUID NOT NULL REFERENCES public.benchmark_run_groups(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.benchmark_domains(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  citation_rate NUMERIC(6,3),
  share_of_voice NUMERIC(6,3),
  query_coverage NUMERIC(6,3),
  inference_probability NUMERIC(6,3),
  drift_score NUMERIC(6,3),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_domain_metrics_run_group_domain_model_unique UNIQUE (run_group_id, domain_id, model_id)
);

CREATE INDEX benchmark_domains_vertical_idx
  ON public.benchmark_domains (vertical);

CREATE INDEX benchmark_domains_customer_created_at_idx
  ON public.benchmark_domains (is_customer, created_at DESC);

CREATE INDEX benchmark_query_sets_vertical_created_at_idx
  ON public.benchmark_query_sets (vertical, created_at DESC);

CREATE INDEX benchmark_queries_query_set_id_idx
  ON public.benchmark_queries (query_set_id);

CREATE INDEX benchmark_queries_intent_type_idx
  ON public.benchmark_queries (intent_type);

CREATE INDEX benchmark_run_groups_query_set_created_at_idx
  ON public.benchmark_run_groups (query_set_id, created_at DESC);

CREATE INDEX benchmark_run_groups_status_created_at_idx
  ON public.benchmark_run_groups (status, created_at DESC);

CREATE INDEX query_runs_run_group_created_at_idx
  ON public.query_runs (run_group_id, created_at DESC);

CREATE INDEX query_runs_domain_created_at_idx
  ON public.query_runs (domain_id, created_at DESC);

CREATE INDEX query_runs_query_created_at_idx
  ON public.query_runs (query_id, created_at DESC);

CREATE INDEX query_runs_model_created_at_idx
  ON public.query_runs (model_id, created_at DESC);

CREATE INDEX query_runs_status_created_at_idx
  ON public.query_runs (status, created_at DESC);

CREATE INDEX query_citations_query_run_id_idx
  ON public.query_citations (query_run_id);

CREATE INDEX query_citations_cited_domain_idx
  ON public.query_citations (cited_domain);

CREATE INDEX query_citations_cited_url_idx
  ON public.query_citations (cited_url);

CREATE INDEX benchmark_domain_metrics_run_group_created_at_idx
  ON public.benchmark_domain_metrics (run_group_id, created_at DESC);

CREATE INDEX benchmark_domain_metrics_domain_created_at_idx
  ON public.benchmark_domain_metrics (domain_id, created_at DESC);

CREATE INDEX benchmark_domain_metrics_model_created_at_idx
  ON public.benchmark_domain_metrics (model_id, created_at DESC);

ALTER TABLE public.benchmark_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_query_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_run_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_domain_metrics ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER benchmark_domains_updated_at
  BEFORE UPDATE ON public.benchmark_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.benchmark_domains IS 'Canonical site identity for internal benchmark / measurement work; service-role only.';
COMMENT ON TABLE public.benchmark_query_sets IS 'Versioned internal query bundles for benchmark runs; service-role only.';
COMMENT ON TABLE public.benchmark_queries IS 'Benchmark queries within a query set; service-role only.';
COMMENT ON TABLE public.benchmark_run_groups IS 'Batch identity for benchmark execution across domains/models/query sets; service-role only.';
COMMENT ON TABLE public.query_runs IS 'Raw benchmark executions for one domain, one query, and one model lane; service-role only.';
COMMENT ON TABLE public.query_citations IS 'Parsed citation or mention outcomes for benchmark query runs; service-role only.';
COMMENT ON TABLE public.benchmark_domain_metrics IS 'Computed benchmark metrics per domain, run group, and model lane; service-role only.';

COMMENT ON COLUMN public.benchmark_domains.canonical_domain IS 'Normalized grouping key used to join benchmark and audit identities.';
COMMENT ON COLUMN public.benchmark_query_sets.version IS 'Version boundary for a benchmark query set.';
COMMENT ON COLUMN public.benchmark_run_groups.model_set_version IS 'Version label for the model lane configuration used in this run group.';
COMMENT ON COLUMN public.query_runs.auditor_model_id IS 'Optional analysis-model identifier if evaluation and target model later diverge.';
COMMENT ON COLUMN public.query_runs.response_metadata IS 'Provider/model/runtime metadata captured alongside the raw response.';
COMMENT ON COLUMN public.query_citations.citation_type IS 'Parsed citation class such as explicit URL, domain mention, or brand mention.';
COMMENT ON COLUMN public.benchmark_domain_metrics.metrics IS 'Metric detail payload beyond the first fixed benchmark columns.';
