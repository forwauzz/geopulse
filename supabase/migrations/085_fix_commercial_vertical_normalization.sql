-- Issue #418 production QA: normalize case before removing non-slug characters.

CREATE OR REPLACE FUNCTION public.canonical_benchmark_vertical(p_vertical TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE lower(regexp_replace(lower(coalesce(p_vertical, '')), '[^a-z0-9]+', '_', 'g'))
    WHEN 'msp_it' THEN 'msp_it'
    WHEN 'msp_it_services' THEN 'msp_it'
    WHEN 'managed_service_providers' THEN 'msp_it'
    WHEN 'managed_it_services' THEN 'msp_it'
    WHEN 'marketing_agencies' THEN 'marketing_agencies'
    WHEN 'marketing_agency' THEN 'marketing_agencies'
    WHEN 'marketing_firms' THEN 'marketing_agencies'
    WHEN 'law_firms' THEN 'law_firms'
    WHEN 'law_firm' THEN 'law_firms'
    WHEN 'legal_services' THEN 'law_firms'
    WHEN 'healthcare' THEN 'healthcare'
    WHEN 'health_care' THEN 'healthcare'
    WHEN 'digital_health' THEN 'healthcare'
    WHEN 'tech_startups' THEN 'tech_startups'
    WHEN 'technology_startups' THEN 'tech_startups'
    WHEN 'startups' THEN 'tech_startups'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE VIEW public.intelligence_commercial_readiness_v1
WITH (security_invoker = true)
AS
WITH normalized_domains AS (
  SELECT
    id,
    public.canonical_benchmark_vertical(vertical) AS canonical_vertical,
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
      source_kind, source_id, eligible, assessed_at
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

REVOKE ALL ON FUNCTION public.canonical_benchmark_vertical(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_benchmark_vertical(TEXT) TO service_role;

COMMENT ON FUNCTION public.canonical_benchmark_vertical(TEXT) IS
  'Normalizes legacy benchmark vertical labels for comparison without modifying source rows.';
