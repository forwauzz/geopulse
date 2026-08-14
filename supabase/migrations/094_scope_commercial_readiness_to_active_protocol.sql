-- Issue #306: commercial readiness must describe the current frozen schedule,
-- not a mixture of every historical provider and protocol ever observed.

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
scheduled_protocol_observations AS (
  SELECT
    domain.canonical_vertical,
    group_row.query_set_id,
    group_row.model_set_version,
    group_row.metadata ->> 'schedule_version' AS schedule_version,
    max(group_row.created_at) AS observed_at
  FROM public.benchmark_run_groups group_row
  JOIN public.query_runs run ON run.run_group_id = group_row.id
  JOIN normalized_domains domain ON domain.id = run.domain_id
  WHERE nullif(group_row.metadata ->> 'schedule_version', '') IS NOT NULL
    AND coalesce(group_row.metadata ->> 'trigger_source', 'worker_cron') = 'worker_cron'
  GROUP BY 1, 2, 3, 4
),
active_protocol AS (
  SELECT DISTINCT ON (canonical_vertical)
    canonical_vertical, query_set_id, model_set_version, schedule_version, observed_at
  FROM scheduled_protocol_observations
  ORDER BY canonical_vertical, observed_at DESC, schedule_version DESC
),
run_summary AS (
  SELECT
    active.canonical_vertical,
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
  FROM active_protocol active
  JOIN public.benchmark_run_groups group_row
    ON group_row.query_set_id = active.query_set_id
    AND group_row.model_set_version = active.model_set_version
    AND group_row.metadata ->> 'schedule_version' = active.schedule_version
  JOIN public.query_runs run ON run.run_group_id = group_row.id
  JOIN normalized_domains domain
    ON domain.id = run.domain_id
    AND domain.canonical_vertical = active.canonical_vertical
  GROUP BY active.canonical_vertical
),
raw_window_observed AS (
  SELECT
    concat_ws(':',
      coalesce(group_row.metadata ->> 'schedule_window_utc', 'legacy:' || group_row.id::text),
      coalesce(group_row.metadata ->> 'domain_id', run.domain_id::text),
      group_row.query_set_id::text,
      coalesce(group_row.metadata ->> 'model_id', group_row.model_set_version)
    ) AS source_id,
    domain.canonical_vertical,
    group_row.query_set_id,
    group_row.model_set_version,
    group_row.metadata ->> 'schedule_version' AS schedule_version,
    max(coalesce(run.executed_at, run.created_at)) AS observed_at
  FROM public.benchmark_run_groups group_row
  JOIN public.query_runs run ON run.run_group_id = group_row.id
  JOIN normalized_domains domain ON domain.id = run.domain_id
  GROUP BY 1, 2, 3, 4, 5
),
latest_window_assessments AS (
  SELECT DISTINCT ON (source_kind, source_id)
    source_kind, source_id, eligible, assessed_at
  FROM public.intelligence_window_quality_assessments
  WHERE source_kind = 'benchmark_measurement_window'
  ORDER BY source_kind, source_id, assessed_at DESC
),
window_summary AS (
  SELECT
    active.canonical_vertical,
    count(*) FILTER (WHERE assessment.eligible)::integer AS eligible_window_count,
    count(*) FILTER (WHERE NOT assessment.eligible)::integer AS ineligible_window_count,
    max(raw_window.observed_at) FILTER (WHERE assessment.eligible) AS latest_eligible_observed_at
  FROM active_protocol active
  JOIN raw_window_observed raw_window
    ON raw_window.canonical_vertical = active.canonical_vertical
    AND raw_window.query_set_id = active.query_set_id
    AND raw_window.model_set_version = active.model_set_version
    AND raw_window.schedule_version = active.schedule_version
  JOIN latest_window_assessments assessment ON assessment.source_id = raw_window.source_id
  GROUP BY active.canonical_vertical
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
  'Aggregate claim-readiness inputs scoped to the latest frozen scheduled protocol per vertical; historical evidence remains preserved outside this view.';
