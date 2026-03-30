# Layer One Report Tone And Verbosity v1

Last updated: 2026-03-30

## Purpose

Freeze the default tone and verbosity rules for future Layer One report rewrites.

This document depends on:
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`

This is still a design/documentation slice only.
It does not yet claim a new prompt or runtime implementation.

## Why this slice exists

Even when a rewritten report stays inside the right factual boundaries, it can still read poorly.

The current failure mode is inflated presentation:
- consultancy-style language
- abstract strategic phrasing
- long repetitive framing
- high-confidence rhetoric that makes ordinary findings sound grand
- too much explanation before the actual action

For Layer One, that tone reduces trust.

The report should read like:
- a credible operator assessment
- a practical technical summary
- something a founder, marketer, or developer can act on quickly

It should not read like:
- a keynote
- a trend essay
- a strategy whitepaper
- a generic AI-generated consultancy memo

## Default tone

The default tone for Layer One rewritten reports should be:
- plain
- direct
- specific
- calm
- operational

The report may be polished.
It should not be theatrical.

## Default verbosity

Layer One rewritten reports should prefer:
- short paragraphs
- compact sections
- concrete bullets when useful
- fast movement from finding to action

They should avoid:
- long scene-setting intros
- repeated restatement of the same risk
- multiple paragraphs of market framing before any audit-backed finding
- long conclusion sections that repeat earlier sections

## Opening rule

Do not open with broad claims about the future of search, the restructuring of digital discovery, or the state of the industry.

Open with the site and the audit result.

Good pattern:
- identify the site
- state the score or high-level condition
- name the most important issues

Bad pattern:
- generalized claims about 2026 search behavior
- broad strategic manifestos
- dramatic framing before site-specific facts

## Sentence style

Prefer sentences that are:
- under control
- concrete
- easy to scan

Prefer:
- `The audit found no H1 on the homepage.`
- `This may weaken topic clarity for machines and users.`
- `Add one clear H1 that names the clinic and primary service.`

Avoid:
- layered metaphors
- rhetorical flourishes
- inflated abstractions such as `machine-trusted authority infrastructure`
- phrases that sound smarter than they are informative

## Word choice rules

Prefer:
- `found`
- `detected`
- `missing`
- `unclear`
- `may`
- `likely`
- `should`
- `check`
- `update`
- `add`
- `fix`

Avoid unless clearly necessary:
- `fundamental`
- `transformative`
- `definitive`
- `critical opportunity`
- `only sustainable strategy`
- `authoritative presence in the generative era`
- `credentialing in code`
- `semantic gateway`
- `high-density roadmap`

The bias is toward plain English over marketing language.

## Recommendation style

Recommendations should sound implementable, not inspirational.

Prefer:
- what is wrong
- why it matters
- what to change next

Avoid:
- motivational framing
- broad strategic slogans
- large roadmap narration when one concrete next step would do

## Table and list bias

Use lists or tables when they reduce ambiguity.

Prefer lists for:
- confirmed findings
- priority actions
- follow-up checks

Do not create tables just to make the report feel larger or more formal.

## Conclusion rule

If a conclusion exists, it should be short.

It should:
- summarize the main risk
- restate the immediate next step

It should not:
- re-explain the whole report
- introduce new strategic claims
- escalate the tone at the end

## Compression rule

When deciding whether to include more narrative:
- cut repeated framing first
- cut generic GEO commentary second
- keep findings and actions

Layer One should optimize for usefulness, not word count.

## Non-goals for this slice

This slice does not yet define:
- the exact recommendation formatting schema
- the universal rewrite prompt text
- the actual runtime/prompt implementation
- any retrieval, extraction, or scoring changes

Those remain separate follow-up slices.

## Next slice

After this tone and verbosity freeze, the next justified slice is:
- `L1-RW-004` recommendation formatting

That slice should make the action section more consistent without changing the factual or tonal boundaries frozen so far.
