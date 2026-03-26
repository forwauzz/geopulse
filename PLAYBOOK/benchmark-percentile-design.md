# Benchmark Percentile Design

## Task

`RE-004` — Add benchmark-percentile computation design or explicitly remove percentile claims until implemented.

## Current decision

Percentile claims are removed from current product/API expectations until a benchmark dataset and computation pipeline exist.

This document defines the minimum bar for adding `benchmark_percentile` later without misleading users.

## Why percentile is not implemented now

- there is no benchmark dataset segmented by site cohort
- there is no normalization policy for different site types
- there is no scheduled recomputation job
- there is no audit trail for how a percentile was derived

Without those pieces, a percentile value would look precise while being methodologically weak.

## Requirements before adding `benchmark_percentile`

### 1. Benchmark cohort definition

Each percentile must be computed against an explicit cohort, for example:

- overall public benchmark pool
- industry cohort
- company-size cohort
- site-type cohort

The response must record which cohort was used.

### 2. Eligibility rules

Only comparable scans can enter the benchmark pool. At minimum:

- same scoring version
- same check registry version
- completed scans only
- minimum page coverage threshold met
- duplicate domains deduplicated by latest eligible run

### 3. Computation record

Every percentile output must be reproducible from stored metadata:

- scan id
- cohort id
- cohort size
- scoring version
- check registry version
- computation timestamp

### 4. Confidence guardrails

Do not emit a percentile when:

- cohort size is too small
- coverage is too low
- scan is partially blocked
- scoring version changed and the benchmark snapshot is stale

In those cases return no percentile, not a weak estimate.

## Suggested data model additions

- `benchmark_cohorts`
- `benchmark_snapshots`
- `scan_benchmark_results`

Each snapshot should store the ordered score distribution for one cohort and one scoring version.

## Suggested API shape when implemented later

```json
{
  "benchmark": {
    "percentile": 72,
    "cohort": "industry_saas_marketing_sites",
    "cohort_size": 418,
    "computed_at": "2026-04-12T00:00:00Z",
    "scoring_version": "v2"
  }
}
```

Do not expose a bare `benchmark_percentile` field without cohort metadata.

## Launch rule

Until the benchmark pipeline exists, use:

- score
- letter grade
- category scores
- issue breakdown

Do not use percentile wording in:

- API contracts
- report promises
- OG image requirements
- marketing copy

## Done definition for future implementation

`benchmark_percentile` can return only when all of the following are true:

1. cohort definition is implemented
2. benchmark snapshot job exists
3. stale / low-sample guardrails exist
4. API response includes cohort metadata
5. customer-facing copy explains what the percentile compares against
