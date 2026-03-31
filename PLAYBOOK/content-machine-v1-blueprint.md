# GEO-Pulse Content Machine V1

Last updated: 2026-03-31

## Purpose

Define the first product and operating blueprint for a GEO-Pulse content machine that lives inside the app.

This is a planning artifact only.

It does not:
- add publishing code
- choose a vendor yet
- automate posting yet
- claim that social-research inputs are already integrated

## Working thesis

GEO-Pulse should not build a generic AI blog writer.

It should build an app-linked content machine with four layers:
- insight intake
- editorial generation
- distribution
- measurement

The system exists to increase visibility, convert product learning into public authority, and feed real audience response back into product and messaging decisions.

## Canonical operating model

### 1. Site-first publishing

The GEO-Pulse site should be the canonical home of each long-form asset.

That means:
- every article has a stable GEO-Pulse URL
- every asset gets a stable `content_id`
- newsletter and social platforms are downstream distribution channels, not the source of truth

### 2. App-linked inputs

The content system should draw from two input classes:

- product-native inputs
  - scan findings
  - repeated audit failures
  - benchmark and eval insights
  - recurring objections or confusion from the product journey
- market-native inputs
  - X conversations
  - Reddit conversations
  - LinkedIn conversations if signal quality is high enough
  - keyword and phrasing research performed outside this repo

### 3. Human-reviewed publishing

V1 should automate:
- topic normalization
- brief creation
- draft generation
- distribution packaging

V1 should not auto-publish without review.

### 4. Closed-loop measurement

Every content asset should be measurable across:
- traffic
- scan starts
- lead capture
- checkout starts
- payments

The existing marketing attribution system already gives GEO-Pulse part of this foundation.

## Existing repo foundation

The repo already has meaningful pieces that support this direction:

- marketing attribution events and views
- channel normalization for `x`, `linkedin`, and `newsletter`
- `content_id` support in the marketing event schema
- existing docs and playbooks for weekly attribution review

Implication:
the repo is already capable of becoming a measurable content machine, but it does not yet have the editorial product layer.

## V1 system boundary

The first version should include:

- an internal topic inbox
- a structured content brief format
- a writing skill for content generation
- an editorial review state
- on-site article publication as the canonical destination
- export or push into at least one newsletter platform
- a lean first distribution focus on newsletter
- optional downstream expansion later to Reddit and other channels
- attribution tagging by `content_id`

The first version should exclude:

- fully autonomous publishing
- broad multi-platform scraping at runtime without review
- automated claim generation from weak signals
- direct copying of social posts into publishable assets
- a customer-facing content product

## Proposed content object model

Each content item should eventually carry:

- `content_id`
- `status`
  - idea
  - researching
  - brief_ready
  - drafting
  - review
  - approved
  - published
  - syndicated
- `content_type`
  - article
  - newsletter
  - linkedin_post
  - x_thread
- `canonical_title`
- `canonical_slug`
- `target_persona`
- `primary_problem`
- `topic_cluster`
- `keyword_cluster`
- `cta_goal`
- `source_type`
  - product_signal
  - social_signal
  - founder_input
  - mixed
- `source_links`
- `market_language_snippets`
- `brief_markdown`
- `draft_markdown`
- `distribution_variants`
- `published_url`
- `newsletter_post_id`
- `created_by`
- `approved_by`

## Proposed operating flow

### Flow A. Topic intake

Inputs arrive from:
- founder notes
- product observations
- recurring report findings
- benchmark observations
- social-research packets

These should not go straight to article generation.

They should first be normalized into a topic object with:
- what the audience is struggling with
- how often that problem appears
- whether GEO-Pulse has authority to speak on it
- what product angle exists, if any

### Flow B. Brief generation

The brief is the key leverage point.

It should answer:
- who is this for
- what problem does it address
- what exact angle are we taking
- what proof do we have
- what we will not claim
- how GEO-Pulse appears in the piece
- what the CTA is

### Flow C. Asset generation

From one approved brief, the system should generate:
- one canonical article draft
- one newsletter draft
- one LinkedIn variant
- one X thread or short-post set

This is preferable to generating each asset independently from raw inputs.

For V1, newsletter is the first mandatory downstream asset.
Reddit is a later-stage candidate, but it should not drive the first integration design.

### Flow D. Distribution

Distribution should follow this order:

1. publish article on GEO-Pulse
2. push or mirror summary to newsletter platform
3. generate social variants linking back to the canonical article

### Flow E. Measurement and feedback

Each published asset should carry a `content_id` that can be tied back to:
- scan_started
- lead_submitted
- checkout_started
- payment_completed

Weekly review should answer:
- which topics attracted traffic
- which topics converted
- which channels produced qualified traffic
- which content angles created attention but not action

## Editorial discipline

The content machine should follow these rules:

- publish useful operator-grade content, not generic AI marketing filler
- separate observed evidence from interpretation
- do not copy social posts into articles
- use social conversations as signal, not as truth
- prefer GEO-Pulse product-backed authority over broad unsupported claims
- keep the product present but subordinate to usefulness
- never imply GEO-Pulse predicts rankings or outcomes it does not measure

## Writing skill direction

The future skill should be broader than a newsletter writer.

Recommended name direction:
- `geo-content-engine`
- `content-machine`
- `geopulse-editorial`

Recommended resources inside that skill:
- `SKILL.md`
- `references/brand-voice.md`
- `references/product-context.md`
- `references/editorial-rules.md`
- `references/distribution-formats.md`
- `assets/templates/article-brief.md`
- `assets/templates/newsletter.md`
- `assets/templates/linkedin-post.md`
- `assets/templates/x-thread.md`

The skill should consume:
- founder-provided brand voice
- product marketing context
- source brief
- social-research packet
- asset format target

The skill should output:
- high-signal drafts with explicit channel formatting
- consistent claim boundaries
- product-aware but non-spammy CTAs

## Integration direction

Vendor selection should follow the workflow, not lead it.

The desired architecture is:
- GEO-Pulse stores the canonical article and asset metadata
- an integration pushes to the newsletter platform after approval
- optional integrations distribute variants to additional channels

Current founder-selected first-pass platform set:
- Beehiiv
- ConvertKit
- Ghost
- Mailchimp

Selection criteria for the first newsletter/distribution platform:
- API quality
- ability to push posts programmatically
- support for canonical link back to GEO-Pulse
- draft and publish separation
- acceptable audience and deliverability fit

## Social research boundary

The founder will run broad social and keyword research with external LLM workflows.

This repo-side system should assume the result arrives as a structured input packet, not raw uncontrolled scraping.

Recommended packet fields:
- date collected
- platform
- search query used
- source URL
- author handle or identifier if relevant
- exact snippet
- normalized pain point
- inferred audience
- confidence
- notes

This keeps the content machine grounded while avoiding a fragile “live scrape everything” dependency in V1.

## First research synthesis

The first social research pass surfaces a usable initial pattern set.

### Strong repeated themes

- crawlable but not extractable
- schema and machine-readable structure still matter, but do not solve the whole problem
- direct answers, clear definitions, and FAQ-style formatting are repeatedly cited as useful
- trust and authority signals remain necessary for AI systems to treat a site as credible
- internal linking and topical clustering help AI systems understand page relationships
- many teams are frustrated that traditional SEO wins do not cleanly map to AI visibility
- there is skepticism toward tools that generate hype, generic scores, or more content without explaining real visibility gaps

### Messaging implications

Content should lean into:
- readiness, not rankings
- clarity, not volume
- practical fixes, not generic GEO theory
- useful diagnostics, not abstract AI-SEO hype

### Caution on research quality

The first packet includes valuable repeated language and topic direction, but not all cited statistics should be treated as proven product claims.

Use the research for:
- pain-point discovery
- language discovery
- topic prioritization
- objection discovery

Do not use it yet for:
- hard conversion claims
- exact performance deltas
- authoritative market statistics in public copy without separate verification

## First topic stack

The first content stack should likely prioritize:

1. How to audit your site for AI search readiness
2. Crawlable vs extractable: what teams are missing
3. Why schema is necessary but not sufficient
4. How to make content easier to cite
5. Why clarity beats content volume in AI visibility
6. Why some sites read like brochures instead of answers
7. Internal linking and content clusters for AI context
8. Trust and authority signals AI systems can actually read

## Open design questions

These must be answered before implementation starts:

1. What is the canonical publishing destination on the GEO-Pulse site?
2. Which newsletter platform is the first integration target?
3. Which external channels matter in V1:
   - newsletter first
   - Reddit later
   - broader syndication after the core system works
4. Who approves content before publishing?
5. What are the non-negotiable brand voice rules?
6. What product claims are explicitly disallowed?
7. Which personas matter most for the first 10 to 20 articles?
8. What is the primary CTA:
   - free scan
9. What types of content should GEO-Pulse avoid?
10. What success metric matters most in V1:
    - visibility
    - scan starts
    - leads
    - paid conversions

## Founder inputs required

The following information cannot be inferred reliably from the repo and should come from the founder:

- brand voice source document or `.soulmd`
- phrases to use
- phrases to avoid
- founder point of view on GEO / AI search
- preferred newsletter platform shortlist with any strong dislikes
- preferred public channels to syndicate to after newsletter
- primary audience ranking inside this starter set:
  - agency owners
  - SEO consultants
  - growth marketers
  - founders
  - in-house content teams
  - ecommerce operators
- examples of writing you want to sound like
- examples of writing you do not want to sound like
- the first social-research packet once you complete it

## Current persona priority

The current best-first ranking from the latest deep-research pass is:

1. SEO consultants
2. agency owners
3. ecommerce operators
4. founders
5. growth marketers
6. in-house content teams

Use this as the planning default for the first editorial backlog unless later founder evidence changes it.

## Recommended next planning outputs

Before any implementation, create these three artifacts:

1. product marketing context
2. content machine spec
3. content-writing skill spec

This file is the first draft of item 2.
