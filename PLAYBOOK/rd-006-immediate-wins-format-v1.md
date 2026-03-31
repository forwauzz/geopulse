# RD-006 — Immediate Wins Format v1

Last updated: 2026-03-30

## Purpose

Freeze the format and selection rules for the Immediate Wins section of the paid report.

This document depends on:
- `PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`
- `PLAYBOOK/rd-002-executive-brief-contract-v1.md`
- `PLAYBOOK/layer-one-report-recommendation-format-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`

This is a design/documentation slice only.
It does not change the runtime report generator, the PDF, or the web report UI yet.

---

## Why this slice exists

The current Priority Actions section lists recommendations in audit-finding style:

> "Add one clear H1 that names the clinic and primary service on the homepage."

That is correct. It is also passive. It reads like a report item, not a work ticket.

A CRO forwarding this to a team lead needs something that reads as actionable enough to assign — not something that requires interpretation before it can be acted on.

The Immediate Wins section is a different register from Priority Actions. It is not a list of all issues. It is a short, pre-prioritized set of the fixes that are:
- high audit weight (the audit says these matter most)
- high confidence (the audit is certain about them — not low-confidence or blocked)
- owned by a single team (clear handoff, no cross-team dependency to start)
- implementable without a discovery phase (no "check first, then decide")

The format deliberately reads like an implementation ticket, not a report finding.

---

## Position in the report

The Immediate Wins section appears after the Executive Brief and before the full Team Action Map.

Section order per `rd-005-section-order-contract-v1.md` (design frozen, implementation pending):

```
1. Executive Brief           ← rd-002-executive-brief-contract-v1.md
2. Immediate Wins            ← this document defines
3. Team Action Map           ← rd-010 (not yet written)
4. Score Summary
5. What AI-Ready Leaders Do Differently
6. Coverage Summary
— Appendix (technical detail) —
```

---

## Selection criteria

A check qualifies as an Immediate Win if it meets **all three** of the following:

1. **Failed or WARNING status** in the audit
2. **Weight ≥ 5** (medium or high weight in the current scoring system)
3. **Confidence is not LOW_CONFIDENCE** (the audit is reasonably certain about the finding)

Apply these filters to the full deduplicated issue set from the paid deep-audit crawl.
Then rank the qualifying checks by weight descending.
Take the top 3 to 5.

If fewer than 3 checks qualify (e.g. most failures are low-confidence or low-weight), show what qualifies and note that the remaining issues appear in the Priority Actions section.

---

## Disqualifying conditions

A check is **not** an Immediate Win if:

- Its status is `LOW_CONFIDENCE` — the audit is uncertain; the client should verify first
- Its status is `BLOCKED` — the check could not run; this belongs in Open Questions, not Immediate Wins
- Its status is `NOT_EVALUATED` — same as BLOCKED
- Its weight is < 5 — too low-impact to lead with
- Its fix requires cross-team coordination before any work can start (e.g. a fix that requires Engineering to unblock before Content can act) — move to Team Action Map instead

---

## Required format per win

Each Immediate Win must include exactly these five fields, in this order:

```
What: [Short, concrete description of the fix — one sentence, imperative voice]
Who:  [Team owner from rd-001 taxonomy: Engineering / Content / Brand / Product]
Why:  [One sentence tied directly to a specific audit finding — no invented framing]
How:  [Specific implementation step — concrete enough to act on without context]
Effort: [Quick / Moderate]
```

### Field rules

**What**
- Imperative voice: "Add", "Update", "Remove", "Create", "Fix"
- Describes the outcome, not the problem
- One sentence. No trailing explanation.

Good: `Add one clear H1 to the homepage naming the primary service.`
Bad: `H1 heading structure needs improvement across key pages.`

**Who**
- Exactly one owner from the RD-001 taxonomy
- No "Engineering + Content" joint owners — pick the primary
- This is who receives the work ticket

**Why**
- One sentence tied to the audit finding, not to general GEO theory
- Bounded language where appropriate ("may", "likely", "suggests")

Good: `The audit found no H1 on the homepage — this may reduce topic clarity for AI systems parsing page structure.`
Bad: `H1 tags are foundational to AI search visibility in the modern semantic web.`

**How**
- Specific enough to act on without reading the rest of the report
- Names the file, template, CMS section, or server config to change — where the audit provides that context
- If the audit provides specific evidence (e.g. which pages failed), reference it

Good: `In your CMS page editor, add a single H1 to the homepage. The text should name the clinic and its primary service. Remove any duplicate H1 tags if present.`
Bad: `Work with your developer to implement proper heading hierarchy across your site architecture.`

**Effort**
Two levels only:
- `Quick` — can be done in under a day by one person with access
- `Moderate` — requires a short project (2-5 days) or coordination with one other person

Do not use "High" or "Complex" — those belong in the Team Action Map, not Immediate Wins.
A check that requires high effort is not an Immediate Win by definition.

---

## Example — three Immediate Wins (illustrative)

```
### Immediate Wins

---

1. Allow AI crawlers in robots.txt

   What:  Update robots.txt to remove Disallow rules for GPTBot, ClaudeBot, PerplexityBot,
          and OAI-SearchBot.
   Who:   Engineering
   Why:   The audit found robots.txt blocks 4 known AI crawlers — these systems may not
          be indexing your site at all.
   How:   Open your robots.txt file (served at /robots.txt). Remove or modify the Disallow
          lines for the following user-agents: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot.
          Test with Google Search Console's robots.txt tester after the change.
   Effort: Quick

---

2. Add JSON-LD structured data to the homepage

   What:  Add a JSON-LD block with Organization and WebSite schema to the homepage.
   Who:   Engineering
   Why:   The audit found no JSON-LD structured data on the site — AI systems use
          this to understand what the organization does and how to describe it.
   How:   Add a <script type="application/ld+json"> block in the <head> of your homepage
          template. Include at minimum: @type: Organization, name, url, and description.
          Validate using Google's Rich Results Test before deploying.
   Effort: Quick

---

3. Add clear question-and-answer structure to the top content pages

   What:  Restructure the top 3 service or FAQ pages to follow an explicit Q&A pattern.
   Who:   Content
   Why:   The audit found that content extractability is low — AI systems may have
          difficulty identifying quotable answers from the current paragraph-heavy format.
   How:   For each page, identify the 3-5 questions a patient or client would ask.
          Add each as a visible subheading (H2 or H3), followed by a direct 2-3 sentence
          answer. Avoid burying answers inside long introductory paragraphs.
   Effort: Moderate
```

---

## What Immediate Wins must not do

- List more than 5 items (use the Team Action Map for the rest)
- Include LOW_CONFIDENCE or BLOCKED findings
- Use vague "improve" or "optimize" language in the What or How fields
- Require the client to research before they can start (that is a Team Action Map item, not a win)
- Repeat the full technical audit finding — that belongs in the Score Breakdown
- Make claims about expected outcomes ("this will increase your AI citations by X%")

---

## Relationship to existing Priority Actions section

The existing paid report has a Priority Actions section generated deterministically.
That section covers all high-weight failed checks in audit-finding format.

The Immediate Wins section is not a replacement for Priority Actions.
It is a pre-filtered, reformatted lead section for quick-start clarity.

Priority Actions stays in the report (it becomes part of the Team Action Map in RD-005).
Immediate Wins appears above it as a fast-access entry point.

There will be overlap between Immediate Wins and Priority Actions — that is intentional.
The same check appears in both; the Immediate Wins version is written as a ticket, the Priority Actions version provides the full finding context.

---

## Non-goals for this slice

- Does not define the Team Action Map layout (RD-005 / RD-010)
- Does not define section order changes (RD-005)
- Does not change the runtime report generator
- Does not change the PDF or web report UI
- Does not change the scoring or check weights

## Depends on

- `RD-001` team-owner taxonomy (owner field in each win)
- `RD-002` executive brief contract (brief names the #1 priority; wins expand it)
- `layer-one-report-recommendation-format-v1.md` (action card pattern; Immediate Wins uses a compatible but ticket-oriented shape)

## Required by

- `RD-005` section order contract (needs to know what Immediate Wins is to place it correctly)
- Future: report generator update (will use this contract to build the Immediate Wins section from the payload)
