# RD-004 — "What AI-Ready Leaders Do Differently" Contract v1

Last updated: 2026-03-30

## Purpose

Freeze the content rules and framing for the "What AI-Ready Leaders Do Differently" section of the paid report.

This document depends on:
- `PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`
- `PLAYBOOK/rd-005-section-order-contract-v1.md`
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`

This is a design/documentation slice only.
It does not change the runtime report generator, the PDF, or the web report UI yet.

---

## Why this section exists

After a CRO reads the Executive Brief, Immediate Wins, and Team Action Map, they understand what is broken on their site.
What they often want next is context: "How bad is this, really? What are sites that are winning doing that we're not?"

This section provides that framing — but only from what the audit itself can defensibly support.

The key constraint is the Codex guardrail from the approved Phase A design:
> Keep all new framing audit-defensible. Do not introduce live competitor/market claims we cannot support.

So this section cannot say: "Your competitors are doing X while you are not."
It can say: "Sites that pass the checks you are failing typically do X. Here is what that means for your gaps."

That framing is still valuable to a CRO. It frames the gaps as a competitive posture question without inventing data.

---

## Position in the report

Section 5 of the customer-facing body, per `rd-005-section-order-contract-v1.md`:

```
1. Executive Brief
2. Immediate Wins
3. Team Action Map
4. Score Summary
5. What AI-Ready Leaders Do Differently    ← this section
6. Coverage Summary
```

---

## What this section is

A short, audit-derived best-practices framing block.

It looks at the checks this site is failing and describes — in general terms — what sites that pass those checks typically have in place.

It does not:
- name specific competitors
- claim to have measured competitor sites
- make up statistics about what percentage of sites do X
- say the client is "behind" on a measured scale

It does:
- draw on the check logic itself to describe the positive state
- frame failing checks as gaps relative to an audit-defined standard
- give the CRO language to explain the problem to their board or team

---

## Structure

The section has two parts:

### Part 1: The headline framing (1–2 sentences)

States what the section is doing without overstating it.

Allowed pattern:
> "Sites that perform well in AI search share a set of structural and content signals that
> this audit measures. Here is where [domain]'s gaps align with those signals."

Must not:
- claim to have run competitor analyses
- use phrases like "industry leaders" or "category winners" unless the audit measured them
- open with market statistics

---

### Part 2: Per-gap framing (one block per significant gap)

For each significant failing check (weight ≥ 6, not LOW_CONFIDENCE):
- State what AI-ready sites have in place
- State what the audit found on this site
- State what the gap likely means

Required format per block:

```
**[Check name / topic area]**
AI-ready sites: [What passing sites have — derived from the check's pass condition]
This site: [What the audit found — one sentence, audit-backed]
Gap: [What this likely means — bounded language]
```

Examples:

```
**Structured data (JSON-LD)**
AI-ready sites: Implement schema.org JSON-LD with high-value types (Organization, Article,
FAQPage, Product) so AI systems can reliably identify content type and extract structured facts.
This site: The audit found no JSON-LD structured data on any scanned page.
Gap: Without structured data, AI systems rely on unstructured parsing to interpret content type —
this may reduce citation reliability and extraction consistency.
```

```
**Content extractability**
AI-ready sites: Publish content as standalone facts, definitions, lists, and direct answers —
structured so AI systems can extract and quote specific passages without layout dependency.
This site: The audit found that content extractability is low-confidence across sampled pages,
with language that appears primarily marketing-oriented rather than informational.
Gap: Content that cannot be extracted as standalone facts is less likely to be cited verbatim
in AI-generated answers, even when the site is accessible and indexed.
```

```
**AI crawler access**
AI-ready sites: Explicitly permit known AI crawler user-agents (GPTBot, ClaudeBot,
PerplexityBot, OAI-SearchBot) in robots.txt or have no restrictive rules targeting them.
This site: The audit found that robots.txt blocks [N] known AI crawlers.
Gap: Blocked crawlers cannot index the site's content. AI systems that depend on those
crawlers for content updates may not reflect changes made to the site.
```

---

## Claim discipline for this section

From `layer-one-report-evidence-discipline-v1.md`, applied specifically here:

**Allowed:**
- "AI-ready sites typically have X" — derived from the check's own pass condition, not from external research
- "The audit found [specific finding]" — direct audit evidence
- "This may mean / likely reduces / suggests" — bounded implication language

**Not allowed:**
- "X% of top-ranking sites have JSON-LD" — invented statistic
- "Your competitors are using schema markup" — no competitor data was measured
- "Industry leaders in [category] all implement llms.txt" — no industry measurement
- "This puts you in the bottom quartile" — no benchmark data in the current audit
- Any claim framed as competitive benchmarking when only the client's site was audited

The "AI-ready sites" framing is safe because it derives the positive standard from the check's own pass condition — it describes what passing looks like, not what measured competitors do.

---

## How many blocks to include

- Minimum: 3 blocks (if fewer than 3 significant gaps exist, use whatever is available)
- Maximum: 6 blocks
- Selection: same criteria as Immediate Wins — weight ≥ 6, not LOW_CONFIDENCE, failed or WARNING
- Order: by weight descending (highest-impact gaps first)

If the audit has very few significant failing checks (high score), this section may be short. That is correct. Do not pad it with lower-weight items to appear comprehensive.

---

## Tone for this section

- Observational and informative — not alarmist
- Treats the reader as someone who wants to understand the gap, not be sold urgency
- Avoids "you must act immediately" language — that belongs in Immediate Wins
- Does not repeat the action steps from Immediate Wins or the Team Action Map — this section is about context, not remediation

---

## What this section does not do

- Does not measure or name specific competitors
- Does not introduce numeric traffic, citation, or revenue claims
- Does not replace the Team Action Map — this section explains context; the action map tells people what to do
- Does not repeat findings already covered in the Executive Brief or Immediate Wins (refer briefly, do not restate in full)

---

## Example — full section (illustrative, 3 blocks)

```
## What AI-Ready Leaders Do Differently

Sites that perform well in AI search share a set of structural and content signals that this
audit measures directly. Here is where techehealthservices.com's gaps align with those signals.

---

**Structured data (JSON-LD)**
AI-ready sites: Implement schema.org JSON-LD with types such as Organization, Article, or
FAQPage so AI systems can reliably extract structured facts and content type.
This site: The audit found no JSON-LD structured data on any scanned page.
Gap: Without structured data, AI systems rely on unstructured parsing — this may reduce how
consistently and accurately the site's content is represented in AI-generated answers.

---

**Content extractability**
AI-ready sites: Publish content structured as direct answers, definitions, and scannable lists
that AI systems can quote without requiring layout interpretation.
This site: The audit found low-confidence extractability across sampled pages — content appears
primarily paragraph-based and marketing-oriented rather than informational.
Gap: Content that cannot be easily extracted as standalone facts is less likely to be cited
verbatim in AI-generated answers, regardless of whether the site is indexed and accessible.

---

**E-E-A-T signals (authorship and trust)**
AI-ready sites: Include explicit author attribution (bylines, schema.org Person markup, or
meta author tags) and a clearly linked About page that establishes organizational expertise.
This site: The audit found no author attribution and no detected link to an About page.
Gap: Without these signals, AI systems that weigh source credibility before citing content
may deprioritize this site in favor of sources with clearer expertise indicators.
```

---

## Non-goals for this slice

- Does not define the Team Action Map format (future `rd-010`)
- Does not change any runtime code
- Does not add external data sources or competitive intelligence
- Does not add benchmark percentile scoring to the report

## Depends on

- `RD-001` team-owner taxonomy (check-to-owner mapping informs which team is responsible for each gap)
- `RD-005` section order contract (position of this section in the report)

## Required by

- Phase B implementation tasks: markdown builder and PDF updates will use this contract to generate this section from the payload
