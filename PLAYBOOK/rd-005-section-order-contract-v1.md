# RD-005 — Section Order Contract v1

Last updated: 2026-03-30

## Purpose

Freeze the new section order for the paid deep-audit report.

This document depends on:
- `PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`
- `PLAYBOOK/rd-002-executive-brief-contract-v1.md`
- `PLAYBOOK/rd-006-immediate-wins-format-v1.md`
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`

This is a design/documentation slice only.
It does not change the runtime report generator, the markdown builder, the PDF, or the web report UI yet.

---

## Why this slice exists

The current report opens with technical scoring.
The CRO-relevant material — the condition of the site, who needs to act, what to do first — is either absent or buried.

The current section order is:

```
[Score summary + category cards]     ← first thing visible
[Top Issues]                          ← technical list
[Executive Summary]                   ← generic score narrative
[Category Breakdown]
[Coverage Summary]
[Score Breakdown (all checks)]        ← table dump
[Priority Action Plan]
[Pages Scanned]
[Per-Page Checklist]
[Technical Appendix]
```

The result is a report that leads with data and buries the narrative.
A CRO or their team lead opens it and sees a score grid before they see a single sentence telling them what the score means or what to do.

The redesigned section order fixes this by leading with the executive layer and pushing technical detail to the appendix.

---

## New section order

### Customer-facing body (the report a CRO reads)

```
1.  Executive Brief
2.  Immediate Wins
3.  Team Action Map (by owner)
4.  Score Summary (overall score, grade, category cards)
5.  "What AI-Ready Leaders Do Differently" (audit-derived best practices)
6.  Coverage Summary
```

### Technical appendix (for Engineering / SEO team)

```
A.  Score Breakdown — All Checks (full table)
B.  Priority Action Plan (full audit-finding format)
C.  Pages Scanned
D.  Per-Page Checklist
E.  Technical Appendix (robots, schema, headers)
```

---

## Section definitions (what each section contains)

### 1. Executive Brief
Per `rd-002-executive-brief-contract-v1.md`.
- Site condition statement
- Three-finding summary (with team owner labels)
- Primary action directive
- Directional exposure statement

### 2. Immediate Wins
Per `rd-006-immediate-wins-format-v1.md`.
- 3 to 5 ticket-format wins
- Selected by: failed/WARNING status, weight ≥ 5, high/medium confidence, single owner
- Each win has: What / Who / Why / How / Effort

### 3. Team Action Map
Per future `rd-010` (not yet defined in detail).
Grouped by team owner (Engineering / Content / Brand / Product).
Each group lists its failed checks in action-card format (per `layer-one-report-recommendation-format-v1.md`).
Format per team group:

```
## [Owner] Team — [N] items

[Action card 1]
[Action card 2]
...
```

### 4. Score Summary
The existing score cards — overall score, letter grade, per-category scores.
Stays substantively the same; moves from first position to fourth.
The score is still present and visible; it is no longer the first thing a reader encounters.

### 5. "What AI-Ready Leaders Do Differently"
Per `rd-004-ai-ready-leaders-contract-v1.md`.
Audit-derived best-practice framing only.
No live competitor data.
Pattern: "AI-ready sites have X. This site is missing X. The gap likely means Y."
Keeps framing audit-defensible while giving the CRO context without invented comparisons.

### 6. Coverage Summary
The existing crawl metrics section.
Unchanged in content; moves from an early position to after the narrative sections.
Remains relevant for understanding the audit's scope.

### Appendix sections (A through E)
All existing technical detail sections move here verbatim.
The appendix is clearly labeled as "For Engineering and SEO Teams."
No content is removed from the report — it is reorganized, not trimmed.

---

## Sections that move out of the body

| Current section | New location | What changes |
|-----------------|-------------|--------------|
| Score summary (score + category cards) | Section 4 (body) | Stays, moves down |
| Top Issues | Absorbed into Immediate Wins + Team Action Map | Format changes; same data |
| Executive Summary | Replaced by Executive Brief | New content, same position goal |
| Category Breakdown | Absorbed into Score Summary section | Kept, reordered |
| Coverage Summary | Section 6 (body, later) | Stays, moves down |
| Score Breakdown (all checks) | Appendix A | Stays, moves to appendix |
| Priority Action Plan | Appendix B | Stays, moves to appendix |
| Pages Scanned | Appendix C | Stays, moves to appendix |
| Per-Page Checklist | Appendix D | Stays, moves to appendix |
| Technical Appendix | Appendix E | Stays, moves to appendix |

No technical data is deleted. All existing sections survive as appendix material.

---

## What this contract does not change yet

- The content of any existing section (Score Breakdown, Per-Page, Technical Appendix, etc.)
- The runtime markdown builder (`build-deep-audit-markdown.ts`)
- The PDF generator (`build-deep-audit-pdf.ts`)
- The web report viewer (`components/report-viewer.tsx`, `report-viewer-sections.tsx`)
- The Layer One rewriter prompt

All of those are Phase B implementation tasks, not Phase A design tasks.
This contract is the specification those tasks will implement.

---

## Sections still pending their own content slices

- **Team Action Map** (Section 3): full format spec is `rd-010`, not yet written

All other body sections (Executive Brief, Immediate Wins, Score Summary, What AI-Ready Leaders Do Differently, Coverage Summary) have frozen content contracts. Section order is fully specified.

---

## Relationship to existing Layer One rewriter contract

`layer-one-report-rewriter-contract-v1.md` defines this section order for rewritten reports:

```
1. Executive summary
2. Confirmed audit findings
3. Likely implications
4. Priority actions
5. Optional advanced GEO improvements
6. Open questions and follow-up checks
```

The new section order supersedes this for the paid customer-facing report.
The Layer One rewriter contract will need to be updated in a future slice to align with the new order.
For now, both documents co-exist; the Layer One contract governs the internal rewrite artifact; this contract governs the target report shape.

---

## Non-goals for this slice

- Does not define Team Action Map content rules (future `rd-010`)
- Does not define "What AI-Ready Leaders Do Differently" content rules (future `rd-004`)
- Does not change any runtime code
- Does not change PDF or web UI
- Does not remove any existing technical section from the product

## Depends on

- `RD-001` team-owner taxonomy
- `RD-002` executive brief contract
- `RD-006` immediate wins format

## Required by

- Phase B implementation tasks: markdown builder update, PDF redesign, web viewer reorder
- Future `RD-004` (best practices section content contract)
- Future `RD-010` (Team Action Map content contract)
- Future Layer One rewriter prompt update
