# Ragas Fit Evaluation

## Task

`RE-007` — Evaluate `ragas` fit for retrieval faithfulness / answer relevance and produce a go/no-go note before implementation.

## Current repo state

- `RE-001`: retrieval-eval scope is defined.
- `RE-002`: retrieval-eval schema foundation exists.
- `RE-003`: deterministic retrieval simulation exists.
- `RE-005`: Promptfoo regression harness exists.
- `RE-006`: Promptfoo suites cover executive summary extraction, fix specificity, and status preservation.

What does not exist yet:

- a sizable retrieval dataset sourced from real scan runs
- a stable answer-generation layer fed by retrieved passages
- any human-labeled baseline for faithfulness / relevance disagreement cases
- production use of external AI engines for retrieval benchmarking

## Decision

**Decision:** No-go for `ragas` implementation right now.

## Why this is a no-go today

### 1. The baseline is still deterministic

The current retrieval foundation is intentionally deterministic. That is the correct first step because it gives GEO-Pulse a debuggable baseline for:

- expected-source retrieval
- expected-fact matching
- citation counting
- unsupported-claim counting

Adding `ragas` before the baseline dataset matures would make it difficult to tell whether score movement is caused by:

- retrieval quality
- answer-generation changes
- prompt changes
- `ragas` metric sensitivity

### 2. The dataset is too small and synthetic

The current Promptfoo / retrieval fixtures are representative, but they are still synthetic. `ragas` becomes more valuable when there is a broader set of:

- real scanned domains
- prompt sets per domain
- expected evidence / source mappings
- disagreement cases where deterministic checks are insufficient

Without that, `ragas` risks creating an illusion of rigor instead of usable signal.

### 3. There is no external benchmark claim to support yet

GEO-Pulse is not yet making public retrieval-quality benchmark claims. That removes the pressure to add a heavier metric stack immediately. The next priority is better internal regression confidence, not model-graded score complexity.

## What is enough for now

The current stack is sufficient for the next phase:

- deterministic retrieval metrics in `lib/server/retrieval-eval.ts`
- Promptfoo regression suites for report and retrieval behavior
- explicit backlog separation between retrieval foundation and future benchmark work

This is the right level of complexity for the current product stage.

## Revisit criteria

Re-evaluate `ragas` only after all of the following are true:

1. at least 25 to 50 real retrieval cases exist across multiple scanned domains
2. each case has expected sources and expected facts captured
3. the answer-generation step is stable enough that regressions are meaningful
4. Promptfoo regression coverage is no longer the main bottleneck
5. deterministic metrics are producing disagreement cases that need a softer semantic metric

## If revisited later

Start small:

1. run `ragas` offline only
2. keep deterministic metrics as the primary gate
3. compare `ragas` outputs against deterministic metrics on the same fixture set
4. adopt only metrics that add new signal

Recommended first candidates:

- faithfulness
- answer relevance
- context precision

Do not make customer-facing percentile or benchmark claims from `ragas` alone.
