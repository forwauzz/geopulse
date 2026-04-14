# Layer One Report Recommendation Format v1

Last updated: 2026-03-30

## Purpose

Freeze the required formatting shape for recommendations inside future Layer One report rewrites.

This document depends on:
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`
- `PLAYBOOK/layer-one-report-tone-and-verbosity-v1.md`

This is still a design/documentation slice only.
It does not yet claim a new prompt or runtime implementation.

## Why this slice exists

Even a factual, well-toned report can still be weak if the action section is inconsistent.

The current failure mode is recommendation drift:
- some fixes are concrete
- some are vague
- some mix issue, rationale, and action together
- some sound strategic but do not tell the operator what to do next

Layer One recommendations should be mechanically easy to scan and compare.

## Core rule

Every recommendation in the `Priority actions` section should follow the same compact action-card shape.

## Required action-card fields

Each recommendation should include:
- `Issue`
- `Why it matters`
- `Action`
- `Priority`
- `Confidence`

These labels should be explicit in the rewritten report.

## Field definitions

### Issue

A short statement of the specific problem.

Good examples:
- `Homepage has no H1`
- `Extractability is low-confidence because the audit saw a 402/403 response`
- `Core pages appear stale`

Bad examples:
- `Authority foundation needs improvement`
- `Semantic clarity opportunity`

## Why it matters

A short explanation tied to audit-backed impact.

Good examples:
- `Without a clear H1, the page topic is harder to parse consistently.`
- `If machine retrieval cannot access the page reliably, AI systems may not use the site as a live source.`

This field should stay short.
It is not a second essay.

## Action

A concrete next step.

Good examples:
- `Add one clear H1 that names the clinic and primary service on the homepage.`
- `Check bot handling, CDN rules, and origin logs for the 402/403 response before treating it as a crawler block.`
- `Update the oldest procedure pages and refresh their visible modified dates if applicable.`

Bad examples:
- `Improve content authority`
- `Strengthen machine readability`
- `Adopt a modern GEO posture`

## Priority

Allowed values:
- `Immediate`
- `Near-term`
- `Later`

Use:
- `Immediate` for blockers or likely high-impact remediation
- `Near-term` for important but non-blocking improvements
- `Later` for non-blocking enhancements after core fixes

## Confidence

Allowed values:
- `High`
- `Medium`
- `Low`

This confidence is about the recommendation fit, not about the site’s health overall.

Use:
- `High` when the audit directly supports the fix
- `Medium` when the recommendation is sensible but still partly inferential
- `Low` when the recommendation depends on follow-up verification or is more strategic than audit-proven

## Formatting example

Recommended output shape:

```text
- Issue: Homepage has no H1
  Why it matters: The main page topic is harder to parse consistently without a primary heading.
  Action: Add one clear H1 that names the clinic and primary service.
  Priority: Immediate
  Confidence: High
```

Or, if the implementation later prefers tighter formatting:

```text
- Homepage has no H1
  - Why it matters: The main page topic is harder to parse consistently without a primary heading.
  - Action: Add one clear H1 that names the clinic and primary service.
  - Priority: Immediate
  - Confidence: High
```

The exact visual style can vary later.
The field content may not vary.

## Ordering rules

Recommendations should be ordered by:
1. priority
2. likely impact
3. implementation clarity

That means:
- blockers first
- high-confidence structural fixes next
- optional or verification-dependent actions later

## Recommendation count

Default target:
- 3 to 7 recommendations in the `Priority actions` section

Avoid:
- one giant undifferentiated list
- dozens of micro-fixes
- long roadmap narration inside this section

If there are more ideas than fit cleanly:
- keep the core fixes in `Priority actions`
- move the rest to `Optional advanced GEO improvements`

## Recommendation boundaries

Recommendations must obey the earlier freezes:
- do not state unsupported root causes as if they were proven
- do not use inflated language
- do not present optional GEO ideas as required remediation

## Non-goals for this slice

This slice does not yet define:
- the final universal rewrite prompt
- runtime enforcement
- retrieval changes
- any change to the user-facing product report renderer

Those remain separate follow-up slices.

## Next slice

After this recommendation-format freeze, the next justified slice is:
- `L1-RW-005` ambiguous-signal wording patterns

That slice should standardize how the rewrite layer talks about findings like `402/403`, weak extraction, partial schema, and similar non-binary signals.
