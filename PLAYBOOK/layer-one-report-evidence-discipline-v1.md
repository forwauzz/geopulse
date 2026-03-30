# Layer One Report Evidence Discipline v1

Last updated: 2026-03-30

## Purpose

Freeze the minimum evidence-discipline rules for future Layer One report rewrites.

This document depends on:
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`

This is still a design/documentation slice only.
It does not yet claim a new prompt or runtime implementation.

## Why this slice exists

Once the report shape is fixed, the next failure mode is claim quality.

Recent rewritten reports can still fail even with a clean structure when they:
- invent industry statistics
- turn weak signals into hard diagnosis
- present optional GEO strategy as required remediation
- add “2026 standard” language without source support
- attribute strategic claims to the audit when the audit never established them

This slice freezes what the rewriter must not do.

## Core rule

A Layer One rewritten report may only present something as a confirmed fact when that fact is directly supported by the underlying audit input.

Everything else must be clearly framed as one of:
- likely implication
- hypothesis needing verification
- optional strategic recommendation

## Claim classes

### 1. Confirmed findings

Allowed only when directly supported by the audit.

Examples:
- score and grade
- missing H1
- missing or partial schema detection
- stale freshness date when observed
- extractability failure or low-confidence extraction when observed
- alt-text coverage percentage when observed
- missing security headers when observed

Required wording:
- `The audit found...`
- `The scan observed...`
- `The report detected...`

### 2. Bounded implications

Allowed when directly connected to a confirmed finding, but not fully proven.

Examples:
- a missing H1 may weaken semantic anchoring
- a `402/403` may indicate access-control or bot-handling issues
- stale content may reduce trust for high-sensitivity queries

Required wording:
- `This suggests...`
- `This may mean...`
- `This likely reduces...`
- `This needs verification before treating it as root cause...`

### 3. Optional strategic recommendations

Allowed only when clearly labeled optional and kept separate from required remediation.

Examples:
- `llms.txt`
- more advanced schema layering after core schema gaps are fixed
- deeper GEO monitoring or AI-citation tracking
- broader content restructuring experiments

Required wording:
- `Optional next step...`
- `Advanced follow-up...`
- `Later-stage GEO improvement...`

## Prohibited claim patterns

Until a later slice explicitly widens scope, the rewriter must not:

### Invent unsupported market statistics

Do not add numbers such as:
- AI Overview share percentages
- citation-position percentages
- referral conversion uplifts
- market adoption rates
- visibility benchmarks

unless those numbers are present in provided source material and are explicitly cited as external context.

### Invent root causes from weak signals

Do not convert:
- `402/403`
- low-confidence extraction
- partial schema detection
- weak trust signals

into confident causal claims such as:
- `the edge is blocking AI crawlers`
- `the site is misidentifying premium bots`
- `internal linking is the cause`
- `the model is hallucinating because of this issue`

without separate evidence.

### Invent operational facts not present in the audit

Do not fabricate specifics such as:
- exact image counts
- page counts
- review counts
- physician credential details
- success rates
- update cadence
- brand-monitoring outcomes

unless the audit input actually includes them.

### Overstate “standards” or “best practices”

Do not write:
- `the 2026 standard is...`
- `modern AI systems require...`
- `the only sustainable strategy is...`

unless that statement is explicitly grounded in provided source material and labeled as external context rather than audit fact.

### Collapse optional GEO ideas into mandatory remediation

Do not present:
- `llms.txt`
- `llms-full.txt`
- advanced content Q&A restructuring
- AI brand sentiment monitoring

as core required fixes unless the product explicitly decides to support that position in a later slice.

## Required uncertainty handling

When the audit signal is real but the cause is unclear, the report must:
1. state the observed signal
2. explain the likely impact cautiously
3. name the verification step

Example pattern:
- observed: `The audit saw low-confidence extractability with a 402/403 response.`
- implication: `This suggests an access or delivery issue may be interfering with machine retrieval.`
- follow-up: `Server logs or bot-handling rules should be checked before treating this as a confirmed crawler block.`

## Required attribution boundary

The rewriter must preserve this boundary:
- audit-backed facts come from the Layer One audit
- strategy recommendations come from GEO-Pulse judgment

Those two should not be blended into one voice that implies the audit itself proved the strategy.

## Default writing bias

When choosing between a stronger claim and a weaker but defensible claim:
- choose the weaker defensible claim

When choosing between a strategic idea and an audit-backed fix:
- prioritize the audit-backed fix

When a claim cannot be defended from the audit input:
- omit it

## Non-goals for this slice

This slice does not yet define:
- the exact shorter/plainer tone rules
- the final recommendation formatting contract
- the universal rewrite prompt text
- any retrieval or scan-method changes

Those remain separate follow-up slices.

## Next slice

After this evidence-discipline freeze, the next justified slice is:
- `L1-RW-003` tone and verbosity cleanup

That slice should improve trust and readability further without weakening the claim boundaries frozen here.
