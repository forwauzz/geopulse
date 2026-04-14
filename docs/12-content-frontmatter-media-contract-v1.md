# GEO-Pulse Content Frontmatter + Media Contract v1 (A2)

Last updated: 2026-04-03

## Purpose

Freeze a lean markdown frontmatter contract for canonical articles and downstream distribution assets.

This contract is designed to:
- keep markdown as source-of-truth where it makes sense
- support docs-style blog navigation
- support thumbnails/video for blog and newsletter/social push
- preserve claim discipline and site-first publishing

This is a planning + implementation contract.

It does not:
- auto-publish content
- guarantee citation/ranking outcomes
- replace editorial review gates

## Scope

Applies to canonical article markdown assets in the GEO-Pulse content machine.

Route assumptions:
- canonical article: `/blog/[slug]`
- topic hub: `/blog/topic/[topic]`

## Frontmatter schema (v1)

### Required fields

```yaml
content_id: "content_..."
slug: "..."
title: "..."
summary: "..."
topic: "..."
intent: "definition|implementation|comparison|checklist|case_pattern"
status: "draft|review|approved|published"
publish_state: "draft|scheduled|published"
canonical_url: "https://getgeopulse.com/blog/..."
cta_goal: "free_scan"
author_name: "..."
author_role: "..."
updated_at: "2026-04-03"
```

### Recommended fields

```yaml
publish_at: "2026-04-10T13:00:00Z"
excerpt: "short social/newsletter excerpt"
primary_keyword: "..."
secondary_keywords:
  - "..."
  - "..."
related_slugs:
  - "..."
  - "..."
parent_topic_slug: "..."
next_slug: "..."
prev_slug: "..."
noindex: false
```

## Media contract (v1)

### Canonical media fields

```yaml
cover_image_url: "https://..."
cover_image_alt: "..."
thumbnail_image_url: "https://..." # optional override
video_url: "https://..." # optional
video_provider: "youtube|vimeo|hosted|other" # optional
video_thumbnail_url: "https://..." # optional
social_image_url: "https://..." # optional override
newsletter_featured_image_url: "https://..." # optional override
```

### Media fallback order

#### Thumbnail/OG fallback
1. `social_image_url`
2. `thumbnail_image_url`
3. `cover_image_url`

#### Newsletter image fallback
1. `newsletter_featured_image_url`
2. `social_image_url`
3. `thumbnail_image_url`
4. `cover_image_url`

#### Video fallback
- if `video_url` exists and is valid, render video block
- if video embed is not supported by destination, fall back to canonical article link and image preview

## Channel mapping (v1)

### Blog renderer
- title: `title`
- route slug: `slug`
- summary/meta: `summary`
- hero image: `cover_image_url` (or fallback chain)
- video block: `video_url` + `video_provider` when present
- related nav: `related_slugs`, `parent_topic_slug`, `next_slug`, `prev_slug`

### Newsletter adapters (Kit/Ghost/Buttondown)
- subject/title: `title`
- intro/excerpt: `excerpt` fallback `summary`
- featured image: newsletter fallback chain
- canonical link CTA: `canonical_url`
- optional video behavior: linked preview only unless provider supports embedding cleanly

### Social adapters (X/LinkedIn)
- post title/lead: `title`/`excerpt`
- image path: thumbnail/OG fallback chain
- video path: `video_url` or provider-ready media mapping via distribution asset media rows
- destination link: `canonical_url`

## Validation contract (v1)

### Hard publish blockers
- missing `content_id`, `slug`, `title`, `summary`, `topic`, `intent`, `status`, `publish_state`, `cta_goal`, `updated_at`
- invalid `intent` enum
- invalid `publish_state` enum
- invalid `canonical_url` for published/scheduled items
- `status=published` while `publish_state` is not `published`
- missing image fallback set for channels that require thumbnails

### Soft warnings
- missing `excerpt`
- missing `related_slugs`
- video set without `video_provider`
- `updated_at` older than freshness policy threshold

## Lean implementation notes

- Keep markdown as canonical source for article content + frontmatter metadata.
- Keep channel-specific render/push behavior in adapters, not in ad hoc post text.
- Use deterministic fallback chains to prevent empty-media publishes.
- Keep enums narrow to reduce maintenance burden.

## Non-goals for A2

- topic registry persistence (A3)
- docs-style nav shell implementation (B-slices)
- autoscheduling/publish orchestration
- destination-specific rich-media transformations beyond current adapter/runtime seams

## Next slice

`B1`: freeze docs-style blog IA/navigation contracts on top of A1/A2/A3 planning artifacts.
