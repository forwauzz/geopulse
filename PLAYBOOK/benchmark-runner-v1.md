# Benchmark Runner v1

Last updated: 2026-03-26

## Purpose

This document defines the first internal benchmark runner for GEO-Pulse.

Scope is intentionally narrow:
- one domain
- one query set
- one model lane
- internal use only

This is the first operational shape for the benchmark platform.

## Why start narrow

The goal is to prove the pipeline, not to prove the business at full scale yet.

If the first runner tries to handle:
- multiple domains
- multiple model lanes
- competitor comparisons
- retries and orchestration complexity

then the team will blur execution risk before the core measurement model is even stable.

## Runner objective

Given:
- one `benchmark_domains` row
- one active `benchmark_query_sets` row
- one `model_id`

the runner should:
1. create a `benchmark_run_groups` batch
2. execute each query in the query set against the target model
3. store raw output in `query_runs`
4. extract citations into `query_citations`
5. compute first aggregate metrics into `benchmark_domain_metrics`

## Inputs

Required:
- `domain_id`
- `query_set_id`
- `model_id`

Optional:
- `auditor_model_id`
- `notes`
- `run_label`

## Outputs

- one `benchmark_run_groups` row
- many `query_runs` rows
- zero or more `query_citations` rows per query run
- one `benchmark_domain_metrics` row for the domain/model/run-group

## Execution shape

### Step 1: resolve domain and query set

Load:
- `benchmark_domains`
- `benchmark_query_sets`
- `benchmark_queries`

Fail fast if:
- domain missing
- query set missing
- query set has zero queries

### Step 2: create run group

Insert one `benchmark_run_groups` row with:
- `query_set_id`
- `label`
- `run_scope = internal_benchmark`
- `model_set_version`
- `status = running`
- timestamps / metadata

### Step 3: execute query runs serially at first

For v1, use serial execution.

Why:
- easier debugging
- easier cost control
- easier trace review
- lower risk of model rate-limit noise during early validation

For each query:
- insert or upsert `query_runs` row as `running`
- call target model via the future provider boundary
- store raw response text + metadata
- mark row `completed` or `failed`

### Step 4: extract citations

After raw output is stored:
- parse the response for cited URLs, cited domains, explicit brand mentions, or none
- write `query_citations`

For v1, citation extraction should be simple and conservative:
- explicit URL extraction first
- explicit domain extraction second
- optional brand-mention detection only if the rule is clear

Do not overfit sophisticated citation interpretation in v1.

### Step 5: compute first metrics

For the domain/model/run-group:
- `citation_rate`
- `query_coverage`
- `share_of_voice`

`inference_probability` may exist as an internal placeholder metric if defined clearly.

`drift_score` can remain null in v1.

### Step 6: close run group

When all query runs are done:
- set `benchmark_run_groups.status` to `completed` or `failed`
- set `completed_at`

## Provider boundary

The runner must not call Gemini directly.

It should depend on the future provider factory from the LiteLLM plan:
- benchmark runner asks for a provider/model lane
- provider returns normalized response

That keeps benchmark execution decoupled from a single vendor.

## Citation extraction v1 contract

The runner should emit a simple extraction result shape like:

```ts
type ParsedCitation = {
  citedDomain: string | null;
  citedUrl: string | null;
  citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention';
  rankPosition: number | null;
  confidence: number | null;
};
```

Rules:
- prefer precision over recall
- store zero citations if the response gives no trustworthy citation
- keep raw response text in `query_runs` so extraction can improve later without losing evidence

## First operational constraints

For v1:
- max 1 domain per invocation
- max 1 query set per invocation
- max 1 model lane per invocation
- max 20 queries per run group
- serial execution only
- admin/internal trigger only

## Suggested implementation surface

### Core server module

Add a module such as:
- `lib/server/benchmark/run-benchmark-group.ts`

Responsibilities:
- orchestrate the steps
- use provider abstraction
- write DB rows
- compute metrics

### CLI / script entry

Add a script such as:
- `scripts/benchmark-runner.ts`

Purpose:
- manually trigger one internal benchmark run during early validation

### Optional internal admin endpoint later

Do not start with the endpoint first.

Get the script path working before exposing an internal UI or route.

## Error handling

### Query-level failures

If one query fails:
- mark that `query_runs` row `failed`
- continue the remaining queries

### Run-group failure

Mark the whole run group `failed` only if:
- setup fails before any query run can start
- all queries fail
- a fatal write failure prevents trustworthy results

### Trace failures

If Langfuse or optional tracing fails:
- never fail the benchmark write path

## Logging and observability

Keep using structured app logs as the operational baseline.

Suggested events:
- `benchmark_run_group_started`
- `benchmark_query_run_started`
- `benchmark_query_run_completed`
- `benchmark_query_run_failed`
- `benchmark_citation_parse_completed`
- `benchmark_metrics_computed`
- `benchmark_run_group_completed`

Langfuse is additive, not required.

## Metric computation v1

### `query_coverage`
- completed query runs / total queries in the query set

### `citation_rate`
- completed query runs with at least one qualifying citation / completed query runs

### `share_of_voice`
- domain citation count / total citation count across the run group

For v1 on a single-domain run:
- `share_of_voice` is still allowed
- but it should be treated as provisional and mostly useful once cohort runs exist

## Non-goals for v1

Do not include yet:
- automatic competitor benchmarking
- cohort-wide scheduling
- retries / DLQ
- parallel execution
- public endpoints
- customer-facing UI
- model drift analysis
- complex auditor-model post-processing

## Acceptance bar for BM-005

This runner design is complete when:
- the execution steps are frozen
- failure behavior is explicit
- logging/tracing expectations are explicit
- provider dependency is aligned with BM-003
- the first implementation can proceed without redesigning the schema again
