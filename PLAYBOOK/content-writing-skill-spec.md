# GEO-Pulse Content Writing Skill Spec

Last updated: 2026-03-31

## Purpose

Define the future Codex skill that will generate GEO-Pulse content assets from structured inputs.

This is a planning spec only.

## Working name

Recommended current name:
- `geo-content-engine`

Alternate acceptable names:
- `content-machine`
- `geopulse-editorial`

## Mission

The skill should turn:
- product context
- founder voice
- structured social research
- content briefs

into:
- article drafts
- newsletter drafts
- later channel variants

without collapsing into generic AI marketing content.

## Scope

### In scope

- convert topic packets into structured briefs
- generate article drafts from approved briefs
- generate newsletter drafts from approved briefs
- preserve claim boundaries
- preserve founder/operator tone
- keep the CTA aligned to `free scan`

### Out of scope for V1

- auto-publishing
- scraping platforms directly
- making unverified market-stat claims
- inventing case studies
- turning weak anecdotal evidence into proof

## Required inputs

The skill should expect these inputs:

1. Product context
   - `.agents/product-marketing-context.md`

2. Brand voice
   - `PLAYBOOK/content-machine-inputs/brand-voice.soulmd`

3. Social research or topic packet
   - `PLAYBOOK/content-machine-inputs/social-research-synthesis-2026-03-31.md`
   - or a later packet in the same format

4. Asset target
   - `article`
   - `newsletter`
   - later: `linkedin_post`, `x_thread`, `reddit_post`

5. Brief or topic direction
   - target persona
   - topic
   - pain point
   - CTA
   - claim boundaries

## Required outputs

The skill should be able to produce:

### 1. Article brief

Must include:
- target persona
- working title
- problem statement
- why this matters now
- proof sources
- what we can claim
- what we cannot claim
- CTA
- suggested internal links

### 2. Article draft

Must follow:
- `PLAYBOOK/blog-llm-readiness-spec.md`
- founder voice rules
- product-context boundaries

### 3. Newsletter draft

Must:
- preserve the same core argument as the canonical article
- be shorter and sharper
- still be useful on its own
- point back to the canonical GEO-Pulse asset when appropriate

## Guardrails

The skill must not:
- imply ranking guarantees
- imply citation guarantees
- invent benchmark authority
- use hype language by default
- write like a consultant deck
- write like a generic content AI
- overstate research consensus

The skill should:
- distinguish evidence from interpretation
- be explicit when something is a hypothesis
- prefer direct wording over inflated wording
- optimize for usefulness first

## Asset-specific rules

### Article

- canonical site asset
- must satisfy LLM-readiness spec
- should contain direct answer blocks
- should support internal linking and topic clustering

### Newsletter

- first downstream distribution asset in V1
- should summarize, sharpen, and distribute the core insight
- should not become the canonical source of truth

## Skill folder design

Recommended contents:

- `SKILL.md`
- `references/brand-voice.md`
- `references/product-context.md`
- `references/editorial-rules.md`
- `references/blog-llm-readiness.md`
- `references/distribution-formats.md`
- `assets/templates/article-brief.md`
- `assets/templates/newsletter.md`

## Editorial rules file should contain

- claim boundaries
- approved language patterns
- disallowed phrases
- evidence-discipline rules
- CTA rules
- tone guidance by asset type

## First evaluation criteria

Before trusting the skill, forward-test drafts against:

- voice match
- usefulness
- claim discipline
- article extractability
- CTA fit
- absence of hype/filler

## Future extensions

Later, the skill may support:
- Reddit-adapted variants
- LinkedIn variants
- topic clustering assistance
- article refresh workflows
- post-publish revision suggestions from attribution data

## Dependency note

This skill should not be implemented before:
- the product marketing context is accepted
- the brand voice draft is accepted
- the blog LLM-readiness spec is accepted
- the first editorial backlog exists
