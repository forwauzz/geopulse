# Current State

Last consolidated: 2026-04-10

## Product Status

**Billing & plan columns:** Stripe-backed subscription truth lives in **`user_subscriptions`** (`bundle_key`, status, Stripe ids). **`users.plan`** is the coarse Postgres enum **`plan_type`** (`free` \| `pro` \| `agency`); webhooks map bundle → plan via `bundleToPlan`. Bundle-level product logic should use `user_subscriptions`, not assume `users.plan` encodes a bundle. Admin plan override uses only `plan_type` values (`lib/server/plan-type.ts`, BILL-011). See **ADR-009** in `agents/memory/DECISIONS.md`.

Admin UX: `/dashboard` sidebar admin affordances use `platform_admin_users`; `/dashboard/content` is wrapped by `app/dashboard/(admin)/layout.tsx` for a single admin gate — failed admin context (other than service-role misconfiguration) redirects to `/dashboard` instead of an inline error; `app/admin/layout.tsx`, the admin login action, and the distribution OAuth gate all enforce the same DB-backed platform admin allowlist; the middleware only enforces ordinary session presence for `/admin/*`; distribution OAuth callback uses the same DB-backed check.

The admin user detail page now has a hard-delete danger zone for test accounts: it requires exact-email confirmation, blocks self-delete and platform-admin deletion, cancels live subscriptions, removes user-owned operational artifacts, deletes scans/payments, and then deletes auth access so the account disappears from the product path.

GEO-Pulse is a working Next.js + Cloudflare Workers product with these end-to-end paths implemented:
- free scan
- guided results journey
- lead capture / preview save
- paid deep-audit checkout
- Stripe webhook + queue processing
- PDF + markdown report generation
- email delivery
- auth + dashboard
- admin eval analytics + retrieval drilldown
- marketing attribution reporting
- retrieval / prompt evaluation foundation

## Current Phase

Current orchestrator phase: `Phase 4 - Launch`

Launch is not fully closed yet.

## Current planning stream

A separate planning-only content-machine stream now exists on branch `planning/content-machine-v1`.

A separate billing/onboarding byte-task stream is now frozen in `docs/19-billing-onboarding-implementation-plan.md` and `PLAYBOOK/billing-onboarding-v1.md`. It keeps the self-serve path narrow: lock product truth first, then runtime checkout-mode truth, then UI alignment, admin readiness checks, and end-to-end onboarding proof.

A separate auth/signup byte-task stream is now frozen in `docs/20-auth-signup-implementation-plan.md` and `PLAYBOOK/auth-signup-v1.md`. It keeps the public auth path narrow: one primary sign-up surface for pricing-tier clicks, one secondary sign-in escape hatch, then password rollout, bundle preservation, redirect alignment, and focused tests.

BT-001 from that stream is now complete: the `/login?mode=signup` path renders a single sign-up panel with an `Or sign in` link beneath it instead of a side-by-side split view.

BT-002 from that stream is now complete: the sign-up panel collects name, email, password, and password confirmation, creates the account, signs the user in, and resumes the selected pricing bundle toward checkout.

BT-004 from that stream is now complete: password sign-in from a pricing-tier signup link now preserves the selected bundle and resumes the same checkout path instead of dropping the user back on pricing without autosubscribe context.

BT-005 from that stream is now complete: focused regression coverage now asserts both the signup shell and the password signup/sign-in redirect behavior for tier-based onboarding.

BT-006 from that stream is now complete: the auth/signup playbook, plan, current-state doc, and project memory are aligned with the shipped password-based signup flow.

The product truth for bundles is now explicit in the billing playbook: `startup_lite` stays free, `startup_dev` is paid but still uses the explicit startup workspace bypass for full-audit access, and `agency_core` / `agency_pro` include deep-audit entitlement while still honoring backend checkout modes and payment guardrails.

The deep-audit checkout-mode contract is now explicit too: `stripe`, `agency_bypass`, and `startup_bypass` are shared through `lib/shared/deep-audit-checkout-mode.ts`, and the scan results UI normalizes unknown values back to `stripe`.

The results and checkout UI now reads the bypass state distinctly for startup workspaces and agency clients, so neither path falls back to Stripe phrasing when the backend has already declared a bypass.

The admin bundle page now includes a readiness summary that separates billing config, Stripe mapping coverage, and entitlement override coverage before a bundle is treated as launch-ready.

The onboarding handoff now has explicit shared helpers for post-signup redirects and subscription success URLs, plus a focused flow test that covers signup -> subscribe -> provisioning -> dashboard recovery -> audit-access state.

The checkout and workspace-provisioning flow now has a dedicated byte-task stream in `docs/21-checkout-workspace-provisioning-implementation-plan.md` and `PLAYBOOK/checkout-workspace-provisioning-v1.md`. The pricing page now uses one stable checkout wait state before Stripe appears, and the connectors page now shows a provisioning-pending state with a dashboard return path when a live startup/agency subscription exists but the workspace/account link has not landed yet.

Startup access is now centrally resolved through `lib/server/startup-access-resolver.ts` so the startup dashboard, connectors, new-scan, and checkout pages can distinguish `no_subscription`, `needs_provisioning`, `workspace_missing_membership`, and `ready` before they decide whether to show the workspace UI or continue with the scan flow. The checkout bypass decision now reads the same resolver contract.

Subscription workspace/account provisioning now uses a subscription-derived key plus conflict-aware membership writes, so webhook retries and near-simultaneous deliveries converge on one child record instead of creating duplicate workspaces or agency accounts.

The coarse `users.plan` field now syncs from the remaining live subscriptions instead of being forced to `free` on every cancellation, so the plan column stays aligned when a user still has another active or trialing bundle.

The Stripe webhook route now has explicit dispatch coverage for subscription lifecycle events, invoice lifecycle events, and the subscription-mode checkout skip path, so the router contract stays stable as the billing stream evolves.

Admin bundle configuration is now annotated so operators can distinguish bundle-local billing/service settings from the cross-bundle service control center. The bundle page now points admins to `/admin/services` for deep-audit bypass rules and payment-required overrides instead of implying those rules belong in the bundle editor. The bundle editor now uses a binary included/not included toggle for service rows and derives `free/off` from that choice instead of asking operators to manage access mode directly.

Current truth:
- planning docs still exist on `planning/content-machine-v1`
- the first implementation slice is now in repo: canonical content tables, downstream delivery records, a server-side admin data helper, and a minimal `/dashboard/content` inventory page
- the second implementation slice is now in repo too: provider-control records for downstream destinations, a destination admin helper, and feature-flag controls for newsletter providers inside `/dashboard/content`
- the third implementation slice is now in repo too: local draft import from `PLAYBOOK/content-machine-drafts` into canonical `content_items` via an admin action in `/dashboard/content`
- the fourth implementation slice is now in repo too: a first content-item detail/editor page at `/dashboard/content/[contentId]` for reviewing and updating imported records
- the fifth implementation slice is now in repo too: a provider adapter contract, Kit and Ghost adapters, and a draft-push action from the content-item page into the selected destination
- the sixth implementation slice is now in repo too: effective destination readiness from feature flags plus env state, surfaced directly in the content admin UI
- the seventh implementation slice is now in repo too: structured content-push lifecycle events written into `app_logs` and visible at `/dashboard/logs`
- the eighth implementation slice is now in repo too: a first public blog surface at `/blog` and `/blog/[slug]` backed by canonical published `content_items`
- the ninth implementation slice is now in repo too: a first admin-to-blog publish workflow with publish guardrails, canonical blog URL derivation, and a dedicated publish action from `/dashboard/content/[contentId]`
- the tenth implementation slice is now in repo too: first article author metadata captured in `content_items.metadata` plus article-level JSON-LD on `/blog/[slug]`
- the eleventh implementation slice is now in repo too: topic-cluster navigation on `/blog` plus related-article and browse-article menus on `/blog/[slug]`
- the twelfth implementation slice is now in repo too: dedicated topic landing pages at `/blog/topic/[topic]` so clusters are navigable URLs, not just labels
- the thirteenth implementation slice is now in repo too: topic-page intros with definition, why-it-matters, and practical takeaway blocks on `/blog/topic/[topic]`
- the fourteenth implementation slice is now in repo too: topic-page intro copy can be seeded and edited from the content admin via canonical `research_note` records
- the fifteenth implementation slice is now in repo too: article-body internal-link blocks that point into topic hubs and sibling articles
- the sixteenth implementation slice is now in repo too: topic-page structured data plus a lightweight editorial-readiness checklist in admin
- the seventeenth implementation slice is now in repo too: article publishing is blocked when required editorial-readiness checks fail
- the eighteenth implementation slice is now in repo too: a blog launch-readiness dashboard at `/dashboard/content/launch`
- Buttondown is now added as a third live newsletter destination adapter alongside Kit and Ghost, while draft push remains the current default publish mode
- the blog renderer now supports captioned images and standalone-link video embeds without changing the text-first canonical article model
- authenticated dashboard routes now use a dedicated left-side navigation shell rather than relying on top-nav duplication
- the repo now has a first-pass product marketing context, founder voice draft, social-research synthesis, blog LLM-readiness spec, content-machine blueprint, and content-writing skill spec
- the repo now has a frozen docs-style 100-topic planning taxonomy for content scale (`docs/11-topic-taxonomy-v1.md`) using a bounded `20 pillars x 5 intents` model
- the repo now has a frozen markdown frontmatter + media/channel mapping contract for canonical content and downstream newsletter/social distribution (`docs/12-content-frontmatter-media-contract-v1.md`)
- the repo now has a machine-readable topic registry for editorial/generation tracking (`docs/13-topic-registry-v1.json`) derived from the frozen taxonomy and split with bounded batch planning fields
- the repo now has a frozen docs-style blog IA/navigation contract (`docs/14-docs-style-blog-ia-contract-v1.md`) that defines route ownership, left-nav/breadcrumb behavior, topic-hub/article navigation rules, and crawler-friendly hierarchy constraints
- the first docs-style blog navigation shell is now in repo too (`B2`): `/blog`, `/blog/topic/[topic]`, and `/blog/[slug]` now use explicit breadcrumb navigation with bounded topic-aware docs-style side navigation for topic/article browsing
- the next IA/SEO hardening slice is now in repo too (`C1`): blog index/topic/article pages now emit breadcrumb JSON-LD aligned to visible breadcrumbs, blog index now emits collection structured data, and route metadata now includes a canonical URL for `/blog` in addition to existing topic/article canonicals
- the next IA/SEO hardening slice is now in repo too (`C2`): sitemap coverage is now split by surface (`/sitemap.xml`, `/blog/sitemap.xml`, `/blog/topic/sitemap.xml`), robots now advertises all sitemap endpoints, and article metadata now supports `noindex` with route-level robots/canonical behavior aligned to indexability expectations
- the next quality-gate slice is now in repo too (`D1`): pre-publish validation now enforces frontmatter/media/indexability requirements in publish workflows (publish button, bulk ready-publish, and direct `status=published` transitions), including topic-cluster presence, author fields, hero media fields, and `noindex` publish blocking
- the next quality-gate slice is now in repo too (`D2`): publish validation now also enforces explicit LLM-readiness + claim-discipline checks (concrete extractable heading patterns, answer-block density, in-body internal blog link presence, and blocking of absolute overclaim language)
- the next quality-gate slice is now in repo too (`D3`): `/dashboard/content/[contentId]` now surfaces the same shared publish-gate checks as structured operator-facing pass/fail cards grouped by publish contract, LLM readiness, and claim discipline
- the next quality-gate slice is now in repo too (`D4`): publish validation now also enforces richer semantic checks for claim-to-source alignment, freshness drift on time-sensitive phrasing, and terminology consistency/clarification
- the next quality-gate slice is now in repo too (`D5`): publish-check snapshots are now persisted in article metadata and visible as recent pass/fail history in `/dashboard/content/[contentId]` for operator trend review
- the next quality-gate slice is now in repo too (`D6`): `/dashboard/content` now includes a compact publish-quality trend summary (cross-article failure patterns + regression flags) computed from persisted publish-check snapshots
- the next planned public blog UI slice is now in repo too (`E1`): `/blog`, `/blog/topic/[topic]`, and `/blog/[slug]` now run with a black-first visual theme and white-primary text while preserving docs-style IA behavior and contrast accessibility
- the next planned public blog UI slice is now in repo too (`E2`): header/footer now apply blog-route dark-theme treatment with first contrast edge-case cleanup, while non-blog routes keep existing theme behavior
- the next planned public blog UI slice is now in repo too (`E3`): final dark-theme polish now aligns link/hover/active parity and low-contrast copy cleanup across blog routes and markdown rendering
- the next planned public blog UI slice is now in repo too (`E4`): route-scoped visual QA polish now adds blog-route focus-visible treatment, selection contrast, and readability smoothing
- the next planned public blog UI slice is now in repo too (`E5`): screenshot-based cross-device visual QA now runs in Playwright via `tests/e2e/blog-visual.spec.ts` with deterministic blog fixture data for stable checks
- the next planned public blog UI slice is now frozen too (`E6`): optional tiny spacing/typography/perf micro-polish only if real-usage feedback surfaces concrete issues
- the first 100-topic execution slice is now in repo too (`F1`): `/dashboard/content` can seed `batch_1` topic inventory from `docs/13-topic-registry-v1.json` into canonical `content_items` as article briefs using idempotent slug/content-id skip behavior
- the next 100-topic execution slice is now in repo too (`F2`): `/dashboard/content` now includes in-app batch-progress visibility (`batch_1`/`batch_2`/`batch_3`) so weekly operations can track planned vs seeded/ready/published coverage without manual doc inspection
- the next 100-topic execution slice is now in repo too (`F3`): `/dashboard/content` now includes seed controls for `batch_2` and `batch_3` with the same idempotent safety behavior as `batch_1`
- the next 100-topic execution slice is now in repo too (`F4`): `/dashboard/content` now includes a bounded in-app drafting queue view for article rows (`brief`/`draft`/`review`) with the next 10 items per bucket for blog-first execution
- the next 100-topic execution slice is now in repo too (`F5`): `/dashboard/content` drafting queue now supports owner/week assignment metadata plus queue filters for session-based blog execution planning
- the next 100-topic execution slice is now in repo too (`F6`): `/dashboard/content` drafting queue now supports bounded bulk transitions (`brief`->`draft`, `draft`->`review`, `review`->`approved`) with current owner/week filter scope
- the next 100-topic execution slice is now in repo too (`F7`): `/dashboard/content` now supports bounded approved-blog publish-wave controls with filter-aware dry-run preview + execute, while newsletter distribution remains paused
- the next 100-topic execution slice is now frozen too (`F8`): add post-wave outcome visibility (published count, blocked count, top block reasons) for each publish wave run
- the repo now also has a dedicated distribution-engine planning document that froze the implementation order as schema-first, repository/admin second, orchestration third, adapter expansion later
- the first generalized distribution-engine schema slice is now in repo too: `supabase/migrations/020_distribution_engine_foundation.sql` adds accounts, tokens, assets, media, jobs, and attempts beside the existing content-machine delivery tables
- the second generalized distribution-engine slice is now in repo too: `lib/server/distribution-engine-repository.ts` and `lib/server/distribution-engine-admin-data.ts` provide typed repository and admin-summary helpers over the new schema
- the third generalized distribution-engine slice is now in repo too: a first admin shell exists at `/dashboard/distribution`, summarizing accounts, assets, jobs, and attempt/error state
- the fourth generalized distribution-engine slice is now in repo too: writable account / asset / job controls plus a manual dispatch trigger exist behind explicit feature flags instead of being exposed by default
- the fifth generalized distribution-engine slice is now in repo too: a bounded dispatcher can process due distribution jobs, persist attempts, and reuse the current content-destination adapter seam for supported newsletter/content providers
- the sixth generalized distribution-engine slice is now in repo too: the existing Worker cron can now enqueue due distribution jobs into a dedicated queue-backed runtime when the dedicated distribution runtime flag is enabled
- the seventh generalized distribution-engine slice is now in repo too: `/dashboard/distribution` can now store account-token rows, update connection status, and show first-pass token health directly in the account table
- distribution adapter expansion now follows a lean slice sequence (`1A` through `1F`) to keep maintenance low and rollout bounded; `1A` (adapter scaffolds + contract tests for `x` and `linkedin`) is now in repo
- the distribution-engine UI is feature-flagged with `DISTRIBUTION_ENGINE_UI_ENABLED` and `DISTRIBUTION_ENGINE_WRITE_ENABLED`, so unfinished admin capability is not exposed accidentally
- the background dispatch lane is separately gated with `DISTRIBUTION_ENGINE_BACKGROUND_ENABLED` plus a bounded per-sweep limit, so queue rollout can stay dark until intentionally enabled
- `1B` is now in repo too: text-first runtime wiring for `x` and `linkedin` is active through the existing adapter/dispatch seam using env-based provider credentials
- `1C` is now in repo too: dispatch runtime can read provider credentials from `distribution_account_tokens` for `x` and `linkedin`, with bounded non-retryable auth/config failures when required token rows are missing
- `1D` is now in repo too: `x` and `linkedin` publish failures now use provider-aware retry classification (rate-limit/transient failures retryable, auth/permission failures terminal)
- `1E` is now in repo too: `/dashboard/distribution` includes a quick social seeding path that creates an approved `x`/`linkedin` asset plus linked job from one canonical content item for operator runtime testing
- `1F` is now in repo too: hardening guardrails are added across the first social runtime path (dispatchable job-status defaults, stricter social seed validation, and clearer operator guidance/errors)
- `2A` is now in repo too: provider-native OAuth connect foundation for `x` and `linkedin` is available behind `DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED`, including signed state, provider callback handling, and token persistence into `distribution_account_tokens`
- `2B` is now in repo too: first token lifecycle runtime handling is active in dispatch (expiry preflight, bounded X refresh-token rotation, and account status transitions to `token_expired` on non-recoverable auth lifecycle failures)
- `2C` is now in repo too: provider-specific retry backoff windows are now enforced in-runtime (retryable failures are deferred via `scheduled_for` windows instead of immediate queue retries, with first provider-specific windows for `x` and `linkedin`)
- `2D` is now in repo too: operators can now control backoff policy (`profile` + `multiplier`) per account from `/dashboard/distribution`, and job rows now expose next-retry observability from attempt metadata
- `2E` is now in repo too: refresh lifecycle handling now also supports LinkedIn refresh-token exchange when available, and `/dashboard/distribution` now shows explicit reconnect guidance for token-expired LinkedIn accounts
- `3A` is now in repo too: first media foundation controls are live in admin (asset media replace/seed form, media preview/readiness visibility) and dispatch now blocks media-required asset types when no provider-ready media rows exist
- `3B` is now in repo too: first provider media publish path is wired for LinkedIn `single_image_post` assets (media upload + post publish), while unsupported media/provider combinations are now explicitly blocked with bounded errors
- `3C` is now in repo too: LinkedIn `carousel_post` assets now have a provider-native media publish path (multi-image upload + post publish), with bounded validation for provider-ready carousel/image media rows
- `3D` is now in repo too: LinkedIn `short_video_post` assets now have a provider-native media publish path (video upload + post publish), with bounded validation for provider-ready video rows
- `3E` is now in repo too: LinkedIn `long_video_post` assets now have a provider-native media publish path (reusing the bounded video upload + post publish runtime), with bounded validation for provider-ready video rows
- `3F` is now in repo too: first non-LinkedIn media path is wired for X `single_image_post` assets (media upload + tweet publish), with bounded validation for provider-ready image rows
- `3G` is now in repo too: X `short_video_post` assets now have a provider-native media publish path (video upload + tweet publish), with bounded validation for provider-ready video rows
- `3H` is now in repo too: X `long_video_post` assets now have a provider-native media publish path (reusing the bounded X video upload + tweet publish runtime), with bounded validation for provider-ready video rows
- what remains for the generalized distribution engine is broader media publishing coverage (additional providers and richer provider-specific media behavior where needed) and broader social/video adapter expansion beyond the first text-first pair
- the implementation direction remains site-first and LLM-searchability-aware so GEO-Pulse does not create a visibility product while publishing weakly extractable content on its own domain
- a new planning-only agency pilot stream is now documented in `docs/09-agency-pilot-lifter-plan.md`
- that plan freezes the first target as one internal pilot agency (`lifter.ca`) with:
  - agency login
  - client-scoped audit history
  - admin-controlled feature entitlements
  - model-policy overrides
  - pilot deep-audit payment bypass
- the first implementation slice is now in repo too: schema foundation for `agency_accounts`, `agency_users`, `agency_clients`, `agency_client_domains`, `agency_feature_flags`, and `agency_model_policies`, plus benchmark-aware lineage columns on `scans` and `reports`
- the second implementation slice is now in repo too: a minimal admin control page at `/dashboard/agencies` plus server helpers/actions for creating agency accounts, adding clients, and setting pilot feature flags and model policies
- the third implementation slice is now in repo too: agency-user provisioning from `/dashboard/agencies` plus password sign-in support on `/login` for pilot accounts
- the fourth implementation slice is now in repo too: `/dashboard` is agency-aware for members, with account/client context selection and client-scoped audit/report history for rows already linked to agency lineage
- the next agency dashboard slice is now in repo too: agency members can create clients and add tracked domains directly from `/dashboard`, using the selected agency context
- the fifth implementation slice is now in repo too: agency-context scans can now be launched from `/?agencyAccount=...&agencyClient=...`, and eligible agency results can bypass Stripe into the existing deep-audit queue path when `payment_required` is false
- the sixth implementation slice is now in repo too: agency/client model policy now affects runtime for Gemini-backed `free_scan` and `deep_audit` paths, with requested/effective model lineage stamped onto scan metadata and deep-audit run config
- the seventh implementation slice is now in repo too: agency feature entitlements now gate live product behavior for dashboard visibility, scan launch, report history, deep-audit CTA/access, and the first GEO-tracker entitlement state
- what remains is deeper polish around agency-triggered audit UX, richer client-domain control, broader agency self-service controls, and live non-Gemini provider execution
- a new startup-founder planning stream is now frozen in `docs/15-startup-dashboard-entitlements-plan.md` with bite-sized tasks (`SD-001` ... `SD-015`) for:
  - centralized service catalog + bundles + entitlement overrides
  - startup dashboard with actionable trend tracking and graphs on shared semantic theme tokens
  - markdown-audit-to-implementation planning workflow
  - GitHub App integration and agent PR lifecycle
  - multi-model policy routing by service/bundle/workspace
- a companion strategy note now exists at `PLAYBOOK/startup-dashboard-entitlements-v1.md`
- `SD-001` is now in repo:
  - migration `supabase/migrations/021_service_entitlements_foundation.sql`
  - typed keys/contracts in `lib/server/service-entitlements-contract.ts`
  - contract tests in `lib/server/service-entitlements-contract.test.ts`
- `SD-002` is now in repo:
  - unified entitlement resolver `lib/server/service-entitlements.ts`
  - resolver tests `lib/server/service-entitlements.test.ts`
  - agency entitlement integration + rollout-safe legacy fallback in `lib/server/agency-access.ts`
  - updated tests in `lib/server/agency-access.test.ts`
- `SD-003` is now in repo:
  - admin control page `/dashboard/services`
  - server actions for service defaults, bundle mappings, and scoped overrides
  - structured audit-log events for before/after entitlement changes
  - admin sidebar navigation link for service controls
- `SD-004` is now in repo:
  - startup workspace tenancy schema (`startup_workspaces`, `startup_workspace_users`, `startup_workspace_domains`)
  - startup admin bootstrap surface at `/dashboard/startups`
  - startup membership/context resolver on `/dashboard` (workspace selector + workspace-linked scan/report history)
  - startup dashboard data helper tests for membership/context selection behavior
- `SD-005` is now in repo:
  - dedicated startup route `/dashboard/startup`
  - startup shell with module slots (`score trend`, `action backlog`, `implementation lane`, `PR activity`) now on shared light/dark token classes
  - trend/backlog helper derivations + tests in `lib/server/startup-dashboard-shell.ts`
- `SD-006` is now in repo:
  - startup tracking metric helper in `lib/server/startup-tracking-metrics.ts`
  - startup dashboard modules now render real burn-down, funnel, and 7/14/30-day impact windows from workspace scan/report data
  - metric aggregation tests in `lib/server/startup-tracking-metrics.test.ts`
- `SD-007` is now in repo:
  - normalized recommendation lifecycle schema via `supabase/migrations/023_startup_recommendation_lifecycle.sql`
  - transition + summary server helpers in `lib/server/startup-recommendation-lifecycle.ts`
  - startup dashboard funnel now sourced from recommendation statuses (`suggested`, `approved`, `in_progress`, `shipped`, `validated`, `failed`)
- `SD-008` is now in repo:
  - implementation-plan schema via `supabase/migrations/024_startup_implementation_plan.sql`
  - markdown-audit parser + plan generation/query helpers in `lib/server/startup-implementation-plan.ts`
  - startup implementation module now renders team-lane cards from the latest generated plan
- `SD-009` is now in repo:
  - GitHub integration schema via `supabase/migrations/025_startup_github_integration_foundation.sql`
  - startup GitHub install/session/allowlist helpers in `lib/server/startup-github-integration.ts`
  - startup connect/disconnect + repo-allowlist controls on `/dashboard/startup` with callback handling route
  - startup GitHub controls are now entitlement-gated through centralized `github_integration` resolver flow
- `SD-010` is now in repo:
  - PR execution schema via `supabase/migrations/026_startup_agent_pr_workflow.sql`
  - recommendation-linked PR run helpers and status-sync logic in `lib/server/startup-agent-pr-workflow.ts`
  - startup dashboard PR module now supports queue/open/merge/fail control flow with recommendation lifecycle sync
- `SD-011` is now in repo:
  - centralized startup model-policy workspace scope extension via `supabase/migrations/027_startup_model_policy_scope.sql`
  - deterministic startup model resolver (`service_default` -> `bundle` -> `startup_workspace`) in `lib/server/startup-model-policy.ts`
  - budget guardrail + fallback model handling now covered by startup model-policy tests
  - model-policy metadata now stamped into startup planning and PR workflow runtime metadata
- `SD-012` is now in repo:
  - Stripe billing mapping schema via `supabase/migrations/028_service_billing_mappings.sql`
  - centralized runtime billing guard in `lib/server/service-billing-guard.ts`
  - startup GitHub connect and PR queue actions now enforce billing guard checks before execution
  - startup dashboard now surfaces explicit billing-blocked status messaging for GitHub/PR flows
- `SD-013` is now in repo:
  - centralized startup UI/action service gates in `lib/server/startup-service-gates.ts`
  - startup page and actions now consume shared gate outputs (no route-local entitlement/billing branching)
  - agency dashboard rendering now consumes centralized UI-gate mapping from `lib/server/agency-access.ts`
- `SD-014` is now in repo:
  - startup service/model/recommendation/GitHub/PR workflows now emit structured startup events with workspace + actor metadata
  - startup admin control page now includes per-workspace startup timeline cards sourced from structured logs
  - startup timeline read model is centralized in `lib/server/startup-admin-data.ts` with focused tests
- `SD-015` is now in repo:
  - startup rollout flags are centralized (`startup_dashboard`, `github_agent`, `auto_pr`) with suggest-only (`auto_pr=false`) safe default
  - startup admin control now supports per-workspace rollout toggle controls
  - startup dashboard/actions now enforce rollout flags consistently, including rollout-disabled and suggest-only outcomes
- next startup stream step is pilot rollout execution using SD-015 controls
- startup Slack MVP planning stream is now opened:
  - contract and byte-sized execution plan in `docs/17-startup-slack-integration-mvp-plan.md`
  - strategy companion in `PLAYBOOK/startup-slack-integration-mvp-v1.md`
  - pilot rollout runbook in `docs/18-startup-slack-pilot-rollout-runbook.md`
  - `SL-001` is complete (message contract + rollout posture)
  - `SL-002` is complete (central Slack service keys + startup Slack rollout flags)
  - `SL-003` is complete (minimal Slack schema: installations, destinations, delivery events)
  - `SL-004` is complete (Slack OAuth connect/disconnect foundation, startup dashboard connection card)
  - `SL-005` is complete (destination list + add flow in startup dashboard)
  - `SL-006` is complete (manual send-to-Slack action from report/audit context)
  - `SL-007` is complete (normalized Slack message formatter contract wired to manual send)
  - `SL-008` is complete (delivery event persistence for success/failure + failure reasons)
  - `SL-009` is complete (workspace `slack_auto_post` toggle, owner/admin controlled)
  - `SL-010` is complete (centralized Slack service controls wired in `/dashboard/services`)
  - `SL-011` is complete (focused Slack integration test pass and hardening)
  - `SL-012` is complete (Alie pilot rollout/evidence runbook for operator execution)
  - `SL-013` is complete (scheduled startup Slack cadence path enqueues due deep-audit jobs for eligible workspaces)
  - `SL-014` is complete (report completion path now auto-posts `new_audit_ready` Slack delivery for eligible startup workspaces)
  - verification posture for this slice is backend-focused (scheduler + queue path); no new browser UI path was added, so Playwright expansion is not required for `SL-013`/`SL-014`
- startup theme-system rollout byte is now in repo:
  - class-based global theme mode support with persisted user choice and system fallback
  - startup dashboard + long-wait overlay converted to semantic light/dark-safe tokens
  - focused browser proof at `tests/e2e/startup-theme.spec.ts` verifies toggle behavior and reload persistence on `/dashboard/startup`
  - compact cross-route parity smoke at `tests/e2e/theme-parity.spec.ts` verifies toggle + reload persistence on `/`, `/dashboard`, and `/dashboard/startup`

## What Is Implemented

### Core product
- landing + scan flow
- Turnstile validation
- SSRF-gated scanning
- deterministic + LLM-assisted checks
- weighted scoring + category scoring
- results page + share image
- live share-snapshot action:
  - native share when available
  - copy-link fallback
  - OG image preview link
- session-aware landing header:
  - logged out: sign-in only
  - logged in: dashboard + sign out

### Results and report UX
- centralized delayed long-wait loading overlay for slower user actions
- guided audit journey on results:
  - preview first
  - paid full audit as primary next step
  - preview-save as the subtle secondary path
- top-of-page action band on results:
  - preview state: scrolls users directly to buy or save
  - generating state: explains what happens next and where recovery lives
  - delivered state: prioritizes open/download/sign-in recovery actions
- state-driven status on results page:
  - preview ready
  - checkout cancelled
  - payment return awaiting confirmation
  - full audit in progress
  - report delivered
- delivered-report access stays truthful:
  - direct links only appear when hosted PDF or markdown artifacts exist
  - report viewer falls back to PDF download when no web report is available
- paid-report recovery is now explicit:
  - delivered results page points users to sign in with the Stripe checkout email
  - login page explains the recovery rule
  - dashboard empty state tells users how to recover an already-purchased report
- interactive in-browser report view above markdown sections
- Layer One report-rewriter contract freeze:
  - the repo now has a frozen section-order contract for future Layer One report rewrites
  - this is a writing-contract artifact only, not a new prompt/runtime implementation yet
- Layer One evidence-discipline freeze:
  - the repo now has frozen claim-boundary rules for future Layer One report rewrites
  - this is still a writing-policy artifact only, not a new prompt/runtime implementation yet
- Layer One tone and verbosity freeze:
  - the repo now has frozen tone rules for future Layer One report rewrites
  - the intended output is plain, direct, and operator-trustworthy rather than consultancy-styled
- Layer One recommendation-format freeze:
  - the repo now has a frozen action-card shape for future Layer One report rewrites
  - priority actions should now resolve into issue, why it matters, action, priority, and confidence
- Layer One ambiguous-signal wording freeze:
  - the repo now has frozen wording patterns for future Layer One report rewrites when findings are real but not fully diagnostic
  - examples include `402/403`, low-confidence extraction, partial schema, stale dates, and mixed page-level outcomes
- Layer One rewrite-prompt path:
  - the repo now includes a local script that builds the constrained Layer One rewrite prompt from existing report markdown
  - this is the first actual implementation seam for the report rewriter rules; the product report runtime itself is still deterministic
- Layer One gold rewrite fixture:
  - the repo now includes a first gold-standard rewritten Layer One report fixture for `cllcenter.com`
  - this exists to anchor future prompt tuning against a concrete target output rather than abstract style rules only
- Automatic Layer One report eval writing:
  - generated deep-audit markdown now writes a deterministic `report_eval_runs` row automatically after report creation
  - admin eval analytics can now show real Layer One report history over time under a dedicated `layer_one_report` framework
- Layer One internal rewritten-artifact contract freeze:
  - the repo now has a frozen rule that any rewritten Layer One report should begin as a second internal artifact, not an immediate replacement for the deterministic paid report
  - the next implementation step should store and evaluate both versions before any customer-facing default is changed
- Report Design Phase A — design contracts frozen (RD-001 through RD-006 were docs only; RD-007 is the first tiny code-facing enabling slice):
  - team-owner taxonomy: all 22 checks mapped to Engineering / Content / Brand / Product (`PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`)
  - executive brief contract: CRO-facing opening section spec (`PLAYBOOK/rd-002-executive-brief-contract-v1.md`)
  - immediate wins format: ticket-style pre-filtered fast-start section spec (`PLAYBOOK/rd-006-immediate-wins-format-v1.md`)
  - section order contract: new body order and appendix split frozen (`PLAYBOOK/rd-005-section-order-contract-v1.md`)
  - "What AI-Ready Leaders Do Differently" contract: audit-derived best-practice framing spec (`PLAYBOOK/rd-004-ai-ready-leaders-contract-v1.md`)
  - Team Action Map (rd-010) is the only remaining Phase A section still pending
  - RD-007 (first code slice): standalone `TeamOwner` type + `TEAM_OWNER_MAP` + `getTeamOwner` helper in `workers/report/team-owner-map.ts`; no customer-facing behavior changed; 5/5 tests pass
  - no report output, PDF, or web UI changed yet; Phase B implements these contracts
- Layer One internal rewritten-artifact implementation:
  - deep-audit report generation can now optionally create a second internal rewritten markdown artifact after the deterministic markdown is built
  - the rewritten artifact is best-effort, separately stored, separately evaluated, and does not replace the paid report by default
- Layer One report internal comparison access:
  - admin eval analytics now link report rows to a report-detail page
  - that page groups sibling `report_eval_runs` by `scan_id` so deterministic and rewritten report variants can be compared side-by-side for one scan
- Layer One operator judgment seam:
  - the report-detail admin page now supports `better`, `worse`, or `unclear` judgments on the rewritten report variant
  - judgments are stored in `report_eval_runs.metadata` so repeated internal review can build an evidence base before any paid-report default changes
- Report Design Phase B enabling seam:
  - normalized report issue rows now carry `teamOwner` via the standalone RD-007 map
  - this is a data-shape propagation step only; no customer-facing report sections use owner grouping yet
- Report Design canonical payload propagation:
  - the canonical deep-audit report payload now preserves `teamOwner` on highlighted issues, all issues, and page-level issue rows
  - this still does not change customer-facing report structure; it only makes owner data available deeper in the report pipeline
- Report Design internal Immediate Wins seam:
  - the canonical deep-audit report payload now derives an internal-only `immediateWins` block from owner-aware issues
  - the markdown report now renders a first deterministic `Immediate Wins` section from that block
  - this is the first owner-aware customer-facing report section; broader report-order, PDF, and web-viewer redesign work is still pending
- Report Design per-page markdown cleanup:
  - passed checks in the per-page checklist no longer print `Fix:` lines
  - the per-page checklist now shows only non-passing rows
  - this reduces noisy, contradictory report copy without changing scoring, findings, or report order
- Report Design bounded low-confidence wording:
  - customer-facing report rendering now rewrites raw low-confidence transport tokens like `http_403` into bounded explanatory wording
  - the underlying audit data is unchanged; only customer-facing markdown/PDF phrasing was softened
- Report Design metadata-guidance cleanup:
  - broken title-length guidance like `1070` has been corrected at the audit-check source
  - customer-facing reports now inherit a readable `10-70` title range from the underlying check output

### Paid deep audit
- `scan_runs` / `scan_pages`
- multi-page crawl
- robots/sitemap discovery
- section-aware sampling
- chunked queue continuation
- coverage summary
- technical appendix
- markdown + PDF report artifacts
- R2-backed report delivery
- Stripe checkout email is the authoritative delivery address for paid reports

### Deep audit advanced work
- DA-004 complete as shipped scope:
  - crawl-delay handling
  - crawl metrics
  - chunk progress
  - continuation guardrails
  - queue-based continuation up to the 1000-page cap
- DA-005 complete as shipped scope:
  - optional Browser Rendering-backed SPA fallback for paid deep audits
  - disabled by default
  - not a full Cloudflare `/crawl` orchestration layer

### Admin / eval / retrieval foundation
- report eval runs table + admin UI
- site-centric eval analytics across report + retrieval runs
- Promptfoo run persistence into Supabase
- retrieval run writer into aggregate + prompt/passage/answer tables
- retrieval drilldown page from admin evals
- deterministic retrieval harness
- Promptfoo harness + suites
- RAGAS fit note with current no-go decision
- benchmark run-detail lineage inspection:
  - prompt -> response -> citations -> grounded evidence status on the existing admin detail page
- narrow benchmark cohort frames:
  - explicit stored cohort definition
  - read-only comparison panel on benchmark domain history
- multi-model benchmark lane support:
  - one provider boundary
  - multiple enabled live model ids via env allowlist
- benchmark schedule hardening:
  - bounded launches per sweep
  - early stop after repeated failures
  - structured failure visibility on the existing log path
- benchmark collection start path:
  - explicit CSV seed import helper for schedule-enabled benchmark domains
  - explicit frozen query-set seed fixture for the first `law_firms` lane
  - explicit schedule preview command before enabling the recurring lane
  - explicit one-shot scheduled-sweep command for proving the recurring lane immediately
  - explicit scheduled-window summary command for reviewing one frame from the terminal
  - explicit outlier-selection command for choosing the first manual review set
  - explicit run-diagnostic command for selected grounded outlier runs before manual lineage review
  - explicit multi-window recurrence command for freezing recurring winners/laggards from a small chosen window set
  - recurring schedule can now narrow by vertical and seed priority
  - twice-daily schedule windows are supported for slow internal collection lanes
  - first live-window interpretation is now frozen:
    - grounded citation-rate deltas are usable internal signal
    - exact-page quality is currently not a useful gating metric for this lane
    - current grounded runs are mostly producing domain-level attribution, not page-level provenance
  - two-window decision freeze is now explicit:
    - the first `law_firms` lane should currently be treated as a domain-level grounded attribution lane
    - comparable collection should continue without a provenance-matcher rewrite or scale-up
- benchmark operations decision freeze:
  - do not split into a separate benchmark service yet
  - 500 to 1000-site ops remain planned, not implemented
 - law-firms fit analysis freeze:
   - the first 21-domain `law_firms` lane is now explicitly understood as a mixed cohort, not one coherent law-firm frame
   - the current query set mixes multiple legal-service intents against firms with very different specialties
   - the broad lane remains useful for internal directional collection, but not yet as a precision methodology lane
 - law-firms replacement-target freeze:
   - the first narrow replacement lane should target `business_counsel / biglaw / enterprise`
   - the next query-set rewrite should serve that subgroup only
 - law-firms narrow query-set draft freeze:
   - the first replacement query-set draft now exists for the `business_counsel / biglaw / enterprise` subgroup
   - it is a frozen draft fixture only, not yet seeded or scheduled
 - law-firms narrow target-domain freeze:
   - the first replacement lane now has an explicit 17-domain target list under `law_firms_business_counsel_v1`
   - the broad 21-domain lane remains unchanged for comparability
 - law-firms narrow seed path freeze:
   - the first replacement query-set draft now has an explicit seed command
   - this still does not make the narrow lane live until scheduling is configured separately
   - the seeded draft query-set record now exists:
     `9910b5ac-ade6-42be-9dca-9b85c04e4469`
 - law-firms narrow preview path:
   - the scheduler can now narrow by explicit canonical-domain allowlist
   - this enables previewing the frozen 17-domain business-counsel cohort without disturbing the live broad lane
 - first live narrow law-firms lane:
   - `law-firms-business-counsel-v1` completed its first 17-domain window cleanly
   - the narrower frame produced cleaner grounded-vs-ungrounded signal than the broad mixed lane
   - exact-page quality still remained non-gating
 - primary law-firms benchmark lens:
   - after three comparable windows, `law-firms-business-counsel-v1` is now the primary internal law-firms benchmark frame
   - the original broad `law-firms-p1-v1` lane is now a secondary legacy comparison frame
 - narrow-lane recurrence review:
   - the repo now includes a small terminal-only recurrence helper for explicit multi-window review on the current schedule frame
   - this is intended for evidence review across a few comparable windows, not a new benchmark subsystem
 - schedule run-now override:
   - the scheduler now supports `--window-date YYYY-MM-DDTHH` for controlled internal creation of the next benchmark window without waiting for cron time to advance

### Marketing attribution
- event ingestion
- UTM/session capture
- attribution views
- weekly email reporting

### Content machine foundation
- canonical content inventory tables:
  - `public.content_items`
  - `public.content_distribution_deliveries`
- downstream provider registry:
  - `public.content_distribution_destinations`
- service-role-only storage for:
  - content ids
  - briefs and drafts
  - target persona / topic / CTA metadata
  - downstream newsletter or syndication delivery records
- server-side admin helper:
  - `lib/server/content-admin-data.ts`
- server-side destination helper:
  - `lib/server/content-destination-admin-data.ts`
- minimal admin inventory UI:
  - `/dashboard/content`
- provider-control panel inside `/dashboard/content`:
  - explicit enabled / disabled state
  - paid-plan requirement visibility
  - API/scheduling/archive capability visibility
  - operator-facing availability reason
- local draft import inside `/dashboard/content`:
  - reads `PLAYBOOK/content-machine-drafts`
  - groups brief / article / newsletter assets by slug
  - derives stable `content_id` values
  - upserts idempotently into canonical content storage
- first content detail/editor page:
  - `/dashboard/content/[contentId]`
  - basic metadata editing
  - brief/draft markdown editing
  - delivery visibility per content item
- first destination adapter seam:
  - provider adapter contract
  - Kit and Ghost implementations
  - draft push from `/dashboard/content/[contentId]`
  - downstream delivery record persisted after push
  - computed destination readiness from both feature flags and live environment state
  - structured push events written into the admin logs stream for operator debugging
- first public blog runtime:
  - `/blog`
  - `/blog/[slug]`
  - published-article read path backed by canonical `content_items`
  - markdown-rendered article body with the free-scan CTA on-page
  - top-level site header link to the blog
- first admin-to-blog publish path:
  - dedicated publish action on `/dashboard/content/[contentId]`
  - publish blockers shown before release
  - article-only canonical route derived as `/blog/[slug]`
  - save-path guardrails now prevent invalid `status = published` updates
- first article metadata + schema path:
  - author name / role / URL editing on `/dashboard/content/[contentId]`
  - author metadata stored in `content_items.metadata`
  - author byline shown on `/blog/[slug]`
  - first `Article` JSON-LD emitted on published article pages
- first blog navigation + clustering path:
  - `/blog` now exposes a topic menu and article menu
  - published articles are grouped by topic cluster on the blog index
  - `/blog/[slug]` now links to related articles and a browse-articles menu
- first topic landing-page path:
  - `/blog/topic/[topic]` lists all published articles for one topic cluster
  - topic labels on `/blog` and `/blog/[slug]` now link to a dedicated cluster URL
- first topic-page intro path:
  - each topic page now opens with a definition block
  - each topic page now explains why the topic matters
  - each topic page now gives one practical takeaway before the article list
- first editable topic-page copy path:
  - `/dashboard/content` can seed one topic-page record per article topic cluster
  - topic-page intro copy now lives in canonical content records instead of code-only defaults
  - `/dashboard/content/[contentId]` can edit seeded topic-page copy through metadata-backed fields
- first article internal-link path:
  - `/blog/[slug]` now opens with an in-body topic-cluster link block
  - the article body now points readers into the topic page and sibling articles before the main markdown body
- first launch-readiness guardrails:
  - `/blog/topic/[topic]` now emits topic-page structured data
  - `/dashboard/content/[contentId]` now shows a lightweight editorial-readiness checklist for articles
  - article publish now fails when required editorial-readiness checks are incomplete
- first launch-readiness dashboard:
  - `/dashboard/content/launch` summarizes whether the current content set meets the first-launch threshold
  - the view shows article-level failures so launch prep is operational, not guesswork
- dashboard admin navigation now links to the content inventory

### Generalized distribution engine foundation
- generalized schema foundation for:
  - `distribution_accounts`
  - `distribution_account_tokens`
  - `distribution_assets`
  - `distribution_asset_media`
  - `distribution_jobs`
  - `distribution_job_attempts`
- typed server-side repository helpers for accounts, tokens, assets, media, jobs, and attempts
- admin summary data helper for the generalized distribution model
- first admin route at `/dashboard/distribution`
- feature-flagged writable controls for:
  - account create/update
  - token save / connection-state update
  - asset seeding
  - job creation
- feature-flagged manual dispatch trigger for due jobs
- bounded dispatch runtime:
  - loads dispatchable jobs
  - records job attempts
  - updates final status and provider metadata
  - reuses the current content-destination adapter seam for supported content/newsletter providers
- explicit rollout flags:
  - `DISTRIBUTION_ENGINE_UI_ENABLED`
  - `DISTRIBUTION_ENGINE_WRITE_ENABLED`
  - `DISTRIBUTION_ENGINE_BACKGROUND_ENABLED`
  - `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT`
- first social adapter scaffolds:
  - `x`
  - `linkedin`
  - both now have first text-first publish runtime wiring via env credentials
- first background cron dispatch:
  - the Worker scheduled runtime can enqueue due jobs into `DISTRIBUTION_QUEUE`
  - one sweep is capped by `DISTRIBUTION_ENGINE_DISPATCH_BATCH_LIMIT`
  - a dedicated queue consumer now executes one queued job at a time with provider-aware retry decisions plus DLQ terminal marking
  - the background lane stays dark unless the dedicated runtime flag is enabled
- current limitation:
  - only `content_item` sourced assets flow through the current runtime
  - retry policy is now provider-aware at the permanent-vs-retryable level, but not yet tuned with provider-specific backoff windows
  - token storage/admin connection state now also powers first runtime token use for `x` and `linkedin`, while newsletter adapters remain env-credential based
  - OAuth/connect is now shipped for first social providers with first X token refresh handling, but broader multi-provider refresh coverage, media pipelines, and broader social/video adapters are still unshipped

## Current Blockers

These still block launch closure:
- `P4-003` SPF / DKIM / DMARC operator setup
- `P4-006` launch security sign-off
- `P4-004` WAF remains operationally unresolved (`deferred / mitigated` in repo)

Current domain truth:
- the new production domain is now `getgeopulse.com`
- repo production config now points at `https://getgeopulse.com/`
- buying the domain removes the old purchase blocker, but launch is still waiting on DNS/email/WAF/operator evidence

## Most Important Truths

- The product is materially real, not a stub.
- The results/report UX now reflects real payment/report state instead of optimistic query-string messaging.
- The share/report action layer now better matches reality: share snapshot is a real action, and delivered-report copy no longer overpromises direct access.
- Launch readiness is still gated by operational security closure, not by missing core product code.
- The broader distribution engine is no longer planning-only: the repo now contains its schema foundation, repository seam, feature-flagged admin shell, writable controls, a bounded manual dispatch path, and a feature-flagged queue-backed background runtime with retry/DLQ handling, but not the final hardened orchestration model.
- Deep-audit core scale plumbing is implemented; remaining launch risk is operational/security closure, not DA-004 core code.
- Retrieval analytics are implemented for deterministic and Promptfoo-backed runs, but RAGAS runtime remains intentionally unshipped.
- The first live `law_firms` benchmark lane is operationally real, but its current frame is over-mixed: many domain/query pairs are low-fit by design because the cohort mixes enterprise firms, immigration, divorce, PI, and employment specialists under one broad query set.
- The first replacement benchmark lane should not try to fix "all law firms" at once. The next precision slice is now explicitly anchored on the `business_counsel / biglaw / enterprise` subgroup.
- The first replacement query-set draft is now frozen as a methodology artifact. It narrows the frame to enterprise/business-law buying intent, but it is not live until the exact target cohort is frozen too.
- The first replacement cohort is now frozen too: 17 business-counsel-oriented domains from the current priority-1 lane. The next live experiment should be launched as a separate narrow frame, not by mutating the current broad lane.
- The first narrow live law-firms experiment now validates the methodology direction: narrowing the cohort/query frame improved signal quality even though page-level provenance behavior did not change yet.
- The law-firms benchmark strategy is now clearer: the narrow business-counsel lane is the main internal lens, and the broad lane should no longer drive methodology decisions by itself.
- Layer One report quality improvement should start at the rewrite layer, not retrieval. The first frozen step is now the report contract: confirmed findings, bounded implications, priority actions, optional advanced GEO ideas, and open questions should be separated instead of blended.
- Layer One report quality now also has a frozen evidence boundary: rewritten reports should not invent market data, hard-diagnose weak signals, or present optional GEO strategy as confirmed audit fact.
- Layer One report quality also now has a frozen tone boundary: future rewrites should open with the site and findings, use plain operational language, and cut inflated industry framing.
- Layer One report quality also now has a frozen action boundary: priority recommendations should be compact, concrete, and mechanically consistent instead of mixing strategy prose with implementation steps.
- Layer One report quality also now has a frozen ambiguity boundary: future rewrites should describe uncertain findings with observed signal, bounded implication, and verification step instead of jumping to root cause.
- The first implementation step for report hardening is now in repo too: a reusable Layer One rewrite-prompt builder exists for existing markdown reports, while customer-facing report generation remains deterministic.
- Deep-audit report viewing no longer depends on the browser fetching the raw markdown file URL directly. The results/report UI now uses a same-origin markdown proxy route, which also provides a stable markdown download path for delivered reports.
