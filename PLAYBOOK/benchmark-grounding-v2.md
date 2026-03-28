# Benchmark Grounding v2

Last updated: 2026-03-28

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

Current repo truth:
- grounded runs now support a first minimal grounding-context builder
- if manual `grounding_context.evidence` is absent, the runner can fetch the homepage and likely about/services pages to derive a small curated evidence set
- this is intentionally narrow and bounded; it is not a general crawl or retrieval system
- exact citation-to-grounding provenance now exists only for conservative exact URL matches; domain-only mentions remain unresolved

### Mode B2: grounded site interpretation with page provenance

Prompt asks the model the same question from curated site evidence, but the evidence is no longer one loose text blob.

Each evidence item should carry:
- `page_url`
- `page_type`
  - `homepage`
  - `about`
  - `services`
  - `other`
- `excerpt`
- optional `evidence_label`

Purpose:
- preserve the grounded-interpretation gain from Mode B
- make it possible to inspect which exact page supported the answer
- separate "the site helped" from "this exact page supported the claim"

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

### 4. page-level provenance

Definition:
- whether the answer can be traced back to one or more specific site pages used as evidence

This is stronger than domain citation alone.

### 5. page citation quality

Definition:
- whether the answer cites the exact page URL when appropriate, not just the root domain

This should be treated as a later benchmark-quality signal, not an immediate customer-facing score.

## What should change in implementation later

Not in `BM-024`.
This is a later benchmark-methodology task.

Future implementation shape:

1. add a benchmark grounding context builder
   - homepage text
   - about-page text if available
   - optional services text
   - status: first minimal implementation now exists in repo; future work is breadth and quality, not reintroducing the seam

2. add benchmark prompt modes
   - `ungrounded_inference`
   - `grounded_site`

3. store benchmark mode in run metadata

4. compare the same domain/query set across the two modes

5. evolve grounded evidence into structured page-level records
   - `page_url`
   - `page_type`
   - `excerpt`
   - optional `evidence_label`

6. update grounded prompts so the model can cite the exact supporting page when the evidence clearly maps to a page

7. inspect page-level provenance separately from domain-level citation presence

Current implementation gap after the first builder slice:
- the builder is still heuristic and bounded, even though it now ranks a small same-origin candidate set instead of hard-coding only homepage/about/services
- it fetches a very small bounded page set, not a site-wide crawl
- it does not yet prove best-page selection
- exact URL matches are now preserved on citation rows, but the benchmark does not yet score whether the model cited the best supporting page
- it does not yet perform excerpt-level or semantic matching between answer claims and grounded evidence

Documented follow-up sequence in `PROJECT_STATE.md`:
- `BM-033`: freeze the next grounded-provenance sequence and keep slices separate
- `BM-034` ... `BM-035`: improve grounding-page selection and metadata before widening matching logic
- `BM-036` ... `BM-038`: add richer provenance matching and exact-page citation-quality evaluation in narrow internal slices
- `BM-039`: add grounded vs ungrounded comparison views for methodology inspection

Current grounded metadata truth after `BM-035`:
- evidence snapshots now carry `fetch_order`, `selection_reason`, explicit page title, and fetch status
- this metadata is for internal inspection and later provenance work, not a score

Current provenance truth after `BM-036`:
- citation-to-grounding matching now supports two conservative cases:
  - exact URL equivalence
  - normalized page equivalence (`www`, trailing slash, fragment, default port, and tracking-param differences ignored)
- the matcher still does not infer provenance across different paths, different pages on the same site, or domain-only mentions

Current claim-evidence truth after `BM-037`:
- grounded citation metadata now carries a lightweight claim-to-evidence overlap signal based on the best matching response sentence and the matched evidence excerpt
- this is internal inspection metadata only and must not be presented as semantic factuality or a customer-facing benchmark score

Current exact-page quality truth after `BM-038`:
- the first exact-page citation-quality metric now exists as an internal run-quality signal
- it counts completed runs where the measured-domain citation both:
  - matches a grounded page
  - has a `supported_overlap` claim/evidence signal
- this is intentionally separate from citation presence and share-of-voice

Current comparison truth after `BM-039`:
- the benchmark domain history page now shows the latest grounded vs ungrounded pair for the same query set and model
- comparisons stay internal and inspectable only: they show mode, timing, metric deltas, and grounded exact-page quality without creating a customer-facing benchmark claim
- this remains a read-only admin slice layered onto the existing benchmark history surface, not a new benchmark architecture

## BM-033 grounded-provenance sequence

`BM-033` freezes the next implementation order so benchmark work improves methodology without turning into a broad rewrite.

Execution order after `BM-032`:

1. `BM-034` grounded candidate selection
   - improve how the benchmark chooses a small bounded set of same-origin pages
   - goal: better evidence inputs, not new scoring claims

2. `BM-035` richer grounding metadata
   - persist why a page was selected and basic fetch/title facts
   - goal: make later provenance work inspectable, not customer-facing

3. `BM-036` provenance matching beyond exact URL equality
   - add one conservative matcher layer beyond the current exact-string match
   - unresolved cases must remain unresolved

4. `BM-037` excerpt-level claim-to-evidence checks
   - add internal evidence compatibility metadata only
   - do not collapse this into a shipped score yet

5. `BM-038` exact-page citation-quality metric
   - only after the earlier provenance inputs and matching are stable
   - must remain separate from citation presence and share-of-voice

6. `BM-039` grounded vs ungrounded comparison UI
   - expose methodology deltas for internal inspection after the data is credible enough
   - status: complete as a narrow admin history comparison table

## BM-033 non-goals

`BM-033` explicitly does not authorize:
- a benchmark-wide refactor across unrelated modules
- customer-facing benchmark claims or customer-facing provenance scores
- semantic provenance inference that guesses on weak evidence
- broad competitor/cohort benchmark implementation before methodology is frozen
- multi-model or large-scale ops work before the provenance path is stronger
- replacing the current seams in `benchmark-grounding`, `benchmark-citations`, `benchmark-runner`, or `benchmark-admin-data`

This allows GEO-Pulse to say internally:
- “the brand is ambiguous in open inference”
- “the site itself is or is not clarifying the business when grounded”
- “the answer was or was not supported by a specific page on the site”

## Provenance-first design note

The current grounded route is useful but limited:
- it measures whether the model answers better when given site evidence
- it now proves exact-page sourcing only when the model cites the same page URL as the grounded evidence
- it still does not infer provenance for domain-only mentions or ambiguous references

The next design step should therefore prefer:
- structured evidence records over one freeform evidence blob
- page provenance over domain-only attribution
- inspectable source-page references over implicit grounding

The benchmark should eventually support two related but distinct checks:

1. domain attribution
- did the answer explicitly mention the measured domain?

2. page provenance
- can the answer be tied back to the exact page or excerpt that supported it?

Those should not be collapsed into one metric.

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

4. implementation of structured page-level provenance over grounded evidence

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
- the future path to exact-page provenance is explicit so grounded evidence is not mistaken for full live-site retrieval
