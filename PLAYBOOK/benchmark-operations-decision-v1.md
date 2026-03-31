# Benchmark Operations Decision v1

Last updated: 2026-03-28

## Purpose

This document freezes the current operator decision for the 500 to 1000-site benchmark path after `BM-045`.

It is a decision record, not a build order for immediate implementation.

## Current decision

Do not split GEO-Pulse benchmark execution into a separate deployable benchmark service yet.

Keep benchmark work in the current repo and runtime until real operating evidence shows that the current cron/schedule path is no longer sufficient.

## Why this is the correct decision now

The repo now has:
- a working benchmark runner
- stored run groups, citations, and metrics
- admin inspection surfaces
- recurring scheduled sweeps
- explicit schedule launch caps
- early stop after repeated failures
- structured failure visibility on the current log path

That is enough to continue internal benchmark operations in the current system for the 100 to 200-domain stage.

It is not enough evidence to justify a separate benchmark service.

## What would justify a split later

Split into a separate deployable benchmark worker service only when at least one of these is true in real operations:

1. Customer-path reliability is threatened
   - benchmark work materially harms scan/report queue latency
   - benchmark windows create measurable degradation for customer-facing jobs

2. Schedule complexity becomes operationally brittle
   - replay, batching, or isolation logic becomes hard to reason about on the current cron path
   - operators need a separate benchmark control plane to run or recover batches safely

3. Cost controls require separate runtime boundaries
   - model spend ceilings, benchmarking windows, or provider fallback rules cannot be enforced cleanly in the shared runtime

4. Observability becomes insufficient
   - benchmark failures, queue lag, or run latency cannot be inspected clearly enough from the current logs/admin evidence

5. Scale proof exists
   - the team has actual evidence from repeated 100 to 200-domain sweeps showing that the next step is blocked by runtime boundaries rather than by methodology or operator process

## What does not justify a split

Do not split just because:
- the roadmap mentions a future benchmark service
- 500 to 1000 sites sounds strategically important
- the architecture would look cleaner on a diagram
- a later queue or workflow system might be useful

Those are not operating signals.

## Decision for the 100 to 200-domain stage

For the current stage, keep this posture:
- same repo
- same benchmark runner
- same cron/schedule entrypoint
- same admin inspection surfaces
- same structured log path

Use the current hardening first:
- capped scheduled launches
- repeated-failure stop
- benchmark frame/version discipline
- run-detail lineage inspection
- cohort-frame inspection

## Required evidence before reopening the split decision

Before revisiting a separate benchmark service, collect evidence from real benchmark operations such as:
- benchmark sweep summaries over multiple windows
- failed run counts
- early-stop events
- provider retry/failure patterns
- customer queue health during benchmark windows
- operator replay/recovery burden

Without that evidence, the split decision is still premature.

## Current recommendation for BM-046

BM-046 is complete when the repo states plainly:
- the 500 to 1000-site path is still planned, not implemented
- the current system remains the chosen runtime for now
- the split decision has explicit triggers
- scale claims remain downstream of real operator evidence

## Non-goals

This decision does not:
- approve 500 to 1000-site benchmark operations as shipped
- add a separate worker or queue today
- add a new benchmark UI
- change launch sequencing
