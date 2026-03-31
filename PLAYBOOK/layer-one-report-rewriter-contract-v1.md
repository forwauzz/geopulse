# Layer One Report Rewriter Contract v1

Last updated: 2026-03-30

## Purpose

Freeze the required output contract for Layer One audit report rewriting before changing evidence-discipline, tone, or retrieval inputs.

This is a writing-contract slice only.
It does not claim a new prompt, model, or runtime implementation yet.

## Why this exists

Recent external LLM rewrites can sound polished while overstating what the underlying Layer One audit actually proved.

The main failure mode is not formatting.
It is trust drift:
- audit observations get blended with speculative GEO strategy
- weak signals are presented as hard diagnosis
- unsupported market claims are presented as facts
- optional ideas are framed as mandatory remediation

Before tightening those behaviors, the repo needs one frozen report shape.

## Contract goals

Every Layer One rewritten report should be:
- evidence-first
- easy for an operator or customer to trust
- explicit about what was observed versus inferred
- actionable without sounding inflated
- compatible with the current lean product/report culture

## Required section order

All Layer One rewritten reports should use this order:

1. Executive summary
2. Confirmed audit findings
3. Likely implications
4. Priority actions
5. Optional advanced GEO improvements
6. Open questions and follow-up checks

## Section requirements

### 1. Executive summary

Must:
- summarize the overall state briefly
- mention the most important blocking issues
- stay close to the underlying audit output

Must not:
- introduce new market statistics
- make broad industry claims
- imply certainty the audit did not establish

### 2. Confirmed audit findings

This section is for audit-backed observations only.

Allowed content:
- score and grade
- missing or present structural elements
- freshness dates when observed
- schema gaps when observed
- extractability failures when observed
- trust/security findings when observed

Required behavior:
- each finding should read as an observed fact from the audit
- if the audit confidence is weak or partial, say that explicitly

### 3. Likely implications

This section translates findings into likely meaning without overstating certainty.

Required behavior:
- use bounded wording such as `suggests`, `may`, `likely`, or `needs verification`
- keep implications tied directly to findings already listed above

Must not:
- claim root cause when the audit only showed a symptom
- present speculative GEO theory as proven site behavior

### 4. Priority actions

This section is the main operator output.

Each action should be formatted as:
- issue
- why it matters
- recommended action
- priority

Actions should be grouped in practical order:
- immediate
- near-term
- later

### 5. Optional advanced GEO improvements

This section is for non-blocking ideas only.

Examples:
- `llms.txt`
- richer schema expansion beyond the core gap
- advanced Q&A restructuring
- deeper AI-visibility monitoring

Required behavior:
- label this section as optional
- do not mix these items into confirmed remediation unless the audit explicitly supports that move

### 6. Open questions and follow-up checks

This section captures what the audit could not fully establish.

Examples:
- whether a `402/403` came from bot blocking, rate limiting, or another access-control rule
- whether a schema container exists but is only partially populated
- whether key pages differ materially from the homepage signal

This section exists to keep uncertain items from being written as confirmed diagnosis.

## Minimum writing rules

Even before the evidence-discipline slice, this contract freezes a few baseline rules:
- separate `confirmed finding` from `implication`
- separate `priority action` from `optional improvement`
- prefer plain operational language over consultancy-style phrasing
- do not add sections outside the contract unless a later slice explicitly changes the contract

## Explicit non-goals for this slice

This contract does not yet define:
- the exact universal prompt text
- the evidence-discipline blacklist for unsupported claims
- the final tone/verbosity rules
- retrieval or extraction changes
- customer-facing UI/report rendering changes

Those should be separate follow-up slices.

## Next slice

After this contract freeze, the next justified slice is:
- `L1-RW-002` evidence-discipline rules

That slice should tighten what the rewriter is allowed to claim while keeping this section order unchanged.
