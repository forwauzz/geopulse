---
name: geo-content-engine
description: >-
  Generate GEO-Pulse content assets from structured briefs, founder voice, and
  social-research inputs while preserving claim discipline and LLM-readable
  structure. Use when planning, drafting, or revising GEO-Pulse articles,
  newsletters, editorial briefs, content calendars, or content-system
  workflows, especially when the output must align with the product marketing
  context, the founder voice, the free-scan CTA, and the blog LLM-readiness
  requirements.
---

# Geo Content Engine

This skill is the content-generation router for GEO-Pulse.

Use it to create:
- article briefs
- canonical article drafts
- newsletter drafts
- editorial backlog refinements

Do not use it for:
- generic AI-writing requests unrelated to GEO-Pulse
- unstructured "write me something about AI search" prompts with no topic discipline
- auto-publishing or direct external posting

## Required references

Always read these before drafting anything substantial:
- `references/product-context.md`
- `references/brand-voice.md`
- `references/editorial-rules.md`
- `references/blog-llm-readiness.md`

Read `references/distribution-formats.md` when producing a specific asset type.

## Workflow

### 1. Identify the asset target

Choose one:
- article brief
- article draft
- newsletter draft
- backlog/topic planning

If the request is unclear, default to a brief before drafting full content.

### 2. Load the governing context

Use:
- product context for audience, positioning, and CTA
- brand voice for tone and phrasing
- editorial rules for claim boundaries
- blog LLM-readiness rules for article structure

### 3. Determine the source quality

Treat inputs differently based on strength:
- product truth and internal docs: strongest
- synthesized social research: useful for pain points and vocabulary
- anecdotal discussion snippets: useful for language and hypotheses, not as hard proof

Never convert weak external chatter into confident public claims.

### 4. Build the brief first

The brief should lock:
- target persona
- working title
- problem statement
- why it matters now
- what GEO-Pulse can credibly say
- what GEO-Pulse must not claim
- free-scan CTA fit

For article or newsletter requests without a brief, create one implicitly and use it to shape the draft.

### 5. Write to the asset contract

For articles:
- satisfy `references/blog-llm-readiness.md`
- lead with the point
- include direct-answer blocks
- make the page easy to extract and cite

For newsletters:
- preserve the argument from the canonical article
- keep it tighter and more scannable
- push back to the GEO-Pulse site when appropriate

### 6. Check against the guardrails

Before finalizing, remove:
- inflated claims
- generic AI-marketing filler
- ranking or citation guarantees
- unsupported benchmark language
- consultant-style over-polish

## Default operating rules

- keep the output site-first
- prefer usefulness over trend commentary
- prefer practical language over category jargon
- use `free scan` as the default CTA unless the prompt overrides it
- treat "crawlable but not extractable," "clarity, not volume," and "make it easy to cite" as useful input language, not slogans to repeat mechanically

## Templates

Use:
- `assets/templates/article-brief.md`
- `assets/templates/newsletter.md`

If no template is requested explicitly, still follow their structure.
