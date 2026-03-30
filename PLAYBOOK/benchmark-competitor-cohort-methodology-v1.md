# Benchmark Competitor Cohort Methodology v1

Last updated: 2026-03-28

## Purpose

This document freezes the first methodology rules for competitor and cohort benchmarking.

It exists to prevent GEO-Pulse from making comparative benchmark claims before the benchmark layer can support them honestly.

This is a methodology and guardrail document first.
It is not permission to ship a broad competitor benchmark product.

## Why this exists now

The repo already has:
- a working internal benchmark runner
- grounded and ungrounded run modes
- citation provenance inspection
- exact-page quality inspection for grounded runs
- recurring internal benchmark scheduling
- a first run-detail admin flow

That is enough to start defining comparative methodology.
It is not enough to market comparative benchmark outputs casually.

## Core truth

Competitor and cohort benchmarking must remain:
- internal-first
- narrow in scope
- explicitly versioned
- caveated by query set, model lane, and run mode

No comparative result should be presented as universal brand truth.
Every comparison is only valid within one frozen benchmark frame.

## Benchmark frame

A competitor or cohort comparison is only valid when all compared domains share the same:
- query set id and version
- model id
- run mode
- run scope rules
- benchmark window
- metric definitions

If any of those differ, the comparison is exploratory only and must not be shown as a ranked cohort result.

## First allowed cohort shapes

Allowed in v1:
- one internal customer domain versus a small named competitor set
- one narrow internal cohort for a single vertical
- one benchmark frame at a time

Cap the first cohort shape conservatively:
- 3 to 10 domains in one cohort
- one vertical only
- one query set version only
- one primary model lane only

Not allowed in v1:
- mixed-vertical cohorts
- broad internet-wide leaderboards
- dynamic public rankings
- mixing grounded and ungrounded results in one score
- mixing runs from materially different benchmark windows into one cohort claim

## Domain-role rules

Every benchmarked domain in a comparative frame must have one explicit role:
- measured_customer
- competitor
- peer_reference

For v1, only `measured_customer` and `competitor` should drive comparative UI.
`peer_reference` can remain a later extension if it becomes necessary.

Do not infer role from domain metadata after the fact.
Role must be explicit in stored cohort configuration.

## Query set rules

Comparative benchmark query sets must be frozen before runs are compared.

Required rules:
- every query set must have a clear name and version
- each query should belong to one narrow demand frame
- comparative queries should remain bounded and interpretable
- branded, category, and alternative-seeking intents should be distinguishable in metadata

Do not:
- mix exploratory prompts with high-intent buyer prompts without labeling
- add or remove queries mid-series and pretend the time series stayed comparable
- compare cohorts using ad hoc one-off prompts from the browser

## Run-window rules

Comparative results are sensitive to time and provider drift.

For v1:
- cohort runs should be launched in one bounded benchmark window
- comparison UI should prefer the latest run per domain inside the same benchmark frame
- if one domain is missing a valid run in the frame, the cohort comparison is incomplete

Do not compare:
- a fresh customer run against a stale competitor run from a different window
- a failed or partial run as if it were equivalent to a complete run

## Metric rules

First allowed comparison metrics:
- query coverage
- citation rate
- share of voice
- exact-page quality rate for grounded runs only

Metric guardrails:
- show exact-page quality only when every compared run is `grounded_site`
- do not average grounded and ungrounded runs into one blended quality score
- keep citation presence separate from citation quality
- keep rank/ordering language conservative unless sample size and run completeness are clear

## Evidence limits

Comparative UI must remain inspectable.

That means a cohort result is only acceptable when an operator can drill down to:
- the exact query set version
- the exact compared domains
- the exact run ids
- the per-query response text
- the per-query citations

If the operator cannot inspect the underlying query lineage, the comparative surface is too abstract for v1.

## Claim language rules

Allowed internal language:
- "In this benchmark frame"
- "For this query set and model lane"
- "In the latest comparable run window"
- "This is an internal comparative signal, not a universal ranking"

Not allowed:
- "best in AI search"
- "category leader"
- "industry rank #1"
- "objective market position"

Those claims require more methodology and repetition than v1 supports.

## First implementation guidance for BM-042

Keep the first cohort slice lean:
- store narrow cohort membership and role metadata
- reuse the existing benchmark domain and admin data seams
- extend the current admin surfaces instead of creating a benchmark subsystem
- prefer read-only comparison views before adding more run orchestration

The first cohort slice should answer one question well:
"For one frozen frame, how did one measured customer compare to a few named competitors?"

## Relationship to BM-043

BM-043 is a dependency in practice for trustworthy cohort inspection.

Reason:
- comparative metrics without query lineage are too opaque
- the run-detail page must let an operator inspect prompt -> response -> citation -> grounded evidence status before broader cohort claims are trusted

That means BM-042 should build on top of the lineage inspection path, not replace it.

## Non-goals

This methodology does not approve:
- customer-facing competitor benchmarks
- automated leaderboard marketing pages
- broad cohort scoring across mixed benchmark frames
- multi-model weighted composite rankings
- benchmark claims without run-level evidence

## Acceptance bar for BM-041

BM-041 is complete when:
- competitor and cohort comparison rules are frozen in writing
- the benchmark frame is explicit
- metric and claim guardrails are explicit
- evidence requirements are explicit
- BM-042 implementation is constrained to a narrow internal slice
