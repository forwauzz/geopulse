# Layer One Report Ambiguous Signal Wording v1

Last updated: 2026-03-30

## Purpose

Freeze the standard wording patterns for ambiguous or non-binary Layer One audit signals.

This document depends on:
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`
- `PLAYBOOK/layer-one-report-tone-and-verbosity-v1.md`
- `PLAYBOOK/layer-one-report-recommendation-format-v1.md`

This is still a design/documentation slice only.
It does not yet claim a new prompt or runtime implementation.

## Why this slice exists

Some of the most important Layer One findings are real but ambiguous.

Examples:
- `402/403` responses
- low-confidence extractability
- partial schema detection
- stale dates without obvious sitewide context
- weak trust signals
- mixed page-level outcomes

These are exactly the cases where rewritten reports tend to overstate certainty.

The goal of this slice is to standardize how those signals are described so future reports stay credible and consistent.

## Core pattern

For ambiguous signals, use this three-step wording structure:

1. observed signal
2. bounded implication
3. verification step

The report should not skip directly from observation to root cause.

## Default sentence templates

### Template A: ambiguous access or extraction issue

Use when the audit saw `402`, `403`, timeouts, or low-confidence extraction.

Pattern:
- `The audit saw [signal].`
- `This suggests [bounded implication].`
- `This should be verified by checking [specific follow-up].`

Example:
- `The audit saw low-confidence extractability with a 402/403 response.`
- `This suggests an access or delivery issue may be interfering with machine retrieval.`
- `This should be verified by checking bot rules, CDN behavior, and origin logs before treating it as a confirmed crawler block.`

### Template B: partial structure or schema signal

Use when the audit detected some structure but not enough to make a strong classification.

Pattern:
- `The audit detected [partial signal].`
- `This may mean [bounded implication].`
- `A manual page-level check should confirm whether [verification target].`

Example:
- `The audit detected limited or unclear schema signals.`
- `This may mean structured data is missing, incomplete, or not being exposed consistently.`
- `A manual page-level check should confirm whether the site has no meaningful schema or only partial implementation.`

### Template C: stale or limited freshness signal

Use when the audit found old visible dates or weak freshness indicators.

Pattern:
- `The audit found [freshness signal].`
- `This may reduce [bounded impact].`
- `A follow-up check should confirm whether [verification target].`

Example:
- `The audit found visible content dates from 2022 on core pages.`
- `This may reduce trust for time-sensitive or medically sensitive queries.`
- `A follow-up check should confirm whether the content itself is outdated or whether only the visible freshness signals are stale.`

### Template D: mixed page-level outcomes

Use when the homepage and key pages are not aligned cleanly.

Pattern:
- `The audit found mixed results across [page types].`
- `This suggests [bounded implication].`
- `A page-by-page review should confirm which templates or sections are driving the weaker outcome.`

Example:
- `The audit found mixed results across the homepage and core service pages.`
- `This suggests the site’s strongest and weakest templates may not be aligned structurally.`
- `A page-by-page review should confirm which templates are responsible for the lower scores.`

## Prohibited wording for ambiguous signals

Do not write:
- `This proves...`
- `This confirms...`
- `This means the site is definitely...`
- `This is caused by...`
- `AI systems are being blocked because...`
- `The site is losing visibility because of this exact root cause...`

unless separate evidence actually proves that claim.

## Approved bounded phrases

Prefer phrases like:
- `suggests`
- `may indicate`
- `may mean`
- `likely reduces`
- `appears inconsistent`
- `needs verification`
- `should be checked`
- `should be confirmed`

These phrases are not weak writing.
For ambiguous signals, they are the correct writing.

## Recommendation link rule

When an ambiguous signal produces a recommendation, the action should reflect uncertainty honestly.

Good example:
- `Action: Check bot handling and server logs for the 402/403 response before treating it as a confirmed crawler block.`

Bad example:
- `Action: Remove the AI bot paywall that is blocking all major crawlers.`

## Default confidence rule

When the recommendation depends on an ambiguous signal:
- default `Confidence` should usually be `Medium`

Use `High` only when the audit directly supports the exact fix.
Use `Low` when the recommendation is mainly strategic or depends on substantial follow-up validation.

## Non-goals for this slice

This slice does not yet define:
- the final universal rewrite prompt
- runtime enforcement
- new audit signals or retrieval methods
- any product UI changes

Those remain separate follow-up slices.

## Next slice

After this wording-pattern freeze, the next justified move is no longer another docs-only design slice.

The next justified slice should be implementation:
- apply these Layer One report rewrite rules in the actual prompt/runtime path

That implementation slice should update the real rewriter behavior against the now-frozen contract, evidence, tone, recommendation, and ambiguous-signal rules.
