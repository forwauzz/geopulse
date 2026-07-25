-- INT-007: deterministic, lineage-preserving analytical marts.

CREATE TABLE public.intelligence_metric_definitions (
  metric_key TEXT NOT NULL,
  dictionary_version TEXT NOT NULL,
  display_name TEXT NOT NULL,
  numerator_definition TEXT NOT NULL,
  denominator_definition TEXT NOT NULL,
  minimum_sample_size INTEGER NOT NULL DEFAULT 1,
  compatibility_rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_key, dictionary_version),
  CONSTRAINT intelligence_metric_definition_status_check CHECK (status IN ('active', 'retired'))
);

INSERT INTO public.intelligence_metric_definitions (
  metric_key, dictionary_version, display_name, numerator_definition,
  denominator_definition, minimum_sample_size, compatibility_rule
) VALUES
  ('citation_rate', 'intelligence-metrics-v1', 'Citation rate',
   'qualifying responses with at least one parsed citation',
   'qualifying completed responses', 1, 'same lane, window protocol, model, run mode, parser and metric versions'),
  ('coverage', 'intelligence-metrics-v1', 'Response coverage',
   'valid or valid-partial responses', 'expected query/model/mode cells', 1,
   'same lane and window protocol'),
  ('share_of_voice', 'intelligence-metrics-v1', 'Citation share of voice',
   'citations attributed to the measured canonical domain',
   'all parsed citations in qualifying responses', 1,
   'same lane, model, run mode, citation parser and domain normalization version'),
  ('intervention_delta', 'intelligence-metrics-v1', 'Intervention citation-rate delta',
   'compatible post-intervention citation rate minus compatible pre-intervention citation rate',
   'one exact compatible before/after pair', 2,
   'exact same lane, versions, query, model, and run mode; observational association only');

ALTER TABLE public.intelligence_metric_definitions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.intelligence_mart_domain_query_model_outcomes_all
WITH (security_invoker = true) AS
WITH latest_quality AS (
  SELECT DISTINCT ON (source_kind, source_id)
    source_kind, source_id, quality_state, reason_codes, classified_at
  FROM public.intelligence_run_quality_classifications
  ORDER BY source_kind, source_id, classified_at DESC
),
latest_window AS (
  SELECT DISTINCT ON (source_kind, source_id)
    source_kind, source_id, eligible, coverage_ratio, anomaly_codes, assessed_at
  FROM public.intelligence_window_quality_assessments
  ORDER BY source_kind, source_id, assessed_at DESC
),
citation_facts AS (
  SELECT
    query_run_id,
    count(*)::integer AS citation_count,
    array_agg(id ORDER BY id) AS citation_ids,
    array_agg(lower(cited_domain)) FILTER (WHERE cited_domain IS NOT NULL) AS cited_domains
  FROM public.query_citations
  GROUP BY query_run_id
),
evidence_facts AS (
  SELECT
    source_kind, source_id,
    array_agg(id ORDER BY id) AS evidence_ids
  FROM public.intelligence_evidence_objects
  GROUP BY source_kind, source_id
)
SELECT
  qr.id AS query_run_id,
  ir.id AS canonical_run_id,
  ir.canonical_domain_id,
  qr.query_id,
  qr.model_id,
  COALESCE(qr.response_metadata->>'run_mode', brg.metadata->>'run_mode', '<missing>') AS run_mode,
  ir.lane_id,
  ir.window_id,
  ir.versions,
  qr.executed_at AS observed_at,
  COALESCE(lq.quality_state, ir.quality_state, 'incomplete') AS quality_state,
  COALESCE(lq.reason_codes, '[]'::jsonb) AS quality_reason_codes,
  COALESCE(lw.eligible, false) AS eligible,
  COALESCE(lw.coverage_ratio, 0) AS window_coverage,
  COALESCE(lw.anomaly_codes, '[]'::jsonb) AS anomaly_codes,
  CASE
    WHEN COALESCE(lq.quality_state, ir.quality_state) IN ('valid', 'valid_partial')
      AND qr.response_text IS NOT NULL THEN 'available'
    ELSE 'not_available'
  END AS metric_status,
  CASE
    WHEN COALESCE(lq.quality_state, ir.quality_state) IN ('valid', 'valid_partial')
      AND qr.response_text IS NOT NULL
      THEN CASE WHEN COALESCE(cf.citation_count, 0) > 0 THEN 1.0 ELSE 0.0 END
    ELSE NULL
  END AS citation_rate,
  CASE
    WHEN COALESCE(cf.citation_count, 0) > 0
      THEN (
        SELECT count(*)::numeric / cf.citation_count
        FROM unnest(cf.cited_domains) AS cited_domain
        WHERE cited_domain = d.normalized_host
      )
    ELSE NULL
  END AS share_of_voice,
  COALESCE(cf.citation_count, 0) AS citation_count,
  1 AS sample_size,
  CASE
    WHEN COALESCE(lq.quality_state, ir.quality_state) IN ('valid', 'valid_partial')
      THEN 0.0 ELSE NULL
  END AS uncertainty_low,
  CASE
    WHEN COALESCE(lq.quality_state, ir.quality_state) IN ('valid', 'valid_partial')
      THEN 1.0 ELSE NULL
  END AS uncertainty_high,
  ARRAY[ir.id] AS source_run_ids,
  COALESCE(ef.evidence_ids, '{}'::uuid[]) AS source_evidence_ids,
  COALESCE(cf.citation_ids, '{}'::uuid[]) AS source_citation_ids,
  GREATEST(qr.created_at, COALESCE(lq.classified_at, qr.created_at), COALESCE(lw.assessed_at, qr.created_at)) AS refreshed_at,
  EXTRACT(EPOCH FROM (now() - qr.created_at)) / 3600.0 AS freshness_hours,
  'intelligence-metrics-v1'::text AS metric_dictionary_version,
  'exact_lane_version'::text AS comparison_label
FROM public.query_runs qr
JOIN public.benchmark_run_groups brg ON brg.id = qr.run_group_id
JOIN public.intelligence_runs ir
  ON ir.source_kind = 'benchmark_query_run' AND ir.source_id = qr.id::text
LEFT JOIN public.intelligence_domains d ON d.id = ir.canonical_domain_id
LEFT JOIN latest_quality lq
  ON lq.source_kind = 'benchmark_query_run' AND lq.source_id = qr.id::text
LEFT JOIN latest_window lw
  ON lw.source_kind = 'benchmark_measurement_window'
  AND lw.source_id = concat_ws(
    ':',
    COALESCE(brg.metadata->>'schedule_window_utc', 'legacy:' || brg.id::text),
    COALESCE(brg.metadata->>'domain_id', '<unknown-domain>'),
    brg.query_set_id::text,
    COALESCE(brg.metadata->>'model_id', brg.model_set_version, '<unknown-model>')
  )
LEFT JOIN citation_facts cf ON cf.query_run_id = qr.id
LEFT JOIN evidence_facts ef
  ON ef.source_kind = 'benchmark_query_run' AND ef.source_id = qr.id::text;

CREATE OR REPLACE VIEW public.intelligence_mart_domain_query_model_outcomes
WITH (security_invoker = true) AS
SELECT *
FROM public.intelligence_mart_domain_query_model_outcomes_all
WHERE eligible
  AND metric_status = 'available'
  AND quality_state IN ('valid', 'valid_partial');

CREATE OR REPLACE VIEW public.intelligence_mart_domain_measurement_timeline
WITH (security_invoker = true) AS
SELECT
  canonical_domain_id,
  observed_at,
  lane_id,
  window_id,
  query_id,
  model_id,
  run_mode,
  citation_rate,
  share_of_voice,
  window_coverage AS coverage,
  sample_size,
  uncertainty_low,
  uncertainty_high,
  source_run_ids,
  source_evidence_ids,
  freshness_hours,
  metric_dictionary_version,
  comparison_label
FROM public.intelligence_mart_domain_query_model_outcomes;

CREATE OR REPLACE VIEW public.intelligence_mart_lane_window_health
WITH (security_invoker = true) AS
SELECT
  iwa.lane_id,
  iwa.window_id,
  iwa.source_kind,
  iwa.source_id,
  iwa.eligible,
  iwa.coverage_ratio AS coverage,
  iwa.expected_cell_count AS sample_size,
  iwa.valid_cell_count,
  iwa.missing_cells,
  iwa.anomaly_codes,
  iwa.source_snapshot,
  ARRAY(
    SELECT ir.id
    FROM public.intelligence_runs ir
    WHERE ir.lane_id = iwa.lane_id
      AND (iwa.window_id IS NULL OR ir.window_id = iwa.window_id)
    ORDER BY ir.id
  ) AS source_run_ids,
  '{}'::uuid[] AS source_evidence_ids,
  iwa.assessed_at AS refreshed_at,
  EXTRACT(EPOCH FROM (now() - iwa.assessed_at)) / 3600.0 AS freshness_hours,
  CASE WHEN iwa.expected_cell_count > 0 THEN 'available' ELSE 'not_available' END AS metric_status,
  NULL::numeric AS uncertainty_low,
  NULL::numeric AS uncertainty_high,
  'intelligence-metrics-v1'::text AS metric_dictionary_version,
  'exact_lane_version'::text AS comparison_label
FROM public.intelligence_window_quality_assessments iwa;

CREATE OR REPLACE VIEW public.intelligence_mart_domain_page_feature_snapshots_all
WITH (security_invoker = true) AS
WITH latest_quality AS (
  SELECT DISTINCT ON (source_kind, source_id)
    source_kind, source_id, quality_state, reason_codes, classified_at
  FROM public.intelligence_run_quality_classifications
  ORDER BY source_kind, source_id, classified_at DESC
)
SELECT
  ir.canonical_domain_id,
  ir.canonical_page_id,
  sp.id AS scan_page_id,
  ir.id AS canonical_run_id,
  ir.lane_id,
  ir.window_id,
  sp.normalized_url,
  sp.status AS original_status,
  COALESCE(lq.quality_state, ir.quality_state, 'incomplete') AS quality_state,
  COALESCE(lq.reason_codes, '[]'::jsonb) AS quality_reason_codes,
  CASE
    WHEN COALESCE(lq.quality_state, ir.quality_state) IN ('valid', 'valid_partial', 'complete')
      THEN true ELSE false
  END AS eligible,
  sp.issues_json AS feature_snapshot,
  CASE WHEN sp.issues_json IS NULL THEN 'not_available' ELSE 'available' END AS metric_status,
  CASE WHEN sp.issues_json IS NULL THEN 0 ELSE 1 END AS sample_size,
  ARRAY[ir.id] AS source_run_ids,
  COALESCE(array_agg(ieo.id) FILTER (WHERE ieo.id IS NOT NULL), '{}'::uuid[]) AS source_evidence_ids,
  sp.created_at AS observed_at,
  EXTRACT(EPOCH FROM (now() - sp.created_at)) / 3600.0 AS freshness_hours,
  NULL::numeric AS uncertainty_low,
  NULL::numeric AS uncertainty_high,
  'intelligence-metrics-v1'::text AS metric_dictionary_version,
  'exact_lane_version'::text AS comparison_label
FROM public.scan_pages sp
JOIN public.intelligence_runs ir
  ON ir.source_kind = 'page_scan' AND ir.source_id = sp.id::text
LEFT JOIN latest_quality lq
  ON lq.source_kind = 'page_scan' AND lq.source_id = sp.id::text
LEFT JOIN public.intelligence_evidence_objects ieo
  ON ieo.source_kind = 'page_scan' AND ieo.source_id = sp.id::text
GROUP BY ir.canonical_domain_id, ir.canonical_page_id, sp.id, ir.id, ir.lane_id,
  ir.window_id, lq.quality_state, lq.reason_codes;

CREATE OR REPLACE VIEW public.intelligence_mart_domain_page_feature_snapshots
WITH (security_invoker = true) AS
SELECT *
FROM public.intelligence_mart_domain_page_feature_snapshots_all
WHERE eligible AND metric_status = 'available';

CREATE OR REPLACE VIEW public.intelligence_mart_intervention_outcomes
WITH (security_invoker = true) AS
WITH recommendation_lifecycle AS (
  SELECT
    sr.*,
    min(e.created_at) FILTER (WHERE e.to_status = 'approved') AS approved_at,
    min(e.created_at) FILTER (WHERE e.to_status IN ('shipped', 'validated')) AS shipped_at
  FROM public.startup_recommendations sr
  LEFT JOIN public.startup_recommendation_status_events e ON e.recommendation_id = sr.id
  GROUP BY sr.id
),
execution AS (
  SELECT
    recommendation_id,
    min(completed_at) FILTER (WHERE status = 'merged') AS merged_at,
    array_agg(id ORDER BY id) FILTER (WHERE status = 'merged') AS merged_pr_run_ids
  FROM public.startup_agent_pr_runs
  WHERE recommendation_id IS NOT NULL
  GROUP BY recommendation_id
),
verification AS (
  SELECT
    recommendation_id,
    min(updated_at) FILTER (WHERE task_kind = 'verification' AND status = 'done') AS verified_at,
    array_agg(id ORDER BY id) FILTER (WHERE task_kind = 'verification' AND status = 'done') AS verification_task_ids
  FROM public.startup_implementation_plan_tasks
  WHERE recommendation_id IS NOT NULL
  GROUP BY recommendation_id
)
SELECT
  r.id AS recommendation_id,
  sim.canonical_domain_id,
  r.startup_workspace_id,
  r.approved_at,
  COALESCE(r.shipped_at, ex.merged_at) AS intervention_at,
  ex.merged_at,
  v.verified_at,
  before_measurement.observed_at AS before_observed_at,
  after_measurement.observed_at AS after_observed_at,
  before_measurement.lane_id,
  before_measurement.window_id AS before_window_id,
  after_measurement.window_id AS after_window_id,
  before_measurement.query_id,
  before_measurement.model_id,
  before_measurement.run_mode,
  CASE
    WHEN before_measurement.query_run_id IS NOT NULL AND after_measurement.query_run_id IS NOT NULL
      THEN 'available' ELSE 'not_available'
  END AS metric_status,
  before_measurement.citation_rate AS before_citation_rate,
  after_measurement.citation_rate AS after_citation_rate,
  CASE
    WHEN before_measurement.query_run_id IS NOT NULL AND after_measurement.query_run_id IS NOT NULL
      THEN after_measurement.citation_rate - before_measurement.citation_rate
    ELSE NULL
  END AS citation_rate_delta,
  CASE
    WHEN before_measurement.observed_at IS NOT NULL AND after_measurement.observed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (after_measurement.observed_at - before_measurement.observed_at)) / 3600.0
    ELSE NULL
  END AS elapsed_hours,
  CASE
    WHEN before_measurement.query_run_id IS NOT NULL AND after_measurement.query_run_id IS NOT NULL
      THEN before_measurement.sample_size + after_measurement.sample_size
    ELSE 0
  END AS sample_size,
  NULL::numeric AS uncertainty_low,
  NULL::numeric AS uncertainty_high,
  COALESCE(before_measurement.source_run_ids, '{}'::uuid[]) ||
    COALESCE(after_measurement.source_run_ids, '{}'::uuid[]) AS source_run_ids,
  COALESCE(before_measurement.source_evidence_ids, '{}'::uuid[]) ||
    COALESCE(after_measurement.source_evidence_ids, '{}'::uuid[]) AS source_evidence_ids,
  COALESCE(ex.merged_pr_run_ids, '{}'::uuid[]) AS implementation_run_ids,
  COALESCE(v.verification_task_ids, '{}'::uuid[]) AS verification_task_ids,
  (before_measurement.query_run_id IS NOT NULL AND after_measurement.query_run_id IS NOT NULL) AS eligible,
  CASE
    WHEN before_measurement.query_run_id IS NOT NULL AND after_measurement.query_run_id IS NOT NULL
      THEN 'exact_lane_version' ELSE 'not_available'
  END AS comparison_label,
  'observational_association_not_causation'::text AS causality_label,
  'intelligence-metrics-v1'::text AS metric_dictionary_version,
  now() AS refreshed_at,
  EXTRACT(EPOCH FROM (now() - COALESCE(after_measurement.observed_at, r.created_at))) / 3600.0 AS freshness_hours
FROM recommendation_lifecycle r
LEFT JOIN public.intelligence_source_identity_maps sim
  ON sim.source_kind = 'recommendation' AND sim.source_id = r.id::text
LEFT JOIN execution ex ON ex.recommendation_id = r.id
LEFT JOIN verification v ON v.recommendation_id = r.id
LEFT JOIN LATERAL (
  SELECT outcome.*
  FROM public.intelligence_mart_domain_query_model_outcomes outcome
  WHERE outcome.canonical_domain_id = sim.canonical_domain_id
    AND outcome.observed_at < COALESCE(r.shipped_at, ex.merged_at)
  ORDER BY outcome.observed_at DESC
  LIMIT 1
) before_measurement ON true
LEFT JOIN LATERAL (
  SELECT outcome.*
  FROM public.intelligence_mart_domain_query_model_outcomes outcome
  WHERE outcome.canonical_domain_id = sim.canonical_domain_id
    AND outcome.observed_at > COALESCE(r.shipped_at, ex.merged_at)
    AND outcome.lane_id IS NOT DISTINCT FROM before_measurement.lane_id
    AND outcome.versions = before_measurement.versions
    AND outcome.query_id = before_measurement.query_id
    AND outcome.model_id = before_measurement.model_id
    AND outcome.run_mode = before_measurement.run_mode
  ORDER BY outcome.observed_at ASC
  LIMIT 1
) after_measurement ON true;

COMMENT ON VIEW public.intelligence_mart_domain_query_model_outcomes IS
  'Eligible deterministic query/model facts. The _all companion keeps invalid/quarantined facts inspectable.';
COMMENT ON VIEW public.intelligence_mart_intervention_outcomes IS
  'Exact-compatible before/after associations; never a causal claim.';
COMMENT ON TABLE public.intelligence_metric_definitions IS
  'Versioned metric dictionary. SQL and raw facts, never an LLM, are numerical authority.';

REVOKE ALL ON public.intelligence_metric_definitions FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_domain_query_model_outcomes_all FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_domain_query_model_outcomes FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_domain_measurement_timeline FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_lane_window_health FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_domain_page_feature_snapshots_all FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_domain_page_feature_snapshots FROM anon, authenticated;
REVOKE ALL ON public.intelligence_mart_intervention_outcomes FROM anon, authenticated;
