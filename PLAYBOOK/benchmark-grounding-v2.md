# Benchmark Grounding v2

Last updated: 2026-03-27

## Purpose

This note defines the next benchmark-methodology improvement after the current v1 live benchmark proof.

It exists to solve a specific truth gap discovered during founder verification:
- public Gemini chat produced a grounded, correct explanation of the business
- the current benchmark runner sometimes produced a generic or wrong business-type inference

So the next benchmark evolution should improve methodology, not widen scope.

## What happened

Observed founder test:
- benchmark run on a real domain produced some incorrect business-type interpretations
- Gemini chat, asked the same plain question against the same website, produced a much better grounded answer

Interpretation:
- benchmark v1 is operational
- benchmark v1 is not yet fully representative of the best grounded model behavior

This is not a reason to discard the benchmark layer.
It is a reason to evolve the benchmark protocol carefully.

## Design goal

The next benchmark iteration should separate:

1. Ungrounded brand inference
2. Grounded site-based interpretation
3. Citation presence and citation correctness

These are different signals and should not be blurred together.

## Proposed benchmark modes

### Mode A: ungrounded inference

Prompt asks the model the question with only minimal brand/domain identity.

Purpose:
- measure how the model infers the business from weak context
- useful for discovering naming ambiguity and category confusion

This is close to current benchmark v1 behavior.

### Mode B: grounded site interpretation

Prompt asks the model the same question, but includes:
- normalized site URL
- extracted grounding text from the homepage or about page
- optional short service snippets from top pages
- instruction to answer only from the provided site evidence

Purpose:
- measure whether the site itself communicates the business clearly
- reduce generic category hallucination

This is the next methodology layer that should be built.

### Mode C: citation/correctness check

Prompt asks the model to answer normally, then measure:
- whether the domain is cited
- whether the citation is explicit
- whether the business description is directionally correct

This can remain internal-only until methodology is mature.

## New internal concepts

### 1. business-type interpretation accuracy

This is not a customer-facing score yet.

Definition:
- whether the model identifies the business class correctly

Example:
- correct: health-tech consulting / healthcare technology consulting
- incorrect: direct healthcare provider / clinic / medical practice

This signal matters even when the domain is cited, because a citation with the wrong entity type is still commercially weak.

### 2. grounding sufficiency

Definition:
- whether the provided site evidence was enough for the model to answer in a way that matches the site

This is a methodology signal, not a marketing claim.

### 3. citation correctness

Definition:
- the domain was cited and the surrounding description is compatible with the grounded site evidence

This should remain manual or semi-manual before becoming a hard automated metric.

## What should change in implementation later

Not in `BM-024`.
This is a later benchmark-methodology task.

Future implementation shape:

1. add a benchmark grounding context builder
   - homepage text
   - about-page text if available
   - optional services text

2. add benchmark prompt modes
   - `ungrounded_inference`
   - `grounded_site`

3. store benchmark mode in run metadata

4. compare the same domain/query set across the two modes

This allows GEO-Pulse to say internally:
- “the brand is ambiguous in open inference”
- “the site itself is or is not clarifying the business when grounded”

## What should not happen yet

Do not:
- expose this as a customer-facing score immediately
- claim full factuality scoring
- add another giant benchmark subsystem before retry/backoff hardening
- widen the benchmark surface before improving the protocol

## Sequencing

The correct order is:

1. `BM-024`
   - retry/backoff for transient provider overload

2. benchmark protocol design follow-up
   - grounded vs ungrounded execution mode

3. implementation of grounded context builder

So this document is intentionally downstream of the next benchmark implementation step.

## Why this matters strategically

This is the difference between:
- “we ran prompts and got answers”
and
- “we can distinguish between vague brand inference and evidence-grounded site understanding”

That is much closer to a defensible measurement system.

## Acceptance bar

This note is complete when:
- the new methodology goal is explicit
- grounded vs ungrounded benchmark modes are separated
- entity/business-type misclassification is recognized as a real benchmark signal
- sequencing remains anchored to `BM-024` first
