# Geo Intelligence Analytical Marts

Issue: INT-007 / GitHub #218
Metric dictionary: `intelligence-metrics-v1`

## Decision

SQL over qualifying raw facts is the numerical authority. LLM output can be evidence or a generated artifact, but it never calculates canonical citation rate, coverage, share of voice, cohort statistics, or intervention deltas.

The five default marts are:

1. `intelligence_mart_domain_measurement_timeline`
2. `intelligence_mart_lane_window_health`
3. `intelligence_mart_domain_query_model_outcomes`
4. `intelligence_mart_domain_page_feature_snapshots`
5. `intelligence_mart_intervention_outcomes`

Outcome and page-feature marts have `_all` companions. Default marts exclude invalid, incomplete, provider-failed, duplicate, and quarantined facts; `_all` keeps them inspectable.

## Metric contract

Every derived row carries source run IDs, source evidence IDs, sample size, uncertainty fields, eligibility, freshness, dictionary version, and comparison label.

- Citation rate: qualifying responses with at least one parsed citation / qualifying completed responses.
- Coverage: valid or valid-partial query/model/mode cells / expected cells.
- Share of voice: citations attributed to the measured canonical domain / all parsed citations in the qualifying response.
- Intervention delta: compatible post-intervention citation rate minus compatible pre-intervention citation rate.

Empty denominators and missing compatible pairs return `metric_status=not_available` and a null value. They never become numeric zero.

The TypeScript ratio contract uses a 95% Wilson interval. Mart rows retain uncertainty columns even when the available grain cannot support a meaningful interval; those values remain null rather than implying precision.

## Compatibility

Default comparisons require the same lane, version envelope, query, model, and run mode. The intervention mart searches only for an exact compatible post window. Cross-lane/version analysis requires an explicit application-level override and must be labeled `explicit_cross_lane_override`; default SQL does not perform that override.

Repeated observations remain separate timeline facts. Cohort consumers must select one explicitly defined observation per canonical domain before aggregation; the metric contract includes a deterministic unique-domain helper and regression test.

## Intervention lineage

The intervention mart connects:

`recommendation -> approval event -> merged PR/shipped event -> verification task -> compatible before/after measurements`

It records elapsed time and all measurement, implementation, and verification IDs. The causal label is always `observational_association_not_causation`.

## Refresh and rebuild

The marts are ordinary views, so they refresh transactionally from current source, quality, evidence, and eligibility facts on each query. There is no cache to invalidate in v1.

For a rebuild:

1. Apply migrations 059–064 in order.
2. Run identity, lane, run-index, evidence, and quality backfills in that order.
3. Compare mart counts and raw source IDs before changing the active metric dictionary.
4. Re-run the quality policy if source snapshots changed.
5. Query `_all` and default views together to reconcile excluded facts.

If query volume later requires materialization, create versioned materialized tables from these definitions and record refresh checkpoints; do not silently replace the view contract.

The production raw-fact preview on 2026-07-25 reconciled 268 quality-eligible windows and excluded one otherwise complete discontinuous window. Those windows contain 4,278 qualifying query runs across 26 unique domains. The raw-count metrics were:

- citation rate: 2,931 / 4,278 = 0.6851
- response coverage: 4,278 / 11,302 = 0.3785
- measured-domain share of voice: 2,195 / 4,758 = 0.4613

The source currently has no startup recommendation rows, so intervention sample size is zero and the preview correctly returns `not_available`.

## Production status

The definitions and reproducibility tests can deploy with the application, but creating these views requires the queued Supabase migration chain. Until that chain is applied, existing product queries remain authoritative and unchanged.
