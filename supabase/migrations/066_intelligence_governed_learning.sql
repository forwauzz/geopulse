-- INT-011: governed learning, holdout evaluation, shadow promotion and reversible policy history.

CREATE TABLE public.intelligence_learning_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern_key TEXT NOT NULL UNIQUE,
  metric_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  effect_size NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL CHECK (sample_size > 0),
  cohort_definition JSONB NOT NULL CHECK (jsonb_typeof(cohort_definition) = 'object' AND cohort_definition <> '{}'::jsonb),
  lane_ids UUID[] NOT NULL CHECK (cardinality(lane_ids) > 0),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  limitations JSONB NOT NULL CHECK (jsonb_typeof(limitations) = 'array' AND jsonb_array_length(limitations) > 0),
  evidence_ids UUID[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  compatible_run_ids UUID[] NOT NULL CHECK (cardinality(compatible_run_ids) > 1),
  quality_states TEXT[] NOT NULL CHECK (
    cardinality(quality_states) > 0
    AND quality_states <@ ARRAY['valid', 'valid_partial']::TEXT[]
  ),
  compatibility_label TEXT NOT NULL CHECK (compatibility_label IN ('exact', 'exact_lane_version')),
  causality_label TEXT NOT NULL DEFAULT 'observational_association_not_causation' CHECK (
    causality_label IN (
      'observational_association_not_causation',
      'randomized_holdout_supports_causal_inference'
    )
  ),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT intelligence_learning_pattern_status_check
    CHECK (status IN ('candidate', 'accepted', 'rejected'))
);

CREATE TABLE public.intelligence_methodology_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern_id UUID NOT NULL REFERENCES public.intelligence_learning_patterns(id),
  hypothesis TEXT NOT NULL,
  policy_kind TEXT NOT NULL CHECK (policy_kind IN ('scoring', 'recommendation', 'prompt', 'parser', 'metric')),
  candidate_version TEXT NOT NULL,
  previous_version TEXT NOT NULL,
  customer_affecting BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'proposed',
  holdout_definition JSONB NOT NULL CHECK (jsonb_typeof(holdout_definition) = 'object' AND holdout_definition <> '{}'::jsonb),
  holdout_passed BOOLEAN,
  shadow_passed BOOLEAN,
  regression_criteria JSONB NOT NULL CHECK (jsonb_typeof(regression_criteria) = 'array' AND jsonb_array_length(regression_criteria) > 0),
  rollback_criteria JSONB NOT NULL CHECK (jsonb_typeof(rollback_criteria) = 'array' AND jsonb_array_length(rollback_criteria) > 0),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  restore_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_kind, candidate_version),
  CONSTRAINT intelligence_methodology_status_check CHECK (
    status IN ('proposed', 'holdout_passed', 'holdout_failed', 'approved', 'rejected', 'shadow', 'promoted', 'rolled_back')
  ),
  CONSTRAINT intelligence_methodology_holdout_gate CHECK (
    status NOT IN ('holdout_passed', 'approved', 'shadow', 'promoted') OR holdout_passed = true
  ),
  CONSTRAINT intelligence_methodology_shadow_gate CHECK (
    status <> 'promoted' OR shadow_passed = true
  ),
  CONSTRAINT intelligence_methodology_human_gate CHECK (
    NOT customer_affecting OR status NOT IN ('approved', 'shadow', 'promoted', 'rolled_back') OR approved_by IS NOT NULL
  ),
  CONSTRAINT intelligence_methodology_rollback_target CHECK (
    status <> 'rolled_back' OR restore_version = previous_version
  )
);

CREATE TABLE public.intelligence_methodology_eval_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES public.intelligence_methodology_proposals(id) ON DELETE CASCADE,
  evaluation_stage TEXT NOT NULL CHECK (evaluation_stage IN ('baseline', 'holdout', 'shadow', 'regression')),
  eval_type TEXT NOT NULL CHECK (eval_type IN ('report', 'retrieval', 'custom_holdout')),
  eval_run_id UUID NOT NULL,
  rubric_version TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  source_snapshot TEXT NOT NULL,
  passed BOOLEAN,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, evaluation_stage, eval_type, eval_run_id)
);

CREATE TABLE public.intelligence_policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_kind TEXT NOT NULL CHECK (policy_kind IN ('scoring', 'recommendation', 'prompt', 'parser', 'metric')),
  policy_version TEXT NOT NULL,
  previous_policy_version TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'shadow', 'active', 'rejected', 'retired', 'rolled_back')
  ),
  definition JSONB NOT NULL,
  proposal_id UUID REFERENCES public.intelligence_methodology_proposals(id),
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_kind, policy_version),
  FOREIGN KEY (policy_kind, previous_policy_version)
    REFERENCES public.intelligence_policy_versions(policy_kind, policy_version),
  CONSTRAINT intelligence_policy_active_proposal_check
    CHECK (status <> 'active' OR proposal_id IS NOT NULL)
);

CREATE TABLE public.intelligence_methodology_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES public.intelligence_methodology_proposals(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'human')),
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_intelligence_methodology_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'intelligence methodology events are append-only';
END;
$$;

CREATE TRIGGER intelligence_methodology_events_immutable
  BEFORE UPDATE OR DELETE ON public.intelligence_methodology_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_intelligence_methodology_event_mutation();

CREATE OR REPLACE FUNCTION public.enforce_intelligence_methodology_stage_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('shadow', 'promoted') AND NOT EXISTS (
    SELECT 1
    FROM public.intelligence_methodology_eval_links link
    WHERE link.proposal_id = NEW.id
      AND link.evaluation_stage = 'holdout'
      AND link.passed = true
  ) THEN
    RAISE EXCEPTION 'passing holdout evaluation lineage is required';
  END IF;
  IF NEW.status = 'promoted' AND NOT EXISTS (
    SELECT 1
    FROM public.intelligence_methodology_eval_links link
    WHERE link.proposal_id = NEW.id
      AND link.evaluation_stage = 'shadow'
      AND link.passed = true
  ) THEN
    RAISE EXCEPTION 'passing shadow evaluation lineage is required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER intelligence_methodology_stage_evidence_gate
  BEFORE INSERT OR UPDATE OF status ON public.intelligence_methodology_proposals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intelligence_methodology_stage_evidence();

CREATE OR REPLACE FUNCTION public.enforce_intelligence_policy_activation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' AND NOT EXISTS (
    SELECT 1
    FROM public.intelligence_methodology_proposals proposal
    WHERE proposal.id = NEW.proposal_id
      AND proposal.status = 'promoted'
      AND proposal.holdout_passed = true
      AND proposal.shadow_passed = true
      AND (NOT proposal.customer_affecting OR proposal.approved_by IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'active policy requires a promoted, fully gated methodology proposal';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER intelligence_policy_activation_gate
  BEFORE INSERT OR UPDATE OF status ON public.intelligence_policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intelligence_policy_activation();

CREATE INDEX intelligence_learning_patterns_metric_idx
  ON public.intelligence_learning_patterns (metric_key, created_at DESC);
CREATE INDEX intelligence_methodology_proposals_status_idx
  ON public.intelligence_methodology_proposals (status, created_at DESC);
CREATE INDEX intelligence_methodology_events_proposal_idx
  ON public.intelligence_methodology_events (proposal_id, created_at);
CREATE INDEX intelligence_policy_versions_status_idx
  ON public.intelligence_policy_versions (policy_kind, status, created_at DESC);
CREATE UNIQUE INDEX intelligence_policy_versions_one_active_idx
  ON public.intelligence_policy_versions (policy_kind)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.rollback_intelligence_policy(
  requested_policy_kind TEXT,
  current_policy_version TEXT,
  human_actor_id UUID,
  rollback_reason TEXT
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  prior_version TEXT;
  methodology_proposal_id UUID;
BEGIN
  IF rollback_reason IS NULL OR btrim(rollback_reason) = '' THEN
    RAISE EXCEPTION 'rollback reason is required';
  END IF;
  SELECT previous_policy_version, proposal_id
  INTO prior_version, methodology_proposal_id
  FROM public.intelligence_policy_versions
  WHERE policy_kind = requested_policy_kind
    AND policy_version = current_policy_version
    AND status = 'active'
  FOR UPDATE;
  IF prior_version IS NULL THEN
    RAISE EXCEPTION 'active policy or rollback target not found';
  END IF;

  UPDATE public.intelligence_policy_versions
  SET status = 'rolled_back', retired_at = now()
  WHERE policy_kind = requested_policy_kind
    AND policy_version = current_policy_version;
  UPDATE public.intelligence_policy_versions
  SET status = 'active', activated_at = now(), retired_at = NULL
  WHERE policy_kind = requested_policy_kind
    AND policy_version = prior_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'previous policy version not found';
  END IF;

  UPDATE public.intelligence_methodology_proposals
  SET status = 'rolled_back', restore_version = prior_version, updated_at = now()
  WHERE id = methodology_proposal_id;
  INSERT INTO public.intelligence_methodology_events (
    proposal_id, from_status, to_status, actor_type, actor_id, reason,
    metadata
  ) VALUES (
    methodology_proposal_id, 'promoted', 'rolled_back', 'human',
    human_actor_id::text, rollback_reason,
    jsonb_build_object(
      'rolled_back_version', current_policy_version,
      'restored_version', prior_version,
      'policy_kind', requested_policy_kind
    )
  );
  RETURN prior_version;
END;
$$;

ALTER TABLE public.intelligence_learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_methodology_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_methodology_eval_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligence_methodology_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.intelligence_learning_patterns FROM anon, authenticated;
REVOKE ALL ON public.intelligence_methodology_proposals FROM anon, authenticated;
REVOKE ALL ON public.intelligence_methodology_eval_links FROM anon, authenticated;
REVOKE ALL ON public.intelligence_policy_versions FROM anon, authenticated;
REVOKE ALL ON public.intelligence_methodology_events FROM anon, authenticated;

COMMENT ON TABLE public.intelligence_learning_patterns IS
  'Evidence-backed candidate patterns; quarantined and incompatible source runs are rejected by schema and application gates.';
COMMENT ON TABLE public.intelligence_methodology_eval_links IS
  'Immutable references to original report, retrieval, holdout and regression eval lineage; source eval rows are never rewritten.';
COMMENT ON TABLE public.intelligence_policy_versions IS
  'Version registry. Rollback activates a previous version while historical measurements retain their recorded policy version.';
COMMENT ON TABLE public.intelligence_methodology_events IS
  'Append-only human/system audit trail for approval, shadow, promotion, rejection and rollback.';
COMMENT ON FUNCTION public.rollback_intelligence_policy(TEXT, TEXT, UUID, TEXT) IS
  'Atomically restores the previous active policy version and records rollback without rewriting historical measurements.';
