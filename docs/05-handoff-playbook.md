# Handoff Playbook

## Purpose

This file is the shortest path for a new developer or LLM to continue work safely.

## Read Order

1. `docs/01-current-state.md`
2. `docs/02-implementation-map.md`
3. `docs/04-open-work-and-risks.md`
4. `SECURITY.md`
5. `agents/memory/PROJECT_STATE.md`
6. `agents/memory/COMPLETION_LOG.md`

## Rules To Preserve

- Do not mark work complete without evidence.
- Do not overclaim launch readiness.
- Do not bypass SSRF protections for any fetch path.
- Do not put `service_role` or other secrets in client-side code.
- Do not treat Browser Rendering as enabled unless operator config exists.

## What A New Team Should Know First

### The product is real
This is not a prototype-only repo. The paid flow, queue, report generation, and dashboard all exist.

### The main unfinished work is operational
The highest priority unfinished work is launch closure, not another feature branch.

### The main deep-audit unfinished engineering item is scale
DA-004 remainder is still the substantive engineering gap.

### Retrieval work is staged
Promptfoo and deterministic retrieval foundations exist.
Ragas and benchmark claims do not.

## Safe Continuation Paths

### Path A: launch-first
- finish DNS
- finish security sign-off
- finalize WAF position

### Path B: deep-audit scale
- continue DA-004 only after consciously deciding it outranks launch closure
- design Workflows orchestration with the existing chunked queue path as baseline

### Path C: retrieval/eval later
- do not start with `ragas`
- expand datasets and offline retrieval scenarios first

## How To Update This Handoff Set

When major implementation state changes:
1. update `agents/memory/COMPLETION_LOG.md`
2. update `agents/memory/PROJECT_STATE.md`
3. update the relevant `docs/*.md` files
4. keep wording truthful about what is implemented vs deferred
