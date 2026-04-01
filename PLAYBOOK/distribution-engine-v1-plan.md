# GEO-Pulse Distribution Engine V1 Plan

Last updated: 2026-03-31

## Purpose

Define the first deliberate plan for turning the current content machine into a broader distribution engine.

This is a planning artifact only.

It does not:
- add production posting code
- guarantee every platform can be fully automated
- collapse all destination types into one generic post shape
- replace the current benchmark stream as the next active implementation priority

## Why this exists

The current content machine proves the first site-first path:
- canonical article lives on GEO-Pulse
- newsletter draft can be pushed downstream
- destination readiness is controlled in admin

The next expansion is not "add more adapters one by one."

The next expansion is to define a real distribution engine with:
- asset types
- media handling
- platform auth
- scheduling and approval workflow
- delivery lifecycle
- attribution back to canonical content

Without that layer, GEO-Pulse risks building a pile of provider-specific posting code that does not generalize.

## Working thesis

GEO-Pulse should treat distribution as a product subsystem, not a side effect of article publishing.

That means:
- GEO-Pulse remains canonical
- every downstream post is derived from a canonical content item or benchmark insight
- destination-specific assets are explicit records
- publish operations are modeled as delivery jobs with clear states
- Cloudflare Workers orchestrate the control plane
- R2 stores generated media assets when needed
- Supabase stores the relational state, auth links, approvals, and delivery history

## Canonical principles

### 1. GEO-Pulse remains source of truth

The canonical article, note, or benchmark insight lives on GEO-Pulse first.

Downstream platforms are distribution destinations, not the primary source of truth.

### 2. Assets must be typed explicitly

The engine should not pretend that a newsletter, an X thread, a YouTube upload, and an Instagram carousel are the same object.

The engine should explicitly support asset types such as:
- `newsletter_email`
- `link_post`
- `thread_post`
- `single_image_post`
- `carousel_post`
- `short_video_post`
- `long_video_post`

### 3. Default mode is review-first

V1 distribution should bias toward:
- `draft`
- `scheduled`
- explicit `publish_now`

It should not default to silent immediate cross-platform posting.

### 4. Media must support text-first extractability

Images, carousels, and video can strengthen distribution, but the canonical text asset must still explain the idea directly.

The engine should support media, but should not make the GEO-Pulse site depend on media to carry the core meaning.

### 5. Delivery should be observable

Every publish attempt should have:
- a stable delivery job record
- provider response metadata
- retry/failure state
- final destination URL when available

## V1 scope

The first real distribution engine should cover:
- typed downstream asset records
- provider account connection model
- destination capability registry
- queued publish job lifecycle
- explicit admin approval and scheduling model
- text, image, carousel, and video-ready schema
- first generalized provider contract across newsletter + social destinations

The first version should exclude:
- autonomous unsupervised publishing
- auto-generation of final media without review
- full in-app video rendering/transcoding pipeline
- support for every platform-specific feature on day one
- deep performance analytics beyond first delivery/accountability metrics

## Target platform classes

### Text-first / low-media platforms

- `buttondown`
- `kit`
- `ghost`
- `x`
- `linkedin`
- `threads`
- `reddit`

### Media-heavy platforms

- `instagram`
- `facebook`
- `youtube`
- `tiktok`

## Recommended implementation order

The order matters.

### Phase A. Distribution schema foundation

This is the required first implementation task when work starts.

Add canonical schema for:
- `distribution_accounts`
- `distribution_account_tokens`
- `distribution_assets`
- `distribution_asset_media`
- `distribution_jobs`
- `distribution_job_attempts`

This is the load-bearing prerequisite for everything else.

### Phase B. Capability model and admin surfaces

Add:
- destination capability registry expansion beyond newsletter-only assumptions
- account connection status in admin
- asset type / publish mode controls
- first delivery queue visibility

### Phase C. Asset derivation model

Allow one canonical item to produce explicit downstream asset records such as:
- X thread
- LinkedIn post
- Buttondown newsletter email
- Instagram carousel plan
- YouTube short metadata

### Phase D. Queue-based delivery engine

Move publish operations into queued delivery jobs with:
- draft
- scheduled
- publish now
- retry / fail / cancel states

### Phase E. First generalized adapters

Start with:
1. `x`
2. `linkedin`
3. `buttondown`

Then:
4. `instagram` / `facebook`
5. `youtube`
6. `threads`
7. `tiktok`

### Phase F. Media workflow hardening

Add:
- R2-backed media references
- upload lifecycle state
- thumbnail / slide / video metadata
- provider-specific media validation rules

## Proposed data model

### `distribution_accounts`

Represents one connected external publishing identity.

Fields should include:
- `account_id`
- `provider_name`
- `account_label`
- `external_account_id`
- `status`
- `default_audience_id`
- `metadata`
- `connected_by_user_id`
- `last_verified_at`

### `distribution_account_tokens`

Stores token lifecycle separately from account identity.

Fields should include:
- `distribution_account_id`
- `token_type`
- `access_token_encrypted`
- `refresh_token_encrypted`
- `expires_at`
- `scopes`
- `metadata`

### `distribution_assets`

Represents one derived downstream asset.

Fields should include:
- `asset_id`
- `content_item_id`
- `asset_type`
- `provider_family`
- `title`
- `body_markdown`
- `body_plaintext`
- `caption_text`
- `status`
- `cta_url`
- `metadata`
- `created_by_user_id`
- `approved_by_user_id`
- `approved_at`

### `distribution_asset_media`

Represents media attachments for a downstream asset.

Fields should include:
- `asset_id`
- `media_kind`
- `storage_url`
- `mime_type`
- `alt_text`
- `caption`
- `sort_order`
- `provider_ready_status`
- `metadata`

### `distribution_jobs`

Represents one publish or schedule attempt.

Fields should include:
- `job_id`
- `asset_id`
- `distribution_account_id`
- `publish_mode`
- `scheduled_for`
- `status`
- `destination_url`
- `provider_post_id`
- `last_error`
- `created_by_user_id`
- `completed_at`

### `distribution_job_attempts`

Represents retry/history rows.

Fields should include:
- `distribution_job_id`
- `attempt_number`
- `request_summary`
- `response_summary`
- `provider_status_code`
- `error_message`
- `created_at`

## Admin workflow target

The eventual operator flow should be:

1. start from canonical content or benchmark insight
2. generate one or more downstream assets
3. attach or render media assets when required
4. approve the asset
5. choose:
   - save as draft
   - schedule
   - publish now
6. inspect delivery status and destination URL in GEO-Pulse

The end-state goal is:
- operators should not need to log into each platform for normal posting

But V1 must still support:
- draft-first safety
- per-platform fallback when permissions or media validation fail

## Cloudflare architecture guidance

Cloudflare is a good fit for the control plane.

Use:
- Workers for orchestration, provider API calls, and admin actions
- Queues for publish jobs and retries
- R2 for media storage
- Cron for scheduled dispatch

Do not assume Workers alone should own:
- heavy video rendering
- complex transcoding
- large asset generation pipelines

If video generation grows, keep orchestration in Workers and move rendering to a separate bounded service.

## Risks

### Adapter sprawl risk

If GEO-Pulse adds providers before defining typed assets and jobs, the codebase will become provider-shaped and hard to reason about.

### Token lifecycle risk

The real complexity is not only posting. It is long-lived account auth, refresh, expiry, and revocation.

### Media workflow risk

Image and video platforms introduce larger operational complexity than newsletter/text adapters.

### Review bypass risk

If the system defaults to immediate posting before asset and approval state are explicit, GEO-Pulse can create accidental-send risk.

### Benchmark distraction risk

This distribution-engine plan is important, but it is not the next active implementation stream.

Benchmarking remains the next active workstream after this planning slice unless the user explicitly changes priority.

## Next implementation order

When the user says "work on the distribution engine," the first implementation order should be:

1. draft the schema migration set
2. add typed server-side repository/helpers for the new distribution tables
3. add the admin capability/account shell
4. add the queued job model
5. only then implement the first generalized social adapters

Do not start by directly wiring TikTok, YouTube, Instagram, X, or Threads into the current newsletter-only delivery shape.

## Explicit non-goal for now

Do not start this implementation stream before the current benchmarking work returns to focus, unless the user explicitly reprioritizes it.
