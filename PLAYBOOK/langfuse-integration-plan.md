# Langfuse Integration Plan

Last updated: 2026-03-26

## Purpose

This document defines how GEO-Pulse should use Langfuse in the future measurement layer.

It is a planning document, not yet an implementation.

## Why Langfuse

The measurement platform needs:
- traceability for model executions
- dataset/version tracking for benchmark experiments
- prompt/version visibility over time
- a safe place to compare model-output behavior without turning the current product into an observability project

Langfuse fits because it can support:
- traces and spans
- datasets
- experiments/evals
- prompt/version references

## Current repo state

Current observability in repo is lightweight and local:
- `lib/server/structured-log.ts`
- structured worker logs for report jobs and deep-audit crawl
- internal eval persistence in Supabase
- Promptfoo for regression harnesses

What does not exist:
- centralized LLM trace store
- benchmark-run trace hierarchy
- dataset/version tracking for benchmark prompts in an observability platform

## Integration principle

Langfuse should start as a benchmark-layer observability tool, not as a required dependency for the customer-facing audit path.

That means:
- the current audit/report product must continue to work without Langfuse
- benchmark execution may emit traces to Langfuse when configured
- Langfuse should complement Supabase persistence, not replace it

## What Langfuse should own

Good early Langfuse use cases:
- trace each benchmark query execution
- record target model, prompt version, latency, and outcome
- attach citation-extraction or auditor steps as spans
- register benchmark query sets as datasets or prompt references
- compare run groups across model/version changes

## What Langfuse should not own

Do not use Langfuse as the system of record for:
- benchmark domain identity
- raw benchmark tables
- computed benchmark metrics
- customer dashboard history
- pricing or entitlement state

Those remain in GEO-Pulse storage.

## Recommended boundary

### GEO-Pulse remains source of truth

Supabase / app data keeps:
- `benchmark_domains`
- `benchmark_query_sets`
- `benchmark_queries`
- `benchmark_run_groups`
- `query_runs`
- `query_citations`
- `benchmark_domain_metrics`

### Langfuse adds observability and experiment context

Langfuse receives:
- trace per benchmark query run
- span per target model call
- span per citation extraction step
- metadata per run group and query set version

## Proposed data mapping

### Trace

One Langfuse trace per `query_runs.id`

Suggested trace metadata:
- `run_group_id`
- `domain_id`
- `query_id`
- `query_key`
- `model_id`
- `auditor_model_id`
- `query_set_version`
- `vertical`

### Spans / generations

Suggested child steps:
1. target model execution
2. response normalization
3. citation extraction
4. optional auditor-model classification later

### Dataset references

Benchmark query sets should eventually map to Langfuse datasets or prompt references by:
- query set name
- query set version
- query key

This is useful for experiment comparison, but should remain secondary to GEO-Pulse’s own benchmark schema.

## Rollout plan

### Step 1: optional trace wrapper

Add an internal wrapper such as:
- `lib/server/langfuse/trace-benchmark-run.ts`

Behavior:
- no-op when Langfuse is not configured
- emits one trace with structured metadata when configured

### Step 2: benchmark-only instrumentation

Instrument only the new benchmark runner first.

Do not instrument:
- free scan path
- checkout path
- report-delivery path

That keeps rollout risk low.

### Step 3: dataset references

Attach query-set metadata and benchmark-run-group metadata to traces.

### Step 4: evaluation experiments

Later, use Langfuse experiments to compare:
- target model versions
- citation extraction variants
- query set versions

## Suggested env/config

Add optional config only:
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`
- `LANGFUSE_ENABLED`

Initial rule:
- benchmark code must degrade gracefully when Langfuse is absent

## Error-handling rules

- Langfuse failures must never fail a benchmark write path
- benchmark persistence to Supabase remains primary
- tracing should be best-effort and async-safe where possible

## Relationship to Promptfoo and RAGAS

Promptfoo:
- remains the regression harness for prompts and outputs
- does not get replaced by Langfuse

RAGAS:
- still remains deferred/no-go for now
- Langfuse does not justify introducing `ragas` early

Langfuse helps observability and experiment tracking.
It does not replace benchmark methodology.

## Acceptance bar for BM-004

This plan should be considered complete when:
- Langfuse’s role is clearly scoped
- benchmark persistence vs observability ownership is explicit
- rollout is optional and low-risk
- Promptfoo and deterministic eval foundations remain first-class
