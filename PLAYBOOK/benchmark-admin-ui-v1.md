# Benchmark Admin UI v1

Last updated: 2026-03-26

## Purpose

This document defines the first internal admin views and controls for the benchmark layer.

It is intentionally admin-only and internal-first.

No customer-facing benchmark UI should be built before these views exist and the underlying data model proves stable.

## Existing admin pattern to preserve

The current repo already has a clear admin pattern:
- server-rendered pages
- auth-guarded with `requireAdminOrRedirect`
- query-param filters
- summary cards
- trend visuals where useful
- tabular run history
- drilldown pages for row-level inspection

Reference surfaces:
- `/dashboard/evals`
- `/dashboard/evals/retrieval/[id]`
- `/dashboard/attribution`

Benchmark admin should reuse this pattern.

## First pages to add

### 1. `/dashboard/benchmarks`

Purpose:
- top-level internal benchmark dashboard
- list benchmark run groups
- show quick status and recent activity

Sections:
- summary cards
- recent run groups table
- filters for:
  - domain
  - query set
  - model
  - status

Summary cards:
- total run groups
- completed runs
- failed runs
- average query coverage

Primary table columns:
- created at
- run label
- domain
- query set
- model
- status
- query coverage
- citation rate
- actions

Actions:
- view detail
- rerun later

### 2. `/dashboard/benchmarks/[runGroupId]`

Purpose:
- detail page for one benchmark run group

Sections:
- run metadata
- domain metadata
- model lane metadata
- summary metric cards
- query lineage inspection
- query run table
- citation table or citation summary

Metric cards:
- query coverage
- citation rate
- share of voice
- completed queries
- failed queries

Query-run table columns:
- query key
- prompt text
- status
- citation count
- response present
- execution timestamp

Optional detail block:
- expandable raw response preview
- extracted citations preview

Lineage inspection requirement:
- the detail page should let an operator inspect one query as a chain:
  - prompt
  - response
  - extracted citations
  - grounded evidence/provenance status where available

This should remain read-only and internal.
It is an inspectability surface, not a new benchmark orchestration layer.

### 3. `/dashboard/benchmarks/domains/[domainId]`

Purpose:
- show benchmark history for one domain across run groups
- show any stored narrow cohort frames that include the domain

Sections:
- domain summary
- metric trend cards
- trend line(s)
- cohort-frame comparison panel
- run history table

Trend metrics:
- citation rate over time
- query coverage over time
- share of voice over time

This page becomes important once repeated runs exist.

Cohort-frame panel:
- read-only internal comparison only
- one stored cohort frame at a time:
  - one query set version
  - one model lane
  - one run mode
- show the current domain beside a few named competitor domains
- link back to each domain history and any latest comparable run detail

## First controls to allow

Allowed in v1:
- filter runs
- inspect one run group
- inspect one domain’s history

Avoid in first UI pass:
- inline editing of benchmark queries
- inline editing of metric formulas
- customer-visible toggles
- bulk multi-run orchestration from the browser

## Run controls

The first run controls should be narrow and explicit.

Recommended controls:
- “Run one benchmark” button in admin
- fields:
  - domain
  - query set
  - model lane
  - optional notes

This should trigger a single internal action path, not a generic orchestration console.

Do not add yet:
- freeform arbitrary prompts in the admin UI
- multi-domain batch launch from browser
- customer self-serve run triggers

## Data displayed vs hidden

Display:
- benchmark identifiers
- run status
- metrics
- response/citation summary
- enough raw text to debug parsing

Hide or gate:
- provider secrets
- verbose internal trace ids unless useful
- unbounded raw payloads that make the UI unreadable

## Relationship to Langfuse

If Langfuse exists later:
- benchmark detail pages may link to traces
- but they should not depend on Langfuse to function

The app UI remains the operational dashboard.
Langfuse remains supporting observability.

## Relationship to eval admin

Benchmark admin should be adjacent to eval admin, not merged with it immediately.

Reason:
- evals measure internal quality/regression
- benchmarks measure external visibility outcomes

They are related, but not the same surface.

Recommended nav adjacency:
- `/dashboard/evals`
- `/dashboard/benchmarks`
- `/dashboard/attribution`

## First success criteria

The benchmark admin UI is useful when an admin can:
1. see that a run happened
2. see whether it completed or failed
3. inspect query-level outcomes
4. inspect extracted citations
5. compare a domain’s runs over time

If the UI cannot support those five actions, it is too shallow.

## Non-goals for v1

Do not build:
- public benchmark pages
- customer-facing benchmark rankings
- fancy heatmaps
- benchmark leaderboard marketing pages
- cross-tenant public comparisons

Those are later, after methodology and data volume justify them.

## Recommended implementation order

1. `/dashboard/benchmarks`
2. `/dashboard/benchmarks/[runGroupId]`
3. `/dashboard/benchmarks/domains/[domainId]`

## Acceptance bar for BM-007

This UI plan is complete when:
- first benchmark admin surfaces are explicitly named
- each page has a clear purpose
- allowed controls are explicit
- non-goals are explicit
- the plan aligns with current admin UI patterns in the repo
