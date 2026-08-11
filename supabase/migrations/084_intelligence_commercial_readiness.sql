-- Issue #418: one aggregate, fail-closed readiness surface for commercial benchmark claims.
-- Source rows remain immutable; legacy vertical labels are normalized only inside this view.

CREATE OR REPLACE VIEW public.intelligence_commercial_readiness_v1
WITH (security_invoker = true)
AS
WITH normalized_domains AS (
  SELECT
    id,
    CASE
      WHEN lower(regexp_replace(coalesce(vertical, ''), '[^a-z0-9]+', '_', 'g')) IN
        ('msp_it', 'msp_it_services', 'managed_service_providers', 'managed_it_services') THEN 'msp_it'
      WHEN lower(regexp_replace(coalesce(vertical, ''), '[^a-z0-9]+', '_', 'g')) IN
        ('marketing_agencies', 'marketing_agency', 'marketing_firms') THEN 'marketing_agencies'
      WHEN lower(regexp_replace(coalesce(vertical, ''), '[^a-z0-9]+', '_', 'g')) IN
        ('law_firms', 'law_firm', 'legal_services') THEN 'law_firms'
      WHEN lower(regexp_replace(coalesce(vertical, ''), '[^a-z0-9]+', '_', 'g')) IN
        ('healthcare', 'health_care', 'digital_health') THEN 'healthcare'
      WHEN lower(regexp_replace(coalesce(vertical, ''), '[^a-z0-9]+', '_', 'g')) IN
        ('tech_startups', 'technology_startups', 'startups') THEN 'tech_startups'
      ELSE 'unknown'
    END AS canonical_vertical,
    (metadata ->> 'schedule_enabled')::boolean IS TRUE AS schedule_enabled
  FROM public.benchmark_domains
),
domain_summary AS (
  SELECT
    canonical_vertical,
    count(*)::integer AS cohort_domain_count,
    count(*) FILTER (WHERE schedule_enabled)::integer AS scheduled_domain_count
  FROM normalized_domains
  GROUP BY canonical_vertical
),
run_summary AS (
  SELECT
    domain.canonical_vertical,
    count(DISTINCT run.domain_id) FILTER (
      WHERE run.status = 'completed'
        AND run.response_text IS NOT NULL
        AND run.error_message IS NULL
    )::integer AS completed_domain_count,
    max(coalesce(run.executed_at, run.created_at)) FILTER (
      WHERE run.status = 'completed'
        AND run.response_text IS NOT NULL
        AND run.error_message IS NULL
    ) AS latest_completed_observed_at,
    count(DISTINCT concat_ws(':',
      group_row.query_set_id::text,
      group_row.model_set_version,
      group_row.metadata ->> 'schedule_version'
    )) FILTER (
      WHERE run.status = 'completed'
        AND run.response_text IS NOT NULL
        AND run.error_message IS NULL
    )::integer AS protocol_variant_count
  FROM public.query_runs run
  JOIN normalized_domains domain ON domain.id = run.domain_id
  JOIN public.benchmark_run_groups group_row ON group_row.id = run.run_group_id
  GROUP BY domain.canonical_vertical
),
raw_window_observed AS (
  SELECT
    concat_ws(':',
      coalesce(group_row.metadata ->> 'schedule_window_utc', 'legacy:' || group_row.id::text),
      coalesce(group_row.metadata ->> 'domain_id', run.domain_id::text),
      group_row.query_set_id::text,
      coalesce(group_row.metadata ->> 'model_id', group_row.model_set_version)
    ) AS source_id,
    max(coalesce(run.executed_at, run.created_at)) AS observed_at
  FROM public.benchmark_run_groups group_row
  JOIN public.query_runs run ON run.run_group_id = group_row.id
  GROUP BY 1
),
window_summary AS (
  SELECT
    domain.canonical_vertical,
    count(*) FILTER (WHERE assessment.eligible)::integer AS eligible_window_count,
    count(*) FILTER (WHERE NOT assessment.eligible)::integer AS ineligible_window_count,
    max(raw_window.observed_at) FILTER (WHERE assessment.eligible) AS latest_eligible_observed_at
  FROM (
    SELECT DISTINCT ON (source_kind, source_id)
      source_kind, source_id, lane_id, eligible, assessed_at
    FROM public.intelligence_window_quality_assessments
    WHERE source_kind = 'benchmark_measurement_window'
    ORDER BY source_kind, source_id, assessed_at DESC
  ) assessment
  JOIN normalized_domains domain ON position(domain.id::text IN assessment.source_id) > 0
  LEFT JOIN raw_window_observed raw_window ON raw_window.source_id = assessment.source_id
  GROUP BY domain.canonical_vertical
)
SELECT
  domains.canonical_vertical,
  domains.cohort_domain_count,
  domains.scheduled_domain_count,
  coalesce(runs.completed_domain_count, 0) AS completed_domain_count,
  coalesce(windows.eligible_window_count, 0) AS eligible_window_count,
  coalesce(windows.ineligible_window_count, 0) AS ineligible_window_count,
  windows.latest_eligible_observed_at,
  coalesce(runs.protocol_variant_count, 0) AS protocol_variant_count,
  0::integer AS verified_intervention_count,
  runs.latest_completed_observed_at
FROM domain_summary domains
LEFT JOIN run_summary runs USING (canonical_vertical)
LEFT JOIN window_summary windows USING (canonical_vertical);

COMMENT ON VIEW public.intelligence_commercial_readiness_v1 IS
  'Aggregate claim-readiness inputs. This view normalizes labels without modifying historical evidence and never asserts causation.';

CREATE OR REPLACE FUNCTION public.refresh_recent_benchmark_intelligence_quality(
  p_recent_hours INTEGER DEFAULT 72
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  classification_count INTEGER := 0;
  assessment_count INTEGER := 0;
BEGIN
  INSERT INTO public.intelligence_run_quality_classifications (
    stable_classification_id, policy_version, run_id, source_kind, source_id,
    source_snapshot, original_status, quality_state, reason_codes, age_hours,
    evidence_refs, classified_at
  )
  SELECT
    'qc_' || md5('quality-policy-v1:' || run.id::text || ':' || md5(to_jsonb(run)::text)),
    'quality-policy-v1', indexed.id, 'benchmark_query_run', run.id::text,
    md5(to_jsonb(run)::text), run.status,
    CASE
      WHEN run.status = 'failed' OR run.error_message IS NOT NULL THEN 'provider_failure'
      WHEN run.status IN ('queued', 'running', 'skipped') THEN 'incomplete'
      WHEN run.response_text IS NULL THEN 'incomplete'
      WHEN coalesce(run.response_metadata ->> 'run_mode', group_row.metadata ->> 'run_mode') IS NULL
        THEN 'configuration_mismatch'
      ELSE 'valid'
    END,
    CASE
      WHEN run.status = 'failed' OR run.error_message IS NOT NULL THEN '["provider_error"]'::jsonb
      WHEN run.status IN ('queued', 'running', 'skipped') THEN '["source_still_running"]'::jsonb
      WHEN run.response_text IS NULL THEN '["missing_response"]'::jsonb
      WHEN coalesce(run.response_metadata ->> 'run_mode', group_row.metadata ->> 'run_mode') IS NULL
        THEN '["missing_protocol_dimension"]'::jsonb
      WHEN EXISTS (SELECT 1 FROM public.query_citations citation WHERE citation.query_run_id = run.id)
        THEN '["completed_with_response"]'::jsonb
      ELSE '["completed_zero_citations"]'::jsonb
    END,
    extract(epoch FROM (now() - coalesce(run.executed_at, run.created_at))) / 3600.0,
    jsonb_build_array('query_runs:' || run.id::text), now()
  FROM public.query_runs run
  JOIN public.benchmark_run_groups group_row ON group_row.id = run.run_group_id
  LEFT JOIN public.intelligence_runs indexed
    ON indexed.source_kind = 'benchmark_query_run' AND indexed.source_id = run.id::text
  WHERE run.created_at >= now() - make_interval(hours => greatest(1, p_recent_hours))
  ON CONFLICT (stable_classification_id) DO NOTHING;
  GET DIAGNOSTICS classification_count = ROW_COUNT;

  WITH raw_windows AS (
    SELECT
      coalesce(group_row.metadata ->> 'schedule_window_utc', 'legacy:' || group_row.id::text) AS schedule_window,
      coalesce(group_row.metadata ->> 'domain_id', run.domain_id::text) AS domain_id,
      group_row.query_set_id::text AS query_set_id,
      coalesce(group_row.metadata ->> 'model_id', run.model_id, group_row.model_set_version) AS model_id,
      max(group_row.created_at) AS observed_at,
      count(DISTINCT run.query_id)::integer * 2 AS expected_cells,
      count(DISTINCT concat_ws(':', run.query_id::text, run.model_id,
        coalesce(run.response_metadata ->> 'run_mode', group_row.metadata ->> 'run_mode'))) FILTER (
          WHERE run.status = 'completed'
            AND run.response_text IS NOT NULL
            AND run.error_message IS NULL
            AND coalesce(run.response_metadata ->> 'run_mode', group_row.metadata ->> 'run_mode')
              IN ('grounded_site', 'ungrounded_inference')
      )::integer AS valid_cells,
      count(*) FILTER (
        WHERE run.status = 'completed' AND run.response_text IS NOT NULL AND run.error_message IS NULL
      )::integer AS valid_runs,
      count(*) FILTER (
        WHERE run.status = 'completed' AND run.response_text IS NOT NULL AND run.error_message IS NULL
          AND EXISTS (SELECT 1 FROM public.query_citations citation WHERE citation.query_run_id = run.id)
      )::integer AS cited_runs
    FROM public.benchmark_run_groups group_row
    JOIN public.query_runs run ON run.run_group_id = group_row.id
    WHERE group_row.created_at >= now() - make_interval(hours => greatest(24, p_recent_hours * 5))
    GROUP BY 1, 2, 3, 4
  ), rated_windows AS (
    SELECT *,
      CASE WHEN valid_runs > 0 THEN cited_runs::numeric / valid_runs ELSE 0 END AS citation_rate,
      lag(CASE WHEN valid_runs > 0 THEN cited_runs::numeric / valid_runs ELSE 0 END)
        OVER (PARTITION BY domain_id, query_set_id, model_id ORDER BY observed_at) AS previous_citation_rate
    FROM raw_windows
  ), prepared AS (
    SELECT *,
      schedule_window || ':' || domain_id || ':' || query_set_id || ':' || model_id AS source_id,
      ARRAY(
        SELECT missing
        FROM unnest(ARRAY[
          CASE WHEN valid_cells < expected_cells THEN 'incomplete_protocol_cells' END
        ]) missing
        WHERE missing IS NOT NULL
      ) AS missing_cells,
      ARRAY(
        SELECT anomaly
        FROM unnest(ARRAY[
          CASE WHEN valid_runs >= 3 AND cited_runs = 0 THEN 'whole_cohort_all_zero' END,
          CASE WHEN valid_runs >= 3 AND previous_citation_rate IS NOT NULL
            AND abs(previous_citation_rate - citation_rate) >= 0.75 THEN 'citation_rate_discontinuity' END
        ]) anomaly
        WHERE anomaly IS NOT NULL
      ) AS anomaly_codes
    FROM rated_windows
    WHERE observed_at >= now() - make_interval(hours => greatest(1, p_recent_hours))
  )
  INSERT INTO public.intelligence_window_quality_assessments (
    policy_version, source_kind, source_id, lane_id, window_id, eligible,
    coverage_ratio, expected_cell_count, valid_cell_count, missing_cells,
    anomaly_codes, source_snapshot, assessed_at
  )
  SELECT
    'quality-policy-v1', 'benchmark_measurement_window', source_id, NULL, NULL,
    expected_cells > 0 AND valid_cells = expected_cells AND cardinality(anomaly_codes) = 0,
    CASE WHEN expected_cells > 0 THEN least(1, valid_cells::numeric / expected_cells) ELSE 0 END,
    expected_cells, valid_cells, to_jsonb(missing_cells), to_jsonb(anomaly_codes),
    md5(concat_ws(':', source_id, expected_cells, valid_cells, array_to_string(anomaly_codes, ','))), now()
  FROM prepared
  ON CONFLICT (policy_version, source_kind, source_id, source_snapshot) DO UPDATE SET
    eligible = EXCLUDED.eligible,
    coverage_ratio = EXCLUDED.coverage_ratio,
    expected_cell_count = EXCLUDED.expected_cell_count,
    valid_cell_count = EXCLUDED.valid_cell_count,
    missing_cells = EXCLUDED.missing_cells,
    anomaly_codes = EXCLUDED.anomaly_codes,
    assessed_at = EXCLUDED.assessed_at;
  GET DIAGNOSTICS assessment_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'policy_version', 'quality-policy-v1',
    'classifications_refreshed', classification_count,
    'windows_refreshed', assessment_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_recent_benchmark_intelligence_quality(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_recent_benchmark_intelligence_quality(INTEGER) TO service_role;

COMMENT ON FUNCTION public.refresh_recent_benchmark_intelligence_quality(INTEGER) IS
  'Incrementally classifies recent benchmark runs and paired-mode windows without modifying raw evidence.';
