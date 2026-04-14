# Measurement Platform Roadmap

Last updated: 2026-03-28

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
- first benchmark query lineage inspection on the existing run-detail page:
  - prompt -> response -> extracted citations -> grounded evidence status
  - implemented by extending the current run-detail surface rather than adding a new benchmark route
- first narrow competitor/cohort storage and admin slice:
  - explicit `benchmark_cohorts` and `benchmark_cohort_members` storage
  - read-only cohort-frame comparison panel on the existing domain history page
- first multi-model live benchmark lane support on the existing execution boundary:
  - one provider/key/endpoint
  - multiple enabled model ids via env allowlist
  - no new benchmark orchestration surface
- first benchmark schedule hardening for 100 to 200-domain internal sweeps:
  - capped launches per sweep
  - early stop after repeated failures
  - structured failure visibility on the existing log path
- first benchmark-operations decision freeze after schedule hardening:
  - keep the current repo/runtime for now
  - document explicit triggers for any future service split
- first grounded-mode benchmark seam (`lib/server/benchmark-grounding.ts`, `lib/server/benchmark-runner.ts`, `lib/server/benchmark-execution.ts`)
- first structured grounding-provenance seam for grounded runs:
  - backward-compatible evidence normalization (`lib/server/benchmark-grounding.ts`)
  - run-time grounding snapshot persisted in run-group metadata (`lib/server/benchmark-runner.ts`)
  - grounding evidence visible on benchmark run detail (`app/dashboard/benchmarks/[runGroupId]/page.tsx`)
- first exact-url citation-to-grounding provenance slice for grounded runs:
  - deterministic grounding `evidence_id` on evidence snapshots (`lib/server/benchmark-grounding.ts`)
  - citation rows preserve matched grounded page fields only when the cited URL exactly matches grounded evidence (`lib/server/benchmark-citations.ts`, `lib/server/benchmark-runner.ts`)
  - benchmark run detail shows whether a citation matched a grounded source page or remained unresolved (`components/benchmark-run-detail-view.tsx`)
- second conservative provenance matcher for grounded runs:
  - citations can also match by normalized page equivalence when the page is clearly the same despite weak URL-shape differences
  - different paths and domain-only mentions still remain unresolved
- internal claim-to-evidence overlap metadata for grounded runs:
  - matched grounded citations now carry a lightweight overlap signal between the chosen claim sentence and the matched evidence excerpt
  - this is for internal inspection only and does not create a customer-facing metric or semantic fact-check score
- first exact-page citation-quality metric slice:
  - `exact_page_quality_rate` now measures completed runs where the measured-domain citation both matches a grounded page and has a `supported_overlap` claim/evidence signal
  - this remains separate from citation presence and share-of-voice, and is still an internal benchmark-quality signal
- richer grounding-page metadata on evidence snapshots:
  - `fetch_order`, `selection_reason`, explicit page title, and fetch status are persisted in run metadata
  - this supports later provenance work without adding a new benchmark route shape or customer-facing score
- first minimal grounding-context builder for grounded runs:
  - homepage fetch via existing validated fetch gate
  - bounded ranked same-origin candidate discovery from homepage links, with strong preference for about/services/product-style pages
  - bounded excerpt extraction into grounded benchmark evidence

First live benchmark milestone achieved:
- real customer domain run executed successfully on `gemini-2.5-flash-lite`
- lightweight admin-authored query set executed end to end
- 6 completed query runs, 4 extracted citations, non-zero query coverage / citation rate / share of voice
- remaining reliability gap is temporary provider overload (`503 UNAVAILABLE`) and light retry/backoff handling, not missing benchmark scaffolding
- benchmark v1 now has an explicit `ungrounded_inference` vs `grounded_site` seam, and the first exact-page provenance slice exists for exact URL matches only
- next methodology gap is richer citation-grounding provenance: move from exact URL equivalence toward stronger page selection and citation-quality checks without guessing unresolved mentions
- the first provenance-inspection slice now exists, but evidence is still curated metadata rather than a live grounding-context builder
- the first live grounding-context builder now exists, but it is intentionally small and heuristic rather than a full crawl or best-page selection system

The current repo does not yet implement the benchmark platform:
- no real multi-model query measurement pipeline
- no persistent query → response → citation graph
- no live grounding-context builder that derives broad exact-page provenance automatically across a ranked page set yet
- no broad or ranked grounding-context builder over multiple candidate pages yet
- no exact-page citation-quality scoring for grounded benchmark evidence yet
- no competitor benchmark corpus
- no 1000-site benchmark operations

That is why this roadmap is staged and tracked separately from launch closure.

Current backlog translation:
- these gaps are now tracked explicitly in `agents/memory/PROJECT_STATE.md` as `BM-033` ... `BM-046`
- the intended order is methodology discipline first, then grounding/provenance quality, then comparison/history, then cohorting, then scale
- do not collapse this into one large benchmark rewrite; future implementation should preserve the existing seams in `lib/server/benchmark-grounding.ts`, `lib/server/benchmark-citations.ts`, `lib/server/benchmark-runner.ts`, and `lib/server/benchmark-admin-data.ts`

Grounded-provenance sequence frozen by `BM-033`:
- first improve page selection (`BM-034`) and inspectable metadata (`BM-035`)
- only then widen provenance matching (`BM-036`) and excerpt-level evidence checks (`BM-037`)
- only after that define an exact-page citation-quality metric (`BM-038`)
- the first comparison UI slice (`BM-039`) is now complete on the benchmark domain history page, pairing latest grounded and ungrounded runs for the same query set and model
- the first recurring internal benchmark scheduling slice (`BM-040`) now exists on the Worker cron path:
  - the recurring lane is env-configured, bounded, and idempotent by UTC day
  - it reuses the existing benchmark runner instead of creating a second benchmark execution path
  - scheduled runs now carry explicit run scope and schedule metadata so history stays comparable over time
- competitor/cohort methodology is now frozen by `BM-041` in `PLAYBOOK/benchmark-competitor-cohort-methodology-v1.md`
- the first run-level lineage inspection slice (`BM-043`) now exists on `/dashboard/benchmarks/[runGroupId]`
- the first comparative cohort implementation slice (`BM-042`) now exists as explicit cohort storage plus a read-only domain-history comparison panel
- the cohort slice builds on the lineage path instead of replacing it, so comparative inspection still resolves back to run-level evidence
- the first multi-model execution slice (`BM-044`) now exists by extending the existing execution adapter/config seam rather than adding provider-specific benchmark routing
- the first benchmark-scale hardening slice (`BM-045`) now exists on the current cron/schedule path rather than a separate benchmark service
- the 500 to 1000-site decision slice (`BM-046`) is now frozen in `PLAYBOOK/benchmark-operations-decision-v1.md`: do not split into a separate benchmark service yet without real operating evidence
- the first recurring collection operating slice now exists in `PLAYBOOK/benchmark-collection-operations-v1.md`:
  - start with `law_firms` priority `1`
  - keep one query set and one model lane fixed
  - use explicit seed import plus a twice-daily 12-hour schedule window
- deeper scale implementation work stays downstream of that decision
- this sequencing is intentionally designed to protect the current architecture and avoid a single large benchmark rewrite
