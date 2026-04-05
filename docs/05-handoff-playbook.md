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
This is not a prototype-only repo. The paid flow, queue, report generation, dashboard, admin eval analytics, and guided results journey all exist.
Shared light/dark mode infrastructure is now active across app chrome, with startup-dashboard persistence covered by a focused Playwright spec.

### The main unfinished work is operational
The highest priority unfinished work is launch closure, not another feature branch.

### The deep-audit core scale path is already shipped
DA-004 is complete in repo; future Workflows exploration is optional, not the current main gap.

### Retrieval work is staged
Promptfoo, deterministic retrieval persistence, and admin drilldown exist.
RAGAS runtime and benchmark claims do not.

### Measurement-platform work is planned, not shipped
The repo now carries an explicit roadmap for a future benchmark/measurement layer.
Treat `PLAYBOOK/measurement-platform-roadmap.md` as the planning source, but do not present those capabilities as implemented unless the corresponding `BM-*` tasks are closed with evidence.

## Safe Continuation Paths

### Path A: launch-first
- finish DNS
- finish security sign-off
- finalize WAF position

### Path B: deep-audit scale
- only revisit Workflows or extreme-scale benchmarking after consciously deciding it outranks launch closure
- treat the existing chunked queue path as the baseline, not a placeholder

### Path C: retrieval/eval later
- do not start with `ragas`
- expand datasets and offline retrieval scenarios first
- keep site identity stable when writing repeated Promptfoo or retrieval runs

### Path D: measurement platform later
- keep the current audit/report product stable
- start with internal benchmark schemas and one narrow benchmark runner
- do not jump straight to 1000-site operations

## How To Update This Handoff Set

When major implementation state changes:
1. update `agents/memory/COMPLETION_LOG.md`
2. update `agents/memory/PROJECT_STATE.md`
3. update the relevant `docs/*.md` files
4. keep wording truthful about what is implemented vs deferred
