-- INT-009: metadata-only bounded retrieval experiment. Vectors are not canonical product data.

CREATE TABLE public.intelligence_retrieval_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_version TEXT NOT NULL,
  fixture_version TEXT NOT NULL,
  fixture_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  top_k INTEGER NOT NULL,
  document_count INTEGER NOT NULL,
  task_count INTEGER NOT NULL,
  keyword_metrics JSONB NOT NULL,
  semantic_metrics JSONB NOT NULL,
  semantic_improvement NUMERIC NOT NULL,
  access_control_accuracy NUMERIC NOT NULL,
  estimated_cost_usd NUMERIC NOT NULL,
  threshold_passed BOOLEAN NOT NULL,
  recommendation TEXT NOT NULL,
  recommendation_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_retrieval_experiment_unique
    UNIQUE (experiment_version, fixture_hash, provider, model, provider_version),
  CONSTRAINT intelligence_retrieval_recommendation_check
    CHECK (recommendation IN ('go', 'no_go'))
);

CREATE TABLE public.intelligence_embedding_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stable_embedding_id TEXT NOT NULL UNIQUE,
  experiment_id UUID NOT NULL REFERENCES public.intelligence_retrieval_experiments(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_text_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  visibility TEXT NOT NULL,
  tenant_type TEXT,
  tenant_id UUID,
  embedded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_embedding_manifest_source_unique
    UNIQUE (evidence_id, source_text_hash, provider, model, provider_version),
  CONSTRAINT intelligence_embedding_manifest_privacy_check CHECK (
    visibility <> 'private_tenant' OR (tenant_type IS NOT NULL AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE public.intelligence_retrieval_task_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.intelligence_retrieval_experiments(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  retrieval_method TEXT NOT NULL,
  structured_filters JSONB NOT NULL,
  ranked_evidence_ids JSONB NOT NULL,
  ranked_source_ids JSONB NOT NULL,
  precision_at_k NUMERIC NOT NULL,
  recall_at_k NUMERIC NOT NULL,
  reciprocal_rank NUMERIC NOT NULL,
  latency_ms NUMERIC NOT NULL,
  access_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_retrieval_task_result_unique
    UNIQUE (experiment_id, task_id, retrieval_method),
  CONSTRAINT intelligence_retrieval_method_check
    CHECK (retrieval_method IN ('keyword_structured', 'semantic_structured'))
);

CREATE INDEX intelligence_embedding_manifest_evidence_idx
  ON public.intelligence_embedding_manifests (evidence_id, provider, model);
CREATE INDEX intelligence_retrieval_task_experiment_idx
  ON public.intelligence_retrieval_task_results (experiment_id, task_id);

ALTER TABLE public.intelligence_retrieval_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_embedding_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_retrieval_task_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.intelligence_retrieval_experiments FROM anon, authenticated;
REVOKE ALL ON public.intelligence_embedding_manifests FROM anon, authenticated;
REVOKE ALL ON public.intelligence_retrieval_task_results FROM anon, authenticated;

COMMENT ON TABLE public.intelligence_retrieval_experiments IS
  'Bounded baseline-versus-semantic evaluations; no production reasoning feature may depend on them.';
COMMENT ON TABLE public.intelligence_embedding_manifests IS
  'Idempotent embedding metadata only. Vector storage remains a separate go/no-go decision.';
