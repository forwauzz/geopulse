# Benchmark Scale Path

Last updated: 2026-03-28

## Purpose

This document defines the realistic path from a small internal benchmark cohort to a 500 to 1000 domain benchmark operation without destabilizing the current GEO-Pulse audit/report product.

It is deliberately conservative.
The customer-facing audit flow remains the priority path.
Benchmark freshness must not take precedence over scan, checkout, report generation, or delivery.

## Non-Negotiable Isolation Rules

These rules apply at every benchmark phase:

- benchmark jobs never run on the customer request path
- benchmark execution must remain asynchronous
- customer-facing scan and report queues take priority over benchmark work
- benchmark failures must not block audit/report delivery
- benchmark methodology must stay internal until metric definitions are stable
- benchmark claims should remain cohort-relative and caveated until repeatability is proven

## Current Runtime Reality

The current repo already uses Cloudflare Workers and Cloudflare Queues for the product path.
That is good enough for the first benchmark phases, but only if the benchmark layer stays narrow.

Current operational constraints that matter:

- Cloudflare queue capacity and daily ops are finite
- customer scan/report traffic already depends on queue reliability
- free-tier and low-cost provider limits are still relevant
- benchmark runs will be slower and more bursty than customer scans

That means the correct first move is not to build a giant cross-model platform.
The correct first move is to prove the benchmark data model and run discipline on a bounded cohort.

## Phase A: Internal Cohort Proof

### Target size

- 20 to 50 domains
- 1 to 2 verticals
- 10 to 20 queries per domain
- 1 to 2 model lanes

### Execution model

- manual run-group trigger only
- serial execution inside each run-group
- one run-group at a time per benchmark lane
- no customer-facing dependency on benchmark completion

### Infra posture

- same repo
- same Supabase project
- no separate deployable benchmark service yet
- no Temporal / Prefect yet
- no Qdrant yet

### Goals

- prove schema correctness
- prove raw response persistence
- prove citation extraction usefulness
- prove metric recomputation is deterministic enough for reruns

### Exit criteria

- at least 3 benchmark reruns on the same cohort
- stable persistence for query runs and citations
- metrics visible in admin-only benchmark views
- no measurable disruption to customer scan/report paths

## Phase B: Controlled Recurring Benchmarking

### Target size

- 100 to 200 domains
- 2 to 4 vertical cohorts
- 15 to 30 queries per domain
- still cap at 2 model lanes initially

### Execution model

- scheduled recurring run-groups
- strict concurrency caps
- separate benchmark trigger path from customer-triggered paths
- benchmark reruns batched by cohort, not all domains at once

### Infra posture

- keep same repo and shared storage
- introduce logical queue isolation
- add benchmark-specific worker entrypoints or message types
- add explicit replay and failure review for benchmark batches

### Required protections

- benchmark batch budget per day
- benchmark concurrency caps per provider
- alerting for batch failures
- benchmark runs paused automatically if customer queue lag grows
- hard caps for scheduled launches per sweep
- early stop after repeated benchmark-run failures with structured visibility

### Goals

- prove recurring benchmark cadence
- prove cohort comparisons over time
- prove cost and provider limits are manageable

### Exit criteria

- recurring weekly runs succeed on at least 2 cohorts
- queue lag stays acceptable during benchmark windows
- benchmark failures can be replayed without manual data repair
- benchmark metrics support time-series comparisons

## Phase C: Pre-Scale Benchmark Operations

### Target size

- 250 to 500 domains
- more complete competitor cohorts
- model-lane growth only if the earlier phases remain stable

### Execution model

- benchmark windows, not continuous saturation
- dedicated benchmark worker capacity
- explicit backpressure controls
- benchmark batches split by vertical and run-group version

### Infra posture

- separate benchmark queue from customer scan/report queue
- DLQ and replay become mandatory
- stronger run-cost accounting
- stronger observability for provider failures, queue age, and run latency

### Required protections

- queue partitioning between customer work and benchmark work
- daily spend ceilings by provider
- provider fallback rules
- snapshot versioning for query sets and model lanes

### Goals

- prove that benchmark operations are operationally distinct
- prove customer-facing product reliability remains intact
- prove the first internal benchmark index is credible enough to guide product decisions

### Exit criteria

- customer queue health stays green during benchmark windows
- benchmark reruns complete without ad hoc intervention
- run-group, citation, and metric history remain queryable at acceptable latency

## Phase D: 500 to 1000 Domain Benchmarking

### Target size

- 500 to 1000 domains
- multiple vertical cohorts
- controlled competitor set coverage

### Execution model

- benchmark work treated as its own production workload
- benchmark jobs run in dedicated windows or lanes
- customer workloads always preempt benchmark workloads

### Infra posture

- strongly consider separate deployable benchmark worker service
- only now evaluate Temporal or Prefect if queue orchestration is too brittle
- only now consider broader retrieval-simulation infrastructure like Qdrant

Current BM-046 decision:
- this remains a future path, not the current implementation choice
- keep the benchmark workload in the current repo/runtime until real 100 to 200-domain operating evidence shows the current cron/schedule path is no longer sufficient
- decision record: `PLAYBOOK/benchmark-operations-decision-v1.md`

### Required protections

- dedicated benchmark workers or services
- explicit cost dashboards
- benchmark SLA defined separately from product SLA
- replayable batch orchestration
- stable metric snapshotting and versioning

### Goals

- operate a repeatable benchmark program, not an ad hoc experiment
- support internal index publication and customer-facing cohort insights
- create a real foundation for future API work without entangling the current product

## Recommended Queue and Worker Isolation Path

Do this incrementally:

1. Phase A:
   keep one shared infra base, but benchmark runs are manual and low-volume
2. Phase B:
   separate benchmark message types and benchmark worker handlers
3. Phase C:
   separate benchmark queue from customer queue
4. Phase D:
   decide whether benchmark execution should move into its own deployable worker service

This is the safest way to build the moat without harming the wedge.

## Provider and Cost Discipline

The benchmark layer must not assume unlimited model access.

Recommended discipline:

- start with one primary model lane and one comparison lane
- version all model lanes in metadata
- capture token and cost metadata per run where possible
- cap benchmark queries per day
- do not add more model lanes until the smaller cohort proves useful

## What This Plan Explicitly Avoids

- launching a public benchmark before methodology stabilizes
- claiming 1000-site capability before operational proof exists
- tying customer UX to benchmark freshness
- mixing benchmark execution into the paid audit generation path
- splitting into microservices too early

## Decision Rule for Splitting the Service

Do not split the measurement layer into a separate deployable service just because the architecture document says it might become one.

Split only when at least one of these becomes true:

- benchmark workload materially threatens customer queue latency
- benchmark orchestration complexity becomes hard to reason about in the current worker layout
- benchmark cost controls require separate deployment and scaling boundaries
- benchmark observability is meaningfully worse because it shares runtime concerns with the product path

Until then, the correct move is a staged internal subsystem in the current repo.

## BM-046 decision freeze

After `BM-045`, the repo decision is:
- do not split into a separate benchmark service yet
- treat the current capped schedule path as the right posture for the present stage
- reopen the split decision only after real operating evidence shows customer-path risk, schedule brittleness, cost-boundary pressure, or observability failure

This keeps the architecture factual instead of premature.

## Recommended Next Implementation Order

1. implement the first benchmark schema migration
2. implement one internal benchmark runner lane
3. persist raw responses and citations
4. compute first metrics and show them in admin
5. run a small cohort manually
6. add recurring cohort runs only after the small cohort is stable

This keeps the product honest and the architecture factual.
