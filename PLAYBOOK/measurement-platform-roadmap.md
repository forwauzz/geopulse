# Measurement Platform Roadmap

Last updated: 2026-03-27

## Purpose

This document captures the planned path from the current GEO-Pulse audit/report product to a benchmark-driven AI visibility measurement platform.

It is intentionally staged so the team can build on top of the current product without destabilizing it.

## Strategic Position

GEO-Pulse should be treated as two layers:

1. Current wedge: productized audit/report business
2. Future moat: measurement infrastructure for AI visibility

The wedge stays customer-facing now.
The moat begins as an internal subsystem and only later becomes a formal API/infrastructure product.

## Architectural Split

### Stays in current app
- landing, scan, results, checkout, report delivery
- auth, dashboard, admin pages
- site crawl + feature extraction
- paid audit generation
- current eval analytics and report history

### Becomes the measurement layer
- query libraries
- benchmark cohorts
- multi-model execution
- response storage
- citation extraction
- share-of-voice / citation-rate / drift computation
- competitor comparison
- pre-publish scoring later

## Recommended OSS Usage

Reuse OSS for infrastructure, not for benchmark logic.

Recommended:
- LiteLLM: multi-model gateway
- Langfuse: tracing, datasets, experiments, prompt/version tracking
- Promptfoo: regression/eval suites
- Qdrant: later, for retrieval simulation
- Temporal or Prefect: later, only if benchmark orchestration outgrows the current queue model

Provider-boundary reference:
- `PLAYBOOK/litellm-integration-plan.md`

Observability reference:
- `PLAYBOOK/langfuse-integration-plan.md`

Do not outsource:
- benchmark methodology
- query taxonomy
- citation graph model
- share-of-voice scoring
- benchmark ranking logic

## Phased Plan

### Phase A: internal measurement foundation
- add benchmark schema
- add normalized benchmark domain model
- add query-set and query-run model
- add LiteLLM wrapper
- add Langfuse integration
- run one internal benchmark lane on a small cohort

Schema detail reference:
- `PLAYBOOK/measurement-schema-v1.md`

Runner detail reference:
- `PLAYBOOK/benchmark-runner-v1.md`

Citation/metrics reference:
- `PLAYBOOK/citation-and-metrics-v1.md`

Grounding-evolution reference:
- `PLAYBOOK/benchmark-grounding-v2.md`

Admin UI reference:
- `PLAYBOOK/benchmark-admin-ui-v1.md`

Scale path reference:
- `PLAYBOOK/benchmark-scale-path.md`

### Phase B: internal benchmark MVP
- 20 to 50 domains
- 1 to 2 verticals
- 10 to 20 queries per domain
- 2 target models max
- internal admin-only benchmark views

### Phase C: competitive + time-series layer
- recurring benchmark runs
- competitor sets
- time-series metric history
- drift alerts
- domain vs cohort / competitor comparisons

### Phase D: predictive retrieval layer
- retrieval simulation
- Qdrant-backed experiments
- pre-publish scoring APIs

### Phase E: 1000-site benchmark scale
- dedicated benchmark workers
- batch observability
- DLQ / replay
- cost accounting
- vertical cohort management

Operational scale reference:
- `PLAYBOOK/benchmark-scale-path.md`

## First Schemas

- `benchmark_domains`
- `benchmark_query_sets`
- `benchmark_queries`
- `benchmark_run_groups`
- `query_runs`
- `query_citations`
- `benchmark_domain_metrics`

## First Internal Endpoints

- `POST /internal/benchmark/domains`
- `POST /internal/benchmark/query-sets`
- `POST /internal/benchmark/run-groups`
- `POST /internal/query-runs/execute`
- `POST /internal/query-runs/:id/citations`
- `POST /internal/benchmark/compute-metrics`
- `GET /internal/benchmark/domains/:id/metrics`

## What Not To Do

- do not rewrite the current product around benchmarking
- do not run large benchmark jobs on the customer request path
- do not start with 1000 domains
- do not start with too many models
- do not expose benchmark claims before the methodology is stable
- do not turn GEO-Pulse into a chat product

## Current Truth

The current repo supports the wedge well:
- audits
- reports
- admin evals
- retrieval foundations
- Promptfoo-based regression tracking
- benchmark schema foundation (`012_benchmark_foundation.sql`)
- benchmark identity and repository seam (`lib/server/benchmark-domains.ts`, `lib/server/benchmark-repository.ts`)
- benchmark seed path and runner input contract (`scripts/benchmark-seed.ts`, `lib/server/benchmark-runner-contract.ts`)
- benchmark runner skeleton (`lib/server/benchmark-runner.ts`, `scripts/benchmark-runner.ts`)
- benchmark execution adapter boundary (`lib/server/benchmark-execution.ts`)
- benchmark citation extraction and `query_citations` write path (`lib/server/benchmark-citations.ts`)
- benchmark metric helper (`lib/server/benchmark-metrics.ts`)
- benchmark admin query layer (`lib/server/benchmark-admin-data.ts`)
- benchmark admin overview page (`app/dashboard/benchmarks/page.tsx`)
- benchmark run-group detail page (`app/dashboard/benchmarks/[runGroupId]/page.tsx`)
- benchmark domain history page (`app/dashboard/benchmarks/domains/[domainId]/page.tsx`)
- benchmark admin run trigger flow (`app/dashboard/benchmarks/actions.ts`, `components/benchmark-trigger-form.tsx`)
- first opt-in live benchmark execution lane for Gemini (`lib/server/benchmark-execution.ts`, `BENCHMARK_EXECUTION_*`)
- benchmark-domain onboarding from the admin UI (`components/benchmark-domain-form.tsx`, `app/dashboard/benchmarks/actions.ts`)
- benchmark query-set onboarding from the admin UI (`components/benchmark-query-set-form.tsx`, `app/dashboard/benchmarks/actions.ts`)
- first grounded-mode benchmark seam (`lib/server/benchmark-grounding.ts`, `lib/server/benchmark-runner.ts`, `lib/server/benchmark-execution.ts`)
- first structured grounding-provenance seam for grounded runs:
  - backward-compatible evidence normalization (`lib/server/benchmark-grounding.ts`)
  - run-time grounding snapshot persisted in run-group metadata (`lib/server/benchmark-runner.ts`)
  - grounding evidence visible on benchmark run detail (`app/dashboard/benchmarks/[runGroupId]/page.tsx`)
- first minimal grounding-context builder for grounded runs:
  - homepage fetch via existing validated fetch gate
  - likely about/services page discovery from homepage links
  - bounded excerpt extraction into grounded benchmark evidence

First live benchmark milestone achieved:
- real customer domain run executed successfully on `gemini-2.5-flash-lite`
- lightweight admin-authored query set executed end to end
- 6 completed query runs, 4 extracted citations, non-zero query coverage / citation rate / share of voice
- remaining reliability gap is temporary provider overload (`503 UNAVAILABLE`) and light retry/backoff handling, not missing benchmark scaffolding
- benchmark v1 now has an explicit `ungrounded_inference` vs `grounded_site` seam, but grounded evidence is still not exact-page provenance
- next methodology gap is page-level grounding provenance: the benchmark should evolve from domain-level grounded evidence toward structured evidence with source-page URLs and excerpts before any stronger citation-correctness claims are made
- the first provenance-inspection slice now exists, but evidence is still curated metadata rather than a live grounding-context builder
- the first live grounding-context builder now exists, but it is intentionally small and heuristic rather than a full crawl or best-page selection system

The current repo does not yet implement the benchmark platform:
- no real multi-model query measurement pipeline
- no persistent query → response → citation graph
- no live grounding-context builder that derives exact-page provenance automatically yet
- no broad or ranked grounding-context builder over multiple candidate pages yet
- no exact-page citation-quality scoring for grounded benchmark evidence yet
- no competitor benchmark corpus
- no 1000-site benchmark operations

That is why this roadmap is staged and tracked separately from launch closure.
