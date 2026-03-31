# GEO-Pulse Blog LLM Readiness Spec

Last updated: 2026-03-31

## Purpose

Define the minimum on-site content requirements for GEO-Pulse articles so the blog itself reflects the product's positioning around AI search readiness.

This is a planning and publishing contract.

It does not:
- implement the blog
- guarantee chatbot visibility
- claim any specific citation rate outcome

## Core rule

GEO-Pulse content must be:
- human-readable
- operationally useful
- LLM-extractable

If a GEO-Pulse article is readable for humans but hard for language models to segment, define, cite, or contextualize, it fails this spec.

## Why this matters

The product claims to help teams understand AI search readiness.

If GEO-Pulse publishes articles that are:
- vague
- overlong without structure
- missing schema
- missing clear definitions
- weakly linked
- hard to cite

then the site contradicts its own product logic.

## Publishing principles

### 1. Site-first canonical publishing

Every long-form article should live first on the GEO-Pulse domain.

Newsletter and other channels should distribute from the canonical site asset, not replace it.

### 2. Clarity over volume

Articles should prioritize:
- clear problem framing
- direct answers
- stable terminology
- explicit structure

not:
- unnecessary length
- filler sections
- generic trend commentary

### 3. Extraction over persuasion

The article should explain, define, and structure information in a way that makes it easy for an LLM to quote or summarize accurately.

Marketing-heavy copy should not dominate the article body.

### 4. Trust signals must be visible

The article should make it easy for a machine and a human to understand:
- who is speaking
- what GEO-Pulse is
- why this page is credible
- what is observed fact vs interpretation

## Article structure requirements

Every long-form GEO-Pulse article should include:

1. A clear title that names the problem or question directly
2. A short opening paragraph that defines the topic in plain language
3. A direct answer or summary near the top
4. Clear H2 sections that mirror likely user questions or subtopics
5. At least one concise definition block or answer block that can stand on its own
6. A bounded CTA that points to the free scan when relevant
7. Internal links to related GEO-Pulse content where context matters

## Opening-section contract

The first screenful of a GEO-Pulse article should answer:
- what is this about
- why does it matter
- what is the practical takeaway

Good pattern:
- problem statement
- definition
- direct answer

Bad pattern:
- trend essay
- scene-setting fluff
- long motivation before the point

## Answer-block requirements

Each article should contain at least 2 to 4 answer-friendly blocks that are easy to extract.

Each answer block should be:
- focused on one question or claim
- concise
- fact-led
- readable on its own without heavy surrounding context

Useful examples of answer-block types:
- definition
- checklist
- what changed
- what to do first
- common mistake

## Heading requirements

Headings should:
- describe the actual subtopic
- use stable language
- reflect real questions or decisions
- avoid vague editorial phrasing

Prefer:
- `What "crawlable but not extractable" means`
- `Why schema is necessary but not sufficient`
- `How to make a page easier to cite`

Avoid:
- `A new era begins`
- `The future of discoverability`
- `Why this matters more than ever`

## Terminology requirements

Within one article:
- use consistent names for the same concept
- define terms before using shorthand
- avoid swapping between multiple labels for the same idea unless explicitly clarifying the distinction

Examples:
- if using `AI search readiness`, do not alternate loosely with `AEO`, `GEO`, `AI SEO`, and `LLM optimization` without explanation
- if using `extractable`, define it once clearly and then use it consistently

## Trust and evidence requirements

Articles should distinguish between:
- observed pattern
- inference
- recommendation
- unverified claim

If drawing on social research:
- do not present scattered comments as consensus
- do not present weak anecdotal evidence as benchmark truth
- mark disputed areas clearly

## Internal linking requirements

Every article should link to:
- at least one deeper related article, if available
- the product entry point when relevant
- supporting pages that strengthen topic clustering

Internal linking should help a machine infer:
- what the core topic is
- which pages are related
- which page is canonical for the concept

## Metadata and structured-data requirements

When the blog is implemented, article pages should support:
- correct title tags
- meta descriptions
- canonical URLs
- Open Graph metadata
- article-level structured data where appropriate
- author or organization-level trust signals

This spec does not choose the exact schema implementation yet, but it makes schema support a requirement, not a nice-to-have.

## Freshness requirements

For time-sensitive or evolving topics:
- show a visible updated date
- avoid stale claims that look current
- update or deprecate articles when the landscape changes materially

Do not let GEO-Pulse become a site full of frozen AI-search advice that ages badly.

## Tone requirements

Follow the founder/operator voice rules already captured in:
- `PLAYBOOK/content-machine-inputs/brand-voice.soulmd`
- `.agents/product-marketing-context.md`

Articles should sound:
- direct
- useful
- operator-grade
- non-hype

They should not sound:
- corporate
- consultant-inflated
- generic content-marketing AI

## Pre-publish checklist

Before publishing a GEO-Pulse article, verify:
- the title names a real problem or question
- the opening defines the topic quickly
- the article has direct answer blocks
- headings are concrete and extractable
- terminology is consistent
- trust/evidence language is bounded
- internal links exist
- CTA is present but not spammy
- article is useful even if the reader never buys

## What this spec still does not solve

- whether the GEO-Pulse blog should live inside the current app routes or a separate content surface
- exact schema implementation details
- exact author model
- how article performance will be scored internally
- whether GEO-Pulse will run a formal internal "citation readiness" check before publish

Those should be decided in later implementation planning.
