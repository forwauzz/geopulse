# RD-002 — Executive Brief Contract v1

Last updated: 2026-03-30

## Purpose

Freeze the required shape and content rules for the Executive Brief — the new opening section of the paid report.

This document depends on:
- `PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`
- `PLAYBOOK/layer-one-report-tone-and-verbosity-v1.md`

This is a design/documentation slice only.
It does not change the runtime report generator, the PDF, or the web report UI yet.

---

## Why this slice exists

The current paid report opens with a score table and a category breakdown.

That structure answers: "What did the audit find?"

A CRO-level reader does not start there. They start with:
- "What is the condition of our AI search position?"
- "Who on my team needs to act on this?"
- "What is the single most important thing to do first?"

The Executive Brief answers those three questions on its own.
It is written so that a CRO who reads nothing else can still act.
It is also written so that a CRO can forward the full report to relevant team leads with a one-line message: "Your section starts on page X." (Not every report will have findings for all four owner areas — Product currently has no implemented checks. The brief covers whichever owners have active findings.)

---

## Position in the report

The Executive Brief is the first substantive section of the paid report.
It appears before the Team Action Map, the technical detail, and the appendix.

Section order per `rd-005-section-order-contract-v1.md` (design frozen, implementation pending):

```
1. Executive Brief           ← this document defines
2. Immediate Wins            ← rd-006-immediate-wins-format-v1.md
3. Team Action Map           ← rd-010 (not yet written)
4. Score Summary
5. What AI-Ready Leaders Do Differently
6. Coverage Summary
— Appendix (technical detail) —
```

---

## What the Executive Brief must contain

The Executive Brief has four required elements, in this order:

### 1. Site condition statement

One or two sentences.
States the domain, the overall score, the letter grade, and the high-level readiness condition.
Must be audit-backed. No invented framing.

Allowed pattern:
> "[domain] received a score of [X]/100 ([grade]) on this AI Search Readiness Audit.
> The audit identified [N] checks that need attention across [N] team areas."

Must not:
- open with industry claims or market trends
- use dramatic framing before the score
- imply competitive standing the audit did not measure

---

### 2. Three-finding summary

Exactly three findings. One per bullet.
Each finding names the issue, its team owner, and the plain-language consequence.
Each must be directly supported by a failed or warning check in the audit.

Required shape per bullet:
> **[Team owner]:** [Short issue statement] — [plain-language consequence].

Examples:
> **Engineering:** AI crawlers may be partially restricted in robots.txt — search engines trained on live content may not be indexing this site fully.
> **Content:** Pages lack clear Q&A or structured information patterns — AI systems may have difficulty extracting quotable answers from this content.
> **Brand:** Author attribution and an About page are missing — this weakens the credibility signals AI systems use when deciding whether to cite a source.

Rules:
- Use the four owners from `rd-001-team-owner-taxonomy-v1.md` exactly: Engineering, Content, Brand, Product
- If a category has no failed checks, do not invent a finding for it
- If the Product check gap means Product has nothing to report, omit it and use the three most significant findings across the remaining owners
- Consequence language must be bounded: "may", "likely", "suggests" — not "is preventing" or "is costing"
- Do not rank findings as "critical" or assign severity labels here — that belongs in the Team Action Map

---

### 3. Primary action directive

One sentence. The single most important thing to do first.
Must map to the highest-weight failed check in the audit.
Must name the team owner responsible.

Allowed pattern:
> "The immediate priority is [action] — this is an [owner] task and is the highest-weight gap in this audit."

Examples:
> "The immediate priority is allowing AI crawlers in robots.txt — this is an Engineering task and is the highest-weight gap in this audit."
> "The immediate priority is adding structured Q&A content to the top pages — this is a Content task and is the highest-weight gap in this audit."

Rules:
- One directive only. Do not list a second or third priority here — those belong in Immediate Wins (RD-006)
- Must be concrete enough that someone can act on it without reading the rest of the report
- Must not use vague language like "strengthen your AI presence" or "optimize for discoverability"

---

### 4. Directional exposure statement

One to three sentences.
Frames the business relevance of the audit findings in plain language.
Must be audit-derived and bounded. No numeric estimates. No revenue figures.

This is not a revenue calculation. It is a directional signal about what the audit findings likely mean for the business.

Allowed patterns:
> "High-intent discovery in [category] is increasingly routed through AI-generated answers.
> The gaps in this audit suggest [domain] is not yet positioned to be cited consistently in those answers.
> Closing the highest-priority gaps is likely the fastest path to improving AI search visibility."

> "The audit found that [X of Y] checks in the [highest-weight category] category are failing.
> This suggests there are addressable gaps in how AI systems read and interpret this site's content.
> The action plan in this report targets the most impactful gaps first."

Rules:
- No invented statistics (no percentages, no citation counts, no traffic projections)
- No hard claims about competitor performance
- No phrases like "you are losing X revenue" or "X% of your traffic is going elsewhere"
- Use "suggests", "may", "likely" — not "is", "proves", "confirms"
- Tie the statement back to specific audit findings, not to general AI search trends
- This section should be two or three sentences. Not a paragraph. Not a slide.

---

## What the Executive Brief must not contain

- Market statistics not present in the audit input
- Industry trend claims ("AI search is growing 40% annually")
- Competitor names or implied competitive comparisons not supported by audit data
- Revenue estimates or traffic projections
- Numeric scoring of "risk" or "opportunity" beyond what the audit directly outputs
- Motivational or inspirational framing ("now is the time to act")
- Repeated restatement of information covered in the body sections
- A section heading named "Executive Summary" that duplicates the existing report section — the Executive Brief replaces and upgrades the existing executive summary

---

## Length and format

- Maximum length: 300 words
- No sub-headers within the brief itself — the four elements flow as one continuous block
- A visual separator (horizontal rule or clear spacing) should appear before the next section
- The brief should work as a standalone document if extracted from the full report

---

## Tone requirements

From `layer-one-report-tone-and-verbosity-v1.md`, applied specifically to the Executive Brief:

- Open with the site and the score, not with industry framing
- Prefer: direct, calm, specific, operational
- Avoid: dramatic, theatrical, inflated, consultancy-style
- The brief should feel like a senior operator wrote it after reviewing the audit, not like a marketing template

The brief should give the reader confidence that the person who wrote it understands both the site and what the findings mean — without performing expertise.

---

## Relationship to existing Executive Summary

The existing paid report has an "Executive Summary" section generated by `build-deep-audit-markdown.ts`.
That section currently describes the audit methodology and score narrative.

The Executive Brief replaces it as the opening of the report.
The technical score narrative can move to the Score Breakdown section or the Appendix.
This transition happens in RD-005 (section order), not in this slice.

---

## Example — full brief (illustrative, not template text)

```
techehealthservices.com received a score of 61/100 (C) on this AI Search Readiness Audit.
The audit identified 7 checks that need attention across 3 team areas.

**Engineering:** No canonical URL is declared on key pages — this may cause AI systems to encounter
duplicate or ambiguous page signals when indexing the site.
**Content:** Pages do not follow Q&A or instructional content patterns — AI systems may have
difficulty extracting clear, quotable answers from the current content structure.
**Brand:** Author attribution and an About page link are missing — this weakens the credibility
signals AI systems use when evaluating whether to cite a source.

The immediate priority is adding structured Q&A or instructional patterns to the top content pages —
this is a Content task and carries the highest weight among the failing checks.

The audit found that 4 of 9 Content-owned checks are failing, including the two highest-weight
extractability checks. This suggests the site has addressable gaps in how AI systems read and
interpret its content. Closing the content-layer gaps first is likely to have the strongest effect
on AI search visibility.
```

---

## Non-goals for this slice

- Does not define the Team Action Map layout (rd-010, not yet written)
- Does not change the runtime report generator
- Does not change the PDF or web report UI
- Does not define the rewrite prompt text

## Depends on

- `RD-001` team-owner taxonomy (owner labels used in the three-finding summary)

## Required by

- `RD-005` section order contract (needs to know what the Executive Brief is to place it correctly)
- `RD-010` Team Action Map (brief's finding summary should preview what the action map expands)
- Future: Layer One rewriter prompt update (will use this contract as the spec for the opening section)
