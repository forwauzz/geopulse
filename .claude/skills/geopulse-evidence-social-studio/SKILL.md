---
name: geopulse-evidence-social-studio
description: >-
  Research, write, brand, produce, and QA evidence-backed GEO-Pulse social
  content for Instagram and LinkedIn. Use when Claude is asked to turn audits,
  benchmarks, buyer intelligence, market statistics, or educational ideas into
  posts, carousels, Reel scripts, Reel covers, Canva designs, or outreach
  creative. Requires evidence and audience briefs before copy or design work;
  does not publish or schedule content.
---

# GEO-Pulse evidence social studio

Turn defensible evidence into simple social content that a buyer understands and can act on.

This skill owns the path from research to a production-ready asset. It does not publish, schedule,
change production data, or approve a claim that the evidence cannot support.

## Required references

Always read:

- [brand-lock.md](references/brand-lock.md)
- [audience-copy-cta.md](references/audience-copy-cta.md)

For any audit, benchmark, intelligence, ranking, percentage, count, trend, or market-statistic post,
also read:

- [evidence-mining.md](references/evidence-mining.md)

Before selecting or editing a Canva design, also read:

- [canva-production-qa.md](references/canva-production-qa.md)

## Non-negotiable gates

1. **Evidence before copy.** Do not write a quantitative hook or open Canva until an evidence brief
   passes scripts/validate-evidence-brief.mjs.
2. **Audience before format.** Name one primary buyer, the moment they are in, what they care about,
   and the one action the post should earn.
3. **Brand before template.** A Canva template contributes layout and motion only. Replace its
   colours, fonts, wordmark treatment, imagery, and generic claims with the selected GEO-Pulse
   visual family.
4. **One post, one idea, one action.** Do not combine audit education, a product tour, a benchmark,
   and an outreach pitch in one asset.
5. **No ranking promise.** GEO-Pulse can measure observed answers, diagnose readiness signals, compare
   eligible benchmark frames, and verify changes. It cannot promise first place, citations, traffic,
   leads, or revenue.
6. **No synthetic proof.** Amara is a fictional ambassador, never a customer, employee, analyst,
   testimonial source, or owner of a quoted result.

## Workflow

### 1. Choose the content lane

Pick exactly one:

- market_stat: a current external statistic from a primary source
- audit_finding: a first-party observation from one audit or an eligible aggregate
- benchmark_signal: a comparison inside one frozen benchmark frame
- buyer_intelligence: a quality-eligible observation from the canonical snapshot/evidence lineage
- product_education: a product capability or workflow grounded in shipped truth
- practical_education: a non-quantitative explanation or checklist
- outreach_asset: a persona-specific problem, proof, and direct next action

If the idea mixes lanes, split it into a series.

### 2. Mine and qualify the evidence

Follow [evidence-mining.md](references/evidence-mining.md). Create a JSON evidence brief from
[evidence-brief.example.json](assets/templates/evidence-brief.example.json), then run:

    node .claude/skills/geopulse-evidence-social-studio/scripts/validate-evidence-brief.mjs <brief.json>

For a non-statistical education post, the brief may use claim_type=non_quantitative, but it must
still point to current product truth or an approved methodology source.

If validation fails, fix the evidence or remove the claim. Never wordsmith around missing proof.

### 3. Build the audience brief

Write five lines:

- **Audience:** one buyer role and vertical
- **Moment:** what just happened that makes them care now
- **Problem:** the plain-language tension they recognize
- **Promise:** what the post will help them understand or do
- **Action:** one measurable next step

Default priority is an MSP or agency operator deciding whether their business or client appears in
AI-assisted buying research. Do not write to “businesses” in general when a narrower buyer is known.

### 4. Turn evidence into a human idea

Use this order:

1. **Fact or recognizable moment**
2. **Why it matters to this buyer**
3. **What they can check or change**
4. **One CTA**

Translate technical metrics into buyer meaning without changing the claim. A denominator belongs in
the caption or evidence frame, even when the hook uses the simpler numerator.

### 5. Draft platform-native copy

Follow [audience-copy-cta.md](references/audience-copy-cta.md).

Produce:

- the on-screen or slide copy
- the Instagram caption
- the LinkedIn version when requested
- one CTA
- a source note for internal records

Every numeric sentence must map to an evidence-brief claim_id.

### 6. Select and rebrand the format

Choose the lightest format that can carry the idea:

- one strong static post for one fact or contrast
- 4–6 slide carousel for a sequence, breakdown, or benchmark
- 8–20 second Reel for one hook, one proof beat, one implication, and one action
- outreach creative when the post should open a conversation with a defined account type

If the sibling geopulse-canva-reel-finder skill is installed, use it only for read-only template
discovery. This skill remains authoritative for evidence, brand, copy, editing, and QA.

Follow [canva-production-qa.md](references/canva-production-qa.md) before editing.

### 7. Run the release gate

The asset is not ready until all are true:

- evidence brief validates
- claim scope, date, denominator, and limitation survive the final copy
- the intended buyer can understand the idea without GEO jargon
- the post explains why the fact matters
- CTA is specific and singular
- wordmark, palette, type, Amara rules, and imagery match the chosen visual family
- all text is inside platform-safe areas at every frame
- Reel timing has no blank gaps and the CTA remains readable for at least 2 seconds
- caption and asset make no ranking, citation, traffic, or revenue guarantee
- exported asset has been watched or inspected from beginning to end

## Output contract

Return one compact production packet:

1. selected lane and audience brief
2. evidence brief path and validation result
3. claim-to-source table
4. final Instagram copy
5. final LinkedIn copy, if requested
6. visual family and Canva template/design link
7. export path
8. QA result, limitations, and recommended posting action

Do not call an asset “ready” when any item is missing. Hand scheduling or publishing to the authorized
operator only after the packet passes.
