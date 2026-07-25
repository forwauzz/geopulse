# Geo Intelligence Control Room

Issue: INT-008 / GitHub #219

## Decision

The intelligence control room lives inside the existing GEO-Pulse admin frontend at `/admin/intelligence`. It uses the existing platform-admin authorization, service-role server context, dashboard visual language, and Cloudflare deployment. There is no second frontend, subdomain, or microservice.

Routes:

- `/admin/intelligence`
- `/admin/intelligence/domains`
- `/admin/intelligence/lanes`
- `/admin/intelligence/windows`
- `/admin/intelligence/evidence`
- `/admin/intelligence/quality`
- `/admin/intelligence/patterns`

## Application boundary

Server pages call `createIntelligenceAdminData` in `lib/intelligence`. Components never query database tables and never receive a Supabase client. Route tests enforce both boundaries.

The contract uses the service-role client only after `loadAdminPageContext` confirms the current user is a database-backed platform admin. Missing intelligence tables return a founder-readable `migration_pending` state. Pages fail closed and never fall back to tenant data, competitor evidence, raw artifact content, or public queries.

## Information order

The overview presents:

1. latest indexed collection activity and source kinds
2. window completeness and ineligible count
3. open quality alerts
4. evidence and classification coverage
5. measurable intervention count
6. domain/run history

This ordering keeps freshness, completeness, and quality ahead of headline metrics.

## Drilldown

The supported path is:

`lane -> window -> canonical run -> source observation/citation parse -> evidence metadata`

Links carry stable IDs only. The evidence page displays kind, class, source, artifact status, privacy, hashes, timestamps, and parser/extractor versions. It intentionally does not select or render inline raw content, artifact URLs, or tenant ownership IDs.

Synthetic schedule windows that do not yet have canonical window IDs remain visible but are labeled; they do not fabricate a run drilldown.

## Safety

- All routes inherit the platform-admin layout and also load the admin page context directly.
- No action files, forms, cleanup buttons, quarantine controls, release controls, or delete controls are included.
- Patterns are read-only and labeled as observational association, not causation.
- Incompatible or unavailable comparisons are visually explicit.
- Raw tenant/private evidence is not rendered.
- The operator glossary defines lane, eligibility, `not_available`, and intervention delta, with methodology and lineage links.

## Verification

Unit and source-contract tests cover migration-pending behavior, admin/context routing, component/table separation, evidence-field minimization, read-only surfaces, and causal-safe labels. Per the implementation directive, no browser test is required for this release.
