# GEO-Pulse Docs-Style Blog IA Contract v1 (B1)

Last updated: 2026-04-03

## Purpose

Freeze the docs-style blog navigation and route-level IA contract for GEO-Pulse content scale.

This contract sits on top of:
- `docs/11-topic-taxonomy-v1.md` (A1)
- `docs/12-content-frontmatter-media-contract-v1.md` (A2)
- `docs/13-topic-registry-v1.json` (A3)

This is a planning and implementation contract.

It does not:
- ship UI code by itself
- replace editorial quality gates
- introduce customer-facing benchmark claims

## IA goals

- Human goal: users find answers quickly with docs-like navigation.
- Crawl goal: machines can infer hierarchy, topic ownership, and canonical relationships.
- Ops goal: 100-topic growth remains maintainable without ad hoc navigation patterns.

## Canonical route contract

### Required routes
- `/blog`
- `/blog/topic/[topic]`
- `/blog/[slug]`

### Route ownership
- `/blog` = global index and discovery entrypoint.
- `/blog/topic/[topic]` = topic hub and canonical parent for topic articles.
- `/blog/[slug]` = canonical article URL.

### URL conventions
- lower-case, hyphenated slugs
- stable slugs once published (no churn without explicit redirect/canonical handling)
- one canonical topic parent per article (`parent_topic_slug`)

## Navigation contract

### Left navigation (primary)

#### On `/blog`
- show topic group list from A1 registry
- show topic counts (published/total)
- support intent filter chips (`definition`, `implementation`, `comparison`, `checklist`, `case_pattern`)

#### On `/blog/topic/[topic]`
- show current topic as active group
- list topic articles grouped by intent order
- indicate article publish state where relevant for admin-only overlays

#### On `/blog/[slug]`
- show current topic group
- highlight current article
- expose sibling article links under same topic

### Top navigation/search strip (secondary)
- compact search input (title + summary + slug matching)
- quick filters: topic and intent
- clear route back to `/blog`

### Right rail (contextual)
- in-article TOC from H2/H3 headings
- related links from `related_slugs`
- optional next/previous links from `next_slug` and `prev_slug`

### Breadcrumb contract
- `/blog` -> `/blog/topic/[topic]` -> `/blog/[slug]`
- topic and article pages must expose breadcrumb UI and `BreadcrumbList` structured data

## Topic hub contract (`/blog/topic/[topic]`)

Each topic hub must include:
- topic title
- short definition
- why-it-matters block
- practical takeaway block
- article list grouped by intent order
- internal links to all published child articles

This keeps hubs useful for both users and crawl/context interpretation.

## Article navigation contract (`/blog/[slug]`)

Each article page must include:
- visible parent-topic link
- sibling article links (at least one where available)
- related links block from frontmatter
- next/previous controls when mapped

If no siblings exist, do not show empty chrome; degrade gracefully.

## Registry integration contract

The `docs/13-topic-registry-v1.json` file is the planning source-of-truth for:
- topic hierarchy
- intent grouping
- planned batch metadata

UI/runtime slices may mirror this into app data later, but the structure must remain compatible.

## Crawlability/extractability contract

- each article must resolve to one canonical topic path
- avoid orphan article pages (no article without inbound links from topic hub or related sets)
- keep navigation links server-rendered where possible
- preserve stable internal link graph as content scales

## Structured data contract (navigation-related)

- topic and article pages: `BreadcrumbList`
- article pages: `Article`
- topic hubs: list-style structured data (`CollectionPage`/`ItemList` compatible shape)

Exact schema field implementation is handled in implementation slices, not this planning contract.

## Performance and maintainability guardrails

- nav components should read from one normalized view model
- avoid duplicated topic tree logic across routes
- avoid per-route custom link heuristics
- keep intent ordering centralized and deterministic

## Non-goals for B1

- visual design system overhaul
- advanced semantic/AI search service implementation
- fully dynamic personalization of nav
- replacing existing publish/readiness gates

## Latest and Next Slice

`D6` is now in repo: `/dashboard/content` includes a compact publish-quality trend summary using persisted publish-check snapshots (cross-article failure patterns + regression flags).

`E1` is now in repo: `/blog`, `/blog/topic/[topic]`, and `/blog/[slug]` use a black-first visual theme with white primary text while preserving the docs-style IA contract and accessibility contrast.

`E2` is now in repo: blog-adjacent chrome is dark-theme aware on blog routes (header/footer treatment + first contrast edge-case cleanup) while non-blog routes keep existing theme behavior.

`E3` is now in repo: final dark-theme polish landed for link/hover/active parity and low-contrast cleanup across blog routes and blog markdown rendering.

`E4` is now in repo: route-scoped visual QA polish landed for blog routes (focus-visible treatment, text-selection contrast, and readability smoothing) without changing non-blog routes.

`E5` is now in repo: screenshot-based cross-device visual QA lane is implemented and passing (`tests/e2e/blog-visual.spec.ts`) using deterministic blog fixture content for stable route-level checks.

`E6` is next (optional): only if needed after real-usage feedback, apply tiny spacing/typography/perf micro-polish on blog routes without changing IA contracts.
