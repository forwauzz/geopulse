# GEO-Pulse Topic Taxonomy v1 (A1)

Last updated: 2026-04-03

## Purpose

Freeze the first 100-topic content map for a docs-style, crawler-readable GEO-Pulse content system.

This is a planning contract.

It does not:
- auto-generate articles
- auto-publish content
- claim citation/ranking outcomes

## Design constraints

- IA shape: `20 pillars x 5 intents = 100 planned topics`
- Canonical routes:
  - `/blog/topic/[topic]`
  - `/blog/[slug]`
- Intent types (fixed):
  - `definition`
  - `implementation`
  - `comparison`
  - `checklist`
  - `case_pattern`
- Claim discipline: align with `PLAYBOOK/blog-llm-readiness-spec.md` and avoid outcome overclaims.

## Native signal inputs (frozen)

This taxonomy is grounded in existing GEO-Pulse evidence and planning artifacts:
- crawlable vs extractable gap
- schema is necessary but not sufficient
- internal linking/topic clustering importance
- trust/author/entity clarity
- benchmark methodology discipline (grounded vs ungrounded, citation quality vs citation count)

Primary internal references:
- `PLAYBOOK/blog-llm-readiness-spec.md`
- `PLAYBOOK/content-machine-v1-blueprint.md`
- `PLAYBOOK/citation-and-metrics-v1.md`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`

## Pillar map (20 x 5)

### 01. AI Search Readiness Foundations
- Topic slug: `ai-search-readiness-foundations`
- Definition: `what-is-ai-search-readiness-for-b2b-sites`
- Implementation: `how-to-run-an-ai-search-readiness-baseline`
- Comparison: `ai-search-readiness-vs-classic-seo-a-practical-split`
- Checklist: `ai-search-readiness-checklist-for-operators`
- Case pattern: `common-readiness-failure-patterns-we-see-first`

### 02. Crawlable vs Extractable
- Topic slug: `crawlable-vs-extractable`
- Definition: `crawlable-vs-extractable-what-the-difference-means`
- Implementation: `how-to-make-pages-easier-for-llm-extraction`
- Comparison: `technical-indexability-vs-answer-usability`
- Checklist: `extractability-audit-checklist-for-content-pages`
- Case pattern: `why-crawlable-pages-still-fail-in-ai-answers`

### 03. Schema Strategy (Not Schema-Only)
- Topic slug: `schema-strategy`
- Definition: `why-schema-is-necessary-but-not-sufficient`
- Implementation: `how-to-add-schema-without-faking-confidence`
- Comparison: `faq-schema-vs-article-schema-when-to-use-each`
- Checklist: `schema-quality-checklist-for-geo-teams`
- Case pattern: `schema-present-but-page-still-unclear-pattern`

### 04. Topic Clusters and Internal Linking
- Topic slug: `topic-clusters-and-internal-linking`
- Definition: `what-topic-clustering-signals-to-answer-engines`
- Implementation: `how-to-build-a-topic-cluster-map-that-scales`
- Comparison: `hub-and-spoke-vs-flat-blog-architecture`
- Checklist: `internal-linking-checklist-for-ai-context`
- Case pattern: `scattered-content-graphs-and-context-loss`

### 05. Entity Clarity and Brand Consistency
- Topic slug: `entity-clarity-and-brand-consistency`
- Definition: `what-entity-boundary-drift-looks-like`
- Implementation: `how-to-standardize-brand-naming-across-pages`
- Comparison: `brand-consistency-vs-brand-voice-what-affects-parsing`
- Checklist: `entity-clarity-checklist-for-core-site-pages`
- Case pattern: `inconsistent-naming-that-lowers-citation-confidence`

### 06. Trust Signals and Evidence Hygiene
- Topic slug: `trust-signals-and-evidence-hygiene`
- Definition: `which-trust-signals-machines-and-humans-both-read`
- Implementation: `how-to-add-author-org-and-proof-signals-cleanly`
- Comparison: `testimonial-style-proof-vs-verifiable-proof`
- Checklist: `trust-signal-checklist-for-published-articles`
- Case pattern: `high-claims-low-proof-content-pattern`

### 07. Answer-First Content Design
- Topic slug: `answer-first-content-design`
- Definition: `what-answer-blocks-are-and-why-they-work`
- Implementation: `how-to-write-bluf-openings-for-ai-and-human-readers`
- Comparison: `narrative-posts-vs-answer-first-posts`
- Checklist: `answer-block-checklist-for-each-article`
- Case pattern: `long-intro-low-utility-content-pattern`

### 08. Canonicalization and URL Governance
- Topic slug: `canonicalization-and-url-governance`
- Definition: `canonical-urls-for-content-machines-explained`
- Implementation: `how-to-prevent-duplicate-canonical-conflicts`
- Comparison: `canonical-tags-vs-redirects-for-content-consolidation`
- Checklist: `url-governance-checklist-for-blog-scale`
- Case pattern: `multiple-urls-for-one-topic-and-signal-splitting`

### 09. Metadata and Structured Data Operations
- Topic slug: `metadata-and-structured-data-ops`
- Definition: `which-metadata-fields-actually-help-discovery`
- Implementation: `how-to-operationalize-article-metadata-at-scale`
- Comparison: `minimal-metadata-vs-rich-metadata-for-ops`
- Checklist: `metadata-ops-checklist-before-publish`
- Case pattern: `published-pages-with-incomplete-metadata-pattern`

### 10. Freshness and Update Cadence
- Topic slug: `freshness-and-update-cadence`
- Definition: `what-freshness-signals-mean-in-practice`
- Implementation: `how-to-run-a-weekly-content-refresh-loop`
- Comparison: `new-post-volume-vs-systematic-content-updates`
- Checklist: `content-freshness-checklist-for-evergreen-pages`
- Case pattern: `high-traffic-stale-guides-pattern`

### 11. Docs-Style Information Architecture
- Topic slug: `docs-style-information-architecture`
- Definition: `why-docs-style-navigation-improves-discoverability`
- Implementation: `how-to-design-left-nav-topic-hubs-and-breadcrumbs`
- Comparison: `magazine-blog-vs-docs-style-blog-ia`
- Checklist: `docs-ia-checklist-for-topic-findability`
- Case pattern: `content-rich-but-hard-to-navigate-pattern`

### 12. Video and Rich Media for Canonical Posts
- Topic slug: `video-and-rich-media`
- Definition: `when-video-improves-a-canonical-article`
- Implementation: `how-to-embed-video-without-harming-extractability`
- Comparison: `inline-video-vs-linked-video-in-guides`
- Checklist: `rich-media-checklist-for-blog-and-newsletter`
- Case pattern: `media-heavy-pages-without-clear-takeaways-pattern`

### 13. Newsletter as Downstream Distribution
- Topic slug: `newsletter-downstream-distribution`
- Definition: `canonical-site-first-newsletter-second-explained`
- Implementation: `how-to-map-article-assets-to-newsletter-variants`
- Comparison: `newsletter-first-vs-site-first-publishing-workflows`
- Checklist: `newsletter-push-checklist-with-canonical-guardrails`
- Case pattern: `channel-variant-drift-from-canonical-source`

### 14. Social Distribution Patterns (X and LinkedIn)
- Topic slug: `social-distribution-patterns`
- Definition: `what-to-repurpose-from-articles-for-social-posts`
- Implementation: `how-to-package-link-image-and-video-social-assets`
- Comparison: `thread-style-vs-single-post-distribution`
- Checklist: `social-asset-checklist-before-queueing`
- Case pattern: `high-impressions-low-qualified-traffic-pattern`

### 15. Benchmark Methodology Literacy
- Topic slug: `benchmark-methodology-literacy`
- Definition: `what-citation-rate-share-of-voice-and-coverage-mean`
- Implementation: `how-to-read-benchmark-runs-without-overclaiming`
- Comparison: `citation-volume-vs-citation-quality`
- Checklist: `benchmark-interpretation-checklist-for-teams`
- Case pattern: `metric-misreadings-that-lead-to-bad-priorities`

### 16. Grounded vs Ungrounded Interpretations
- Topic slug: `grounded-vs-ungrounded`
- Definition: `grounded-vs-ungrounded-modes-explained`
- Implementation: `how-to-use-grounded-evidence-in-content-decisioning`
- Comparison: `domain-level-mentions-vs-page-level-provenance`
- Checklist: `grounding-quality-checklist-for-internal-reviews`
- Case pattern: `correct-domain-wrong-page-pattern`

### 17. Vertical Strategy: Agencies
- Topic slug: `vertical-strategy-agencies`
- Definition: `ai-visibility-priorities-for-agencies`
- Implementation: `how-agencies-should-operationalize-weekly-readiness-reviews`
- Comparison: `single-brand-vs-multi-client-geo-operating-model`
- Checklist: `agency-geo-service-delivery-checklist`
- Case pattern: `agency-reporting-without-methodology-guardrails`

### 18. Vertical Strategy: Ecommerce
- Topic slug: `vertical-strategy-ecommerce`
- Definition: `ecommerce-ai-readiness-basics-beyond-product-seo`
- Implementation: `how-to-improve-product-page-extractability-at-scale`
- Comparison: `catalog-depth-vs-citation-clarity-tradeoffs`
- Checklist: `ecommerce-geo-checklist-for-category-and-product-pages`
- Case pattern: `large-catalog-low-context-pattern`

### 19. Vertical Strategy: Legal and Professional Services
- Topic slug: `vertical-strategy-legal-professional-services`
- Definition: `why-intent-cohort-fit-matters-for-legal-benchmarks`
- Implementation: `how-to-build-service-line-specific-content-clusters`
- Comparison: `broad-vertical-content-vs-subcohort-content-strategy`
- Checklist: `professional-services-trust-and-clarity-checklist`
- Case pattern: `mixed-intent-content-that-confuses-buyers-and-models`

### 20. Content Operations and Governance
- Topic slug: `content-operations-and-governance`
- Definition: `what-a-lean-content-governance-model-looks-like`
- Implementation: `how-to-run-weekly-content-ops-with-review-gates`
- Comparison: `fully-manual-vs-assisted-editorial-pipelines`
- Checklist: `publish-governance-checklist-for-100-topic-programs`
- Case pattern: `fast-publishing-without-quality-controls-pattern`

## Production sequencing note

This taxonomy is frozen for planning.

Generation/publishing should execute in batches, not all 100 at once:
- Batch 1: 20 topics (one per pillar)
- Batch 2: next 40 topics
- Batch 3: final 40 topics

This keeps quality control and claim discipline stable while scaling output.

## Non-goals for A1

- frontmatter/media field contract changes (A2)
- topic registry persistence in app/admin tables (A3+)
- nav-shell implementation (B-slices)
- automated generation/publish orchestration
