# Measurement Schema v1

Last updated: 2026-03-26

## Purpose

This document defines the first benchmark/measurement schema set for GEO-Pulse.

It is a design spec, not yet a migration.

The goal is to support:
- internal benchmark runs
- query → response → citation storage
- time-series metric computation
- future competitor / cohort comparisons

It does **not** yet imply:
- customer-facing benchmark claims
- public ranking APIs
- 1000-site production operations

## Design principles

1. Keep the current audit/report product intact.
2. Reuse normalized site identity across audit and benchmark layers.
3. Separate raw observations from computed metrics.
4. Make runs versionable by query set and model lane.
5. Default to service-role-only writes until the methodology is stable.

## Relationship to existing schema

Existing tables already cover:
- `scans`
- `scan_runs`
- `scan_pages`
- `reports`
- `report_eval_runs`
- `retrieval_eval_runs`

The benchmark layer should join to those by normalized domain identity when useful, but should not depend on a paid report existing.

## Proposed tables

### 1. `benchmark_domains`

Purpose:
- canonical site identity for measurement work
- shared join point for customers, competitors, and cohort members

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `domain TEXT NOT NULL`
- `canonical_domain TEXT NOT NULL`
- `site_url TEXT`
- `display_name TEXT`
- `vertical TEXT`
- `subvertical TEXT`
- `geo_region TEXT`
- `is_customer BOOLEAN NOT NULL DEFAULT false`
- `is_competitor BOOLEAN NOT NULL DEFAULT false`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `canonical_domain`

Indexes:
- `benchmark_domains_vertical_idx (vertical)`
- `benchmark_domains_customer_idx (is_customer, created_at desc)`

Notes:
- `canonical_domain` is the normalized grouping key
- `site_url` is informational and may change without changing identity

### 2. `benchmark_query_sets`

Purpose:
- versioned bundles of prompts/queries for a benchmark lane

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `name TEXT NOT NULL`
- `vertical TEXT`
- `version TEXT NOT NULL`
- `description TEXT`
- `status TEXT NOT NULL DEFAULT 'draft'`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `(name, version)`

Indexes:
- `benchmark_query_sets_vertical_idx (vertical, created_at desc)`

Allowed `status` values:
- `draft`
- `active`
- `archived`

### 3. `benchmark_queries`

Purpose:
- individual benchmark questions inside a query set

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `query_set_id UUID NOT NULL REFERENCES public.benchmark_query_sets(id) ON DELETE CASCADE`
- `query_key TEXT NOT NULL`
- `query_text TEXT NOT NULL`
- `intent_type TEXT NOT NULL`
- `topic TEXT`
- `weight NUMERIC(6,3) NOT NULL DEFAULT 1`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `(query_set_id, query_key)`

Indexes:
- `benchmark_queries_query_set_idx (query_set_id)`
- `benchmark_queries_intent_idx (intent_type)`

Allowed `intent_type` values:
- `direct`
- `comparative`
- `discovery`

### 4. `benchmark_run_groups`

Purpose:
- top-level batch identity for a benchmark execution
- version boundary for queries, models, and cohort scope

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `query_set_id UUID NOT NULL REFERENCES public.benchmark_query_sets(id) ON DELETE RESTRICT`
- `label TEXT NOT NULL`
- `run_scope TEXT NOT NULL DEFAULT 'internal_benchmark'`
- `model_set_version TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'queued'`
- `notes TEXT`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `started_at TIMESTAMPTZ`
- `completed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:
- `benchmark_run_groups_query_set_idx (query_set_id, created_at desc)`
- `benchmark_run_groups_status_idx (status, created_at desc)`

Allowed `status` values:
- `queued`
- `running`
- `completed`
- `failed`
- `cancelled`

### 5. `query_runs`

Purpose:
- raw record of one domain + one query + one model execution

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `run_group_id UUID NOT NULL REFERENCES public.benchmark_run_groups(id) ON DELETE CASCADE`
- `domain_id UUID NOT NULL REFERENCES public.benchmark_domains(id) ON DELETE CASCADE`
- `query_id UUID NOT NULL REFERENCES public.benchmark_queries(id) ON DELETE CASCADE`
- `model_id TEXT NOT NULL`
- `auditor_model_id TEXT`
- `status TEXT NOT NULL DEFAULT 'queued'`
- `response_text TEXT`
- `response_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `error_message TEXT`
- `executed_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `(run_group_id, domain_id, query_id, model_id)`

Indexes:
- `query_runs_run_group_idx (run_group_id, created_at desc)`
- `query_runs_domain_idx (domain_id, created_at desc)`
- `query_runs_query_idx (query_id, created_at desc)`
- `query_runs_model_idx (model_id, created_at desc)`
- `query_runs_status_idx (status, created_at desc)`

Allowed `status` values:
- `queued`
- `running`
- `completed`
- `failed`
- `skipped`

Notes:
- `auditor_model_id` exists because target model and analysis model may diverge later
- raw response should be preserved before extraction or scoring

### 6. `query_citations`

Purpose:
- parsed citation/mention outcome for a single query run

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `query_run_id UUID NOT NULL REFERENCES public.query_runs(id) ON DELETE CASCADE`
- `cited_domain TEXT`
- `cited_url TEXT`
- `rank_position INTEGER`
- `citation_type TEXT NOT NULL DEFAULT 'explicit_url'`
- `sentiment TEXT`
- `confidence NUMERIC(5,4)`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:
- `query_citations_query_run_idx (query_run_id)`
- `query_citations_domain_idx (cited_domain)`
- `query_citations_url_idx (cited_url)`

Allowed `citation_type` values:
- `explicit_url`
- `explicit_domain`
- `brand_mention`
- `paraphrased_reference`

Allowed `sentiment` values:
- `positive`
- `neutral`
- `negative`
- `unknown`

Notes:
- do not require citation presence; a query run may have zero citation rows
- early benchmark metrics should still tolerate empty citation outcomes

### 7. `benchmark_domain_metrics`

Purpose:
- computed metrics for one domain within one benchmark run group and model lane

Columns:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `run_group_id UUID NOT NULL REFERENCES public.benchmark_run_groups(id) ON DELETE CASCADE`
- `domain_id UUID NOT NULL REFERENCES public.benchmark_domains(id) ON DELETE CASCADE`
- `model_id TEXT NOT NULL`
- `citation_rate NUMERIC(6,3)`
- `share_of_voice NUMERIC(6,3)`
- `query_coverage NUMERIC(6,3)`
- `inference_probability NUMERIC(6,3)`
- `drift_score NUMERIC(6,3)`
- `metrics JSONB NOT NULL DEFAULT '{}'::jsonb`
- `computed_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `(run_group_id, domain_id, model_id)`

Indexes:
- `benchmark_domain_metrics_run_group_idx (run_group_id, created_at desc)`
- `benchmark_domain_metrics_domain_idx (domain_id, created_at desc)`
- `benchmark_domain_metrics_model_idx (model_id, created_at desc)`

Notes:
- `drift_score` may remain null in early versions
- `metrics` holds extensible per-model aggregates without schema churn

## Identity and normalization rules

Required shared rules:
- normalize all domains to lowercase
- strip protocol and `www.` for `canonical_domain`
- preserve original `site_url` separately
- use one canonical domain per measured site
- do not treat prompt-set variation as domain identity

This is critical because benchmark, eval, and audit history all become misleading if site identity drifts.

## RLS and access model

Initial rule:
- enable RLS on all benchmark tables
- create no anon/auth policies initially
- treat writes as service-role only

Reason:
- methodology is still internal
- benchmark data may include competitor/cohort information not ready for customer access

## First metric definitions

These are v1 operational definitions, not final market claims.

### `citation_rate`
- fraction of completed query runs for a domain/model that yielded at least one qualifying citation row

### `query_coverage`
- fraction of benchmark queries executed successfully for that domain/model within the run group

### `share_of_voice`
- domain citations divided by total qualifying citations across the benchmark cohort for the same run group/model

### `inference_probability`
- placeholder computed field derived from early citation outcomes and query weights
- should remain internal until methodology is hardened

### `drift_score`
- null in early versions unless compared to a previous compatible run group

## Out of scope for v1

Do not include yet:
- public benchmark rankings
- customer-visible percentile claims
- automated competitor discovery
- benchmark cohorts / snapshots as first-class tables
- pre-publish scoring outputs
- vector-store-specific retrieval simulation tables

Those can come after the raw measurement pipeline proves itself.

## Migration sequencing recommendation

Recommended order:
1. add `benchmark_domains`
2. add `benchmark_query_sets` and `benchmark_queries`
3. add `benchmark_run_groups`
4. add `query_runs`
5. add `query_citations`
6. add `benchmark_domain_metrics`
7. enable RLS and indexes in the same migration set

## Acceptance bar for BM-002

This schema spec should be considered complete when:
- the table set is frozen enough to drive a first migration
- identity rules are explicit
- metric semantics are explicit enough for BM-006
- access model is explicit
- out-of-scope items are clearly excluded
