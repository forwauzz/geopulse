-- Retrieval evaluation foundation (RE-002)
-- Service-role only tables for offline retrieval / answer-quality evaluation.

CREATE TABLE public.retrieval_eval_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_run_id UUID REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  rubric_version TEXT NOT NULL DEFAULT 'retrieval-foundation-v1',
  generator_version TEXT NOT NULL DEFAULT 'manual',
  prompt_set_name TEXT NOT NULL,
  overall_score NUMERIC(5,2),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.retrieval_eval_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.retrieval_eval_runs(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  expected_sources JSONB,
  expected_facts JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retrieval_eval_prompts_run_prompt_key_unique UNIQUE (run_id, prompt_key)
);

CREATE TABLE public.retrieval_eval_passages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.retrieval_eval_runs(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.retrieval_eval_prompts(id) ON DELETE CASCADE,
  scan_page_url TEXT,
  source_url TEXT,
  section_label TEXT,
  passage_text TEXT NOT NULL,
  rank INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.retrieval_eval_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.retrieval_eval_runs(id) ON DELETE CASCADE,
  prompt_id UUID NOT NULL REFERENCES public.retrieval_eval_prompts(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  cited_sources JSONB,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT retrieval_eval_answers_run_prompt_unique UNIQUE (run_id, prompt_id)
);

CREATE INDEX retrieval_eval_prompts_run_id_idx ON public.retrieval_eval_prompts (run_id);
CREATE INDEX retrieval_eval_passages_run_id_idx ON public.retrieval_eval_passages (run_id);
CREATE INDEX retrieval_eval_passages_prompt_id_idx ON public.retrieval_eval_passages (prompt_id);
CREATE INDEX retrieval_eval_answers_run_id_idx ON public.retrieval_eval_answers (run_id);

ALTER TABLE public.retrieval_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieval_eval_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieval_eval_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retrieval_eval_answers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.retrieval_eval_runs IS 'Offline retrieval-eval runs for prompt / passage / answer quality; service-role only';
COMMENT ON TABLE public.retrieval_eval_prompts IS 'Prompt set rows for a retrieval eval run; service-role only';
COMMENT ON TABLE public.retrieval_eval_passages IS 'Retrieved or candidate passages for a retrieval eval run; service-role only';
COMMENT ON TABLE public.retrieval_eval_answers IS 'Model answers and scored metrics for retrieval eval prompts; service-role only';
