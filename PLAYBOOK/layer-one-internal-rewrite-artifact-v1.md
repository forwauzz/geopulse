# Layer One Internal Rewrite Artifact v1

## Purpose

Freeze the smallest justified implementation contract for introducing an internal rewritten Layer One markdown artifact alongside the current deterministic paid report.

This slice is intentionally narrow:
- one additional internal artifact
- no customer-facing switch yet
- no paid-path replacement yet
- no research-mode expansion
- no Promptfoo or RAGAS runtime dependency

## Why This Slice Exists

The repo now has:
- a frozen Layer One rewrite contract
- frozen evidence, tone, recommendation, and ambiguity rules
- a local rewrite-prompt seam
- a gold rewritten fixture
- automatic deterministic report eval rows in admin

What it does not yet have is a real product-path comparison seam between:
- the current deterministic markdown report
- a constrained rewritten markdown variant

Without that seam, report-quality improvement remains manual and anecdotal.

## Scope

This slice should introduce only:

1. one internal rewritten markdown artifact generated after the deterministic markdown exists
2. one stable way to store or address that rewritten artifact separately from the current markdown
3. one internal-only comparison path for operators
4. one deterministic eval row for the rewritten artifact so trend tracking can compare versions over time

## Non-Goals

This slice must not:

- replace the shipped paid report by default
- modify crawl depth, retrieval, or page coverage
- introduce external-research augmentation into the paid flow
- move Promptfoo, RAGAS, or other eval frameworks into runtime
- add a broad report-management subsystem
- create a new customer promise before internal review confirms improvement

## Artifact Contract

The deterministic markdown remains the source artifact.

The rewritten artifact should be:
- derived from that deterministic markdown
- stored separately
- clearly labeled as rewritten / internal
- traceable to the deterministic source that produced it

Minimum metadata linkage:
- `scan_id`
- deterministic generator version
- rewrite generator version
- rewrite prompt or ruleset identity

The rewritten artifact must not overwrite the original markdown artifact.

## Delivery Boundary

During this slice:
- customer-facing results/report UX should continue to use the current deterministic artifact
- internal review may inspect both versions
- paid delivery remains stable unless a later explicit slice changes the default

## Evaluation Boundary

The rewritten artifact should receive its own `report_eval_runs` row.

That row should:
- stay under the existing `layer_one_report` framework
- identify itself as rewritten via generator version / metadata
- allow side-by-side historical comparison with deterministic report output

This slice should reuse the current deterministic structural/report-integrity eval seam rather than introduce a second eval system.

## Implementation Order

The next implementation slices should stay in this order:

1. freeze this internal-artifact contract
2. add the rewritten-artifact storage/write seam
3. add rewritten-artifact eval write
4. add internal-only comparison access
5. decide later whether the rewritten artifact is good enough to change the paid default

## Acceptance Shape

This slice is successful when the repo has one explicit frozen rule set that says:
- the rewritten report is an additional internal artifact first
- the deterministic report remains the customer-facing source of truth for now
- evaluation must compare both paths before any customer-facing replacement is allowed
