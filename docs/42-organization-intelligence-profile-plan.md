# Organization Intelligence Profile and Verified Market Context Plan

Status: approved product and architecture plan; implementation has not started.

Date: 2026-08-01

## Decision

GEO-Pulse will use one shared Organization Intelligence Profile model for agencies, agency-managed clients, and direct small-business customers. Each organization can have one or more verified Market Contexts. Every prompt set, competitor cohort, measurement, recommendation, report, and future artifact must be created from an immutable version of that context.

The product label is **Business Profile**. Internally, the service contract is **Organization Context**. A Market Context is the bounded description of what business, buyer, geography, and language GEO-Pulse is measuring.

This is not a per-client agent, a per-client skill, a new CRM, a graph database, a vector database, or a standalone intelligence service. It extends the existing monolith and intelligence identity plane.

## Problem

The current agency-client creation flow accepts a name, website, and optional industry, then starts provisioning immediately. It does not establish a confirmed target market. Automated discovery can return a similarly named company in another country, and discovered context can override weak or missing saved context. A report can then be internally consistent with the wrong entity while being completely invalid for the actual client.

The SanoMed incident is the regression case:

- intended organization: a private clinic in Pointe-Claire, Quebec, serving the West Island and Greater Montreal;
- incorrect resolved organization: a similarly named UK occupational-health company;
- consequence: UK prompts, UK citations and competitors, an invalid zero score, and a client-facing artifact that should never have been generated.

Location as a free-text field alone does not solve this. GEO-Pulse must distinguish the official business identity, physical locations, customer service area, target measurement market, language, business scope, and tenant-authorized competitor cohort.

## Outcomes

The implementation must produce these outcomes:

1. A user normally enters only a business name and website.
2. GEO-Pulse inspects the exact website and proposes an identity and market summary.
3. The user confirms or edits the summary before the first paid measurement.
4. High-confidence automation reduces typing; ambiguity causes a focused question rather than a guess.
5. User-confirmed facts outrank model suggestions.
6. A cross-country, cross-category, domain, or context-version conflict fails closed.
7. One organization can support multiple markets without mixing measurements.
8. Agencies and direct businesses use the same profile and capability contracts.
9. Routine detection, retry, validation, monitoring, and report gating run without founder involvement.
10. Future chat, APIs, and artifact generation can wrap the same contracts without accessing raw database tables.

## Principles

### One truth, several views

Identity, markets, evidence, and context versions have one authoritative service. Onboarding, measurement, reporting, content, and future chat consume projections of that service rather than storing independent interpretations.

### Exact website before name search

The official URL is inspected first. Search by business name is enrichment, never the identity anchor. Similar names do not imply the same organization.

### Confirm the market, not every extracted fact

The user confirms one plain-language summary. They should not complete a long geography form unless evidence is missing or the business is genuinely complex.

### Deterministic first, models second

Redirects, canonical tags, structured data, address, telephone, email domain, language, and country signals are parsed deterministically. A model interprets services, audience, or service area only after the exact website evidence is available.

### Suggestions cannot silently become truth

AI and search may propose changes. They cannot overwrite a confirmed canonical domain, country, market scope, category, or competitor cohort.

### Fail closed at the customer boundary

Missing evidence may permit a draft profile, but it cannot produce a client-facing measurement or report. Provider failure, identity conflict, and missing measurements are not zero scores.

### Additive architecture

Operational tables remain authoritative during rollout. The existing intelligence identity, evidence, quality, quarantine, reasoning, and ownership layers are extended rather than replaced.

### Extract only after a second consumer exists

Reusable contracts live in the current monolith. They become a separately published package or service only when a second deployed runtime requires them.

## Domain model

### Organization identity

The stable public-facing identity anchored by an exact canonical domain:

- official name;
- canonical domain;
- approved aliases, redirects, and rebrands;
- category and services;
- physical locations;
- public contact and language signals;
- evidence IDs, confidence, review state, and timestamps.

The existing `intelligence_domains`, `intelligence_domain_aliases`, `intelligence_domain_owners`, `intelligence_pages`, and `intelligence_source_identity_maps` remain the identity foundation.

In the initial implementation, one primary canonical domain is the organization anchor. A future parent/brand graph is out of scope until a real customer requires multiple independently operated brands. Approved redirects and aliases handle the current need.

### Ownership and relationships

An organization can be associated with:

- an agency account;
- an agency-managed client;
- a direct startup/small-business workspace;
- an internal benchmark;
- an authorized user.

The same canonical public identity can be referenced by more than one authorized owner without sharing tenant-private data. For example, Lifter may manage SanoMed; if SanoMed later subscribes directly, the public domain identity is reused while each tenant's private notes, settings, reports, and conversations remain isolated.

### Market Context

A Market Context answers: **what buyer, for what service, in what market and language, are we measuring?**

Version 1 fields:

- organization/domain identity ID;
- owner/tenant scope;
- business category and selected services;
- buyer/audience;
- market scope: `local`, `regional`, `national`, `global`, or `online`;
- ISO country code;
- ISO subdivision/region code when applicable;
- city/locality when applicable;
- human-readable service areas;
- language tags such as `en-CA` and `fr-CA`;
- timezone for scheduling and report labels;
- approved competitor domains;
- status: `draft`, `detected`, `confirmed`, `conflicted`, `superseded`, or `retired`;
- evidence references and detection confidence;
- confirmation actor and timestamp;
- immutable context version and content hash.

Country, region, language, and scope are structured fields. Human-readable labels remain available for prompts and reports but are not the join or validation key.

### Profile versus Market Context

The Organization Intelligence Profile describes the business. A Market Context describes one measurement scope for one authorized owner.

Examples:

- SanoMed organization profile: private medical clinic with an approved domain and services.
- SanoMed West Island context: local, Pointe-Claire/West Island, Quebec, Canada, English and French.
- SanoMed Quebec context: regional, Quebec, Canada, English and French.

The first release supports one active primary market. The model permits additional markets, but the UI exposes **Add another market** only after the first market is confirmed.

### Context snapshot

Every query set, run group, score, recommendation, report, and generated artifact stores:

- organization identity ID;
- Market Context ID and version;
- canonical domain;
- prompt/query-set version;
- competitor-cohort version;
- policy and generator versions;
- evidence and compatible run IDs.

Historical outputs are never rewritten when the profile changes. A changed material field creates a new context version and requires a fresh baseline.

## Trust and precedence policy

Facts resolve in this order:

1. currently confirmed tenant choice;
2. evidence from the exact official website;
3. structured website data and verified redirects/aliases;
4. trusted public geographic or business evidence;
5. grounded search or model suggestions;
6. heuristic defaults.

A lower-ranked source can propose a correction but cannot silently override a higher-ranked source.

Material conflicts include:

- country disagreement;
- canonical-domain or approved-alias disagreement;
- incompatible business category or buyer;
- location outside the confirmed service market;
- name collision without supporting domain/address evidence;
- competitor outside the market for a local or regional context;
- run or report context version different from the active version.

Material conflicts set the context to `conflicted`, pause new measurement and delivery, create an owned operational item, and present a focused correction to the authorized agency/customer user.

## Onboarding behaviour

### Step 1: enter the business

Required fields:

- client/business name;
- primary website URL.

Industry remains optional. Location is not initially required as free text.

### Step 2: inspect and resolve

The shared resolver:

1. normalizes and safely fetches the entered URL;
2. follows and records redirects without silently merging unrelated domains;
3. reads the canonical URL, page title, organization schema, address schema, contact pages, public telephone/email domain, service pages, language, and country signals;
4. creates or maps the canonical intelligence identity;
5. derives category, services, buyer, physical location, service area, market scope, language, and timezone;
6. uses grounded search only after the exact-domain evidence has been assembled;
7. returns a proposed Market Context with evidence and confidence.

### Step 3: confirm the summary

The user sees a compact confirmation card, for example:

> SanoMed Solutions<br>
> Private medical clinic<br>
> Pointe-Claire, Quebec, Canada<br>
> Tracking West Island and Greater Montreal<br>
> English and French

Actions:

- **Confirm and start**;
- **Edit**;
- **This is not the right business**.

If evidence is incomplete, ask only the missing question, such as: **Where do this client's customers search for these services?**

### Step 4: competitor proposal

Suggest three to five direct competitors that pass category, buyer, and market-overlap checks. Show the domain and a short evidence-backed reason. The user may accept, remove, or add a competitor before confirmation.

The cohort remains stable for trend measurement. Domains later observed in AI answers are labelled **Other brands cited** until they pass validation and are deliberately added to a new cohort version.

### Step 5: baseline

Only a `confirmed` context can provision prompts and launch paid measurement. The baseline is idempotent and stamped with the context version.

## Value-first activation and familiar navigation

GEO-Pulse will not use a traditional feature tour as the primary onboarding experience. The onboarding journey itself must produce the first useful business insight. Users should not need to understand benchmarks, query sets, citations, run groups, model IDs, or the internal platform structure before receiving value.

The product explains itself through five customer questions:

1. Can AI find and recommend my business?
2. What are potential customers asking?
3. Who appears instead of me?
4. What should I improve first?
5. Is my visibility improving over time?

Agency users receive one additional outcome: **What can I confidently show my client?**

### Intent selection

At the beginning of self-service onboarding, ask one outcome-oriented question:

> What do you want GEO-Pulse to help you do?

- Improve my business's visibility.
- Monitor and report for clients.

This changes the journey and language without creating separate products or duplicating the underlying profile, measurement, and report systems.

### Set the value expectation

Before asking for a website, explain the exchange in plain language:

> Enter your website. GEO-Pulse will identify your business and market, check the questions customers ask AI, show which competitors appear, and recommend your first action.

The website field is therefore the start of a useful analysis, not an administrative setup task.

### Meaningful progress

Processing states describe customer value rather than implementation detail:

- Understanding your business;
- Identifying customer questions;
- Finding relevant competitors;
- Checking AI recommendations;
- Preparing your first action.

Do not expose messages such as `creating query set`, `running provider`, or internal model identifiers on the primary journey.

### First-value reveal

After the baseline, do not send the user directly to a dense dashboard. Present one concise result containing:

- what was measured and where;
- the number of buyer questions and completed answer-engine measurements;
- whether and where the organization appeared;
- the leading approved competitor;
- one evidence-backed opportunity;
- one recommended first action.

The primary actions are limited to:

- **See the buyer questions**;
- **Review the first action**;
- **View the full baseline**; or
- for agencies, **Preview the client report**.

A low result is framed truthfully as a measured starting point and opportunity, not as failure or manufactured positivity. Denominators, unavailable providers, and limitations remain visible.

### Continuing guidance

The default home experience always answers: **What is the most valuable thing I should do next?** It presents one primary action, not a competing wall of widgets.

Customer-facing navigation uses familiar outcome language:

- Overview;
- What AI says;
- Buyer questions;
- Competitors;
- What to improve;
- Reports.

Contextual help appears beside the decision it explains, using prompts such as **Why we need this**, **How this was calculated**, **Why this competitor qualifies**, **What happens next**, and **Client will see this**. Optional help expands in place; it does not force a click-by-click tour.

### Activation definition

Account creation is not activation. A direct-business user is activated only after they have:

- confirmed the business and market;
- viewed a real baseline;
- understood one missed opportunity;
- seen or accepted one recommended action.

An agency user must additionally preview a client-shareable artifact. These events become the onboarding scoreboard and recovery triggers.

The governing UX principle is:

> Do not teach users the platform. Use the platform to teach users something valuable about their business.

## Geographic policy

### Local business

Prompts and competitors use the confirmed city, nearby service area, region, country, and language. Competitors need an overlapping service area. A country mismatch is an automatic rejection.

### Regional or national business

Prompts use the selected region or country. Competitors may be headquartered elsewhere only when they demonstrably serve the same market and buyer.

### Global or online business

City is not required. Country and language remain selectable audience contexts because answers can vary by language and market. Global status must be explicit; it is not inferred merely because a site accepts online inquiries.

### Multi-location business

One organization holds several Market Contexts. Each has separate prompts, competitors, measurements, and trends. A later portfolio report may aggregate compatible contexts, but individual market results remain visible and cannot be blended without labelling.

### Bilingual and multilingual markets

Language is part of the context version. Prompt sets are generated and measured by language. A bilingual report can combine compatible language lanes while retaining the per-language breakdown.

## Competitor policy

A tracked competitor must satisfy:

1. compatible core service/category;
2. compatible buyer/customer need;
3. overlapping geography for local/regional contexts;
4. a valid official domain;
5. current public evidence;
6. no self-domain, alias, directory, publisher, or agency/developer relationship.

The report distinguishes:

- **Tracked competitors**: the approved, versioned cohort;
- **Other brands cited**: organizations observed in answer evidence but not approved competitors;
- **Sources cited**: publishers, directories, government, and informational sources.

Answer citations never silently mutate the tracked cohort.

## Eligibility and fail-closed gates

### Before prompt generation

- context is `confirmed`;
- canonical domain and market are present;
- category is specific enough to create truthful buyer questions;
- context hash matches the active version.

### Before competitor discovery

- exact website identity is resolved;
- geography and market scope are known;
- search prompt contains the canonical domain, structured market, services, and buyer;
- returned candidates pass deterministic validation after model parsing.

### Before measurement

- query-set context version equals the active context;
- competitor-cohort version equals the active context;
- spend and provider gates pass;
- there is no unresolved identity or configuration conflict.

### Before report generation or delivery

- every included run has the same compatible identity and context version;
- the measured domain is the canonical domain or an approved alias;
- prompt geography and language match the context;
- failed or unavailable providers are omitted, never scored as zero;
- tracked competitors come from the approved cohort;
- artifact settings and brand scope resolve correctly;
- report provenance contains compatible evidence and run IDs;
- delivery authorization and suppression rules pass.

Any failure quarantines the candidate artifact and creates an actionable reason. It does not generate a customer-visible fallback report.

## Monitoring and founder-independent operations

There is one shared, event-driven profile monitor, not one permanent agent per organization.

Triggers:

- organization creation;
- domain or market edit;
- material redirect or canonical change;
- scheduled lightweight revalidation;
- new evidence conflicting with confirmed context;
- failed identity, competitor, measurement, or report gate.

Routine behaviour:

- retry transient network/provider failures with bounded backoff;
- preserve the last confirmed context while gathering new evidence;
- automatically accept non-material observations that do not change measurement meaning;
- propose material changes to the authorized agency/customer user;
- pause only the affected context, not unrelated clients or markets;
- record owner, next action, due time, retry count, evidence, and closure state;
- close only with a confirmed context or a documented rejection/quarantine outcome.

Founder involvement is not required for ordinary profile confirmation, retries, domain corrections, competitor edits, market additions, baseline recovery, or report regeneration. Escalate to the founder only for product direction, pricing, material spend, new credentials/providers, privacy/legal policy, unsupported public claims, or destructive/irreversible actions.

Operational ownership uses existing roles:

- Noah owns onboarding completion and user-facing confirmation recovery.
- Priya owns measurement/report integrity and client-facing artifact closure.
- Marcus owns runtime, provider, scheduler, and deployment defects.
- Maya owns stale-loop accountability and confirms that customer/revenue work remains the active constraint.
- Codex diagnoses and closes safe repairs through tests, review, deploy, and production evidence.

## Reusable service and package boundaries

Keep implementation inside the existing monolith under `lib/intelligence` and `lib/server`.

Logical modules:

- `organization-context-contract`: versioned Zod types and portable JSON Schema;
- `organization-context-repository`: authorized reads/writes over identity, ownership, markets, and evidence;
- `organization-context-resolver`: deterministic extraction plus optional model/search adapter;
- `market-policy`: normalization, scope, language, locality, and competitor-overlap rules;
- `context-eligibility`: pure fail-closed gates and reason codes;
- `organization-capabilities`: narrow operations used by UI, agents, reports, and future APIs;
- existing report and artifact builders remain the rendering authority.

Consumer code receives stable domain objects, not raw Supabase rows. Provider adapters remain replaceable. No separate NPM package, microservice, or SDK is created until a second deployed runtime proves that extraction is useful.

Initial capability surface:

- `detectOrganizationContext`;
- `confirmOrganizationContext`;
- `getOrganizationProfile`;
- `listOrganizationMarkets`;
- `proposeCompetitors`;
- `validateMeasurementContext`;
- `getCompatibleEvidence`;
- `explainVisibilityChange`;
- `generateClientArtifact`;
- `getArtifactPreview`.

Externally mutating capabilities such as sharing or delivery remain separate, permissioned commands and are not implied by read or generation access.

## Future chat, API, and artifacts

Chat is a replaceable interface over the capability layer, not a new source of truth.

A future chat adapter can support requests such as:

- explain what changed for an organization or market;
- compare compatible competitors or periods;
- retrieve supporting evidence;
- create a report, presentation, scorecard, action plan, content brief, or client email;
- preview and, when separately authorized, share an artifact.

Chat rules:

- default to one selected organization and market;
- require explicit authorized scope for portfolio comparisons;
- cite evidence and measurement periods;
- return `insufficient_evidence` instead of guessing;
- treat conversationally discovered facts as proposals;
- never let chat history silently edit the profile;
- keep generation separate from external sharing;
- audit generated and shared artifacts.

No chat SDK, Agents SDK, general-purpose assistant, vector database, or new frontend is part of the current implementation. The existing structured/keyword retrieval remains the baseline because semantic retrieval has not passed the production gate. A future `/api/v1` or SDK wraps the same Zod/JSON Schema contracts after external demand exists.

## Privacy, tenancy, and reuse

Public business identity and public website evidence may be indexed once and reused through canonical domain identity. Tenant-private information remains scoped to its exact owner.

Never reuse across tenants without authorization:

- private notes or conversations;
- reports and campaign decisions;
- private performance or customer data;
- uploaded documents;
- non-public contact information;
- tenant-specific competitor choices and report settings.

All public/shared/private classifications preserve provenance. Customer-facing APIs project data through ownership links rather than exposing the canonical intelligence store.

## Delivery plan

### OIP-0 — Contain and reconcile the SanoMed incident

Outcome: no invalid SanoMed artifact can be treated as current or delivered.

Acceptance:

- quarantine every UK-context SanoMed run/report without rewriting history;
- confirm the exact Canadian domain identity and approved aliases;
- create and confirm the Pointe-Claire/West Island Market Context;
- validate the Quebec competitor cohort;
- generate a new query-set/context version;
- complete a fresh baseline;
- generate one held preview and independently verify identity, geography, competitors, counts, evidence, branding, and tone;
- keep delivery disabled until the normal artifact approval contract is satisfied.

### OIP-1 — Organization Context contract and source-of-truth projection

Outcome: one typed contract represents agency, client, and direct-business context.

Acceptance:

- define versioned Zod and JSON Schema contracts;
- project existing canonical identity, aliases, ownership, geography, and evidence;
- define structured market and language fields;
- define precedence, confidence, conflict, and material-change reason codes;
- do not replace operational tables or break existing foreign keys;
- unit-test agency, agency-client, direct-business, and internal benchmark scopes.

### OIP-2 — Resolver and geographic policy

Outcome: exact-domain evidence produces an explainable proposed profile.

Acceptance:

- deterministic extraction runs before model/search enrichment;
- exact-domain evidence is included in any model request;
- returned context and competitors are validated after parsing;
- name collision, redirect, bilingual, multi-location, national, global, and online cases have fixtures;
- country/category conflicts return `needs_review` or `conflicted`, never an assumed match;
- all outputs include evidence IDs, confidence, limitations, resolver version, and timestamp.

### OIP-3 — Onboarding confirmation experience

Outcome: users confirm a simple business-and-market summary before measurement.

Acceptance:

- retain name and website as the initial required inputs;
- show detected identity, category, location, service market, scope, and languages;
- ask only for missing or ambiguous information;
- allow confirm, edit, and wrong-business actions;
- show proposed competitors with reasons;
- ask whether the user is improving their own business or managing clients, then adapt the language and primary action without creating a separate data flow;
- show meaningful value-oriented processing states rather than internal job terminology;
- deliver the concise first-value reveal before the full dashboard;
- preserve one clear next-best action throughout onboarding and the default home experience;
- use outcome-oriented navigation and contextual explanations rather than a mandatory feature tour;
- record the activation events defined in this plan;
- no paid measurement or customer-facing report starts from an unconfirmed context;
- retry and resume are idempotent and do not duplicate clients or baselines.

### OIP-4 — Context-versioned prompts, competitors, and measurement

Outcome: downstream work can only use the active confirmed context.

Acceptance:

- prompt and cohort versions derive from the context hash;
- one active primary market is supported end-to-end;
- geography and language affect prompt construction explicitly;
- tracked competitors remain separate from other cited brands and sources;
- edits create a new version and fresh baseline requirement;
- incompatible historical runs cannot enter the current score or report.

### OIP-5 — Report and artifact integrity gate

Outcome: no customer-visible artifact can cross identity, market, version, provider-status, or tenant boundaries.

Acceptance:

- report assembly accepts only compatible run groups;
- combined and per-engine totals use one measurement scope and explain their denominator;
- configuration mismatch, provider failure, or missing evidence blocks delivery;
- reports display business, market, language, period, prompts, engines, and competitor scope;
- artifact provenance records context, query-set, cohort, generator, settings, and evidence versions;
- quarantine is append-only and repair creates a new artifact.

### OIP-6 — Existing-client backfill and monitoring

Outcome: current customers transition safely without founder-led manual auditing.

Acceptance:

- preview all existing organization/client records without writes;
- classify each as ready to confirm, ambiguous, conflicted, or unmapped;
- apply only with an explicit migration confirmation flag;
- preserve existing reports as historical and block only incompatible future delivery;
- assign every unresolved item an owner, retry policy, next action, due time, and evidence;
- monitor material changes and avoid repeated unchanged audits.

### OIP-7 — API-ready capabilities and evaluation

Outcome: UI, reports, agents, and future chat/API adapters use the same bounded services.

Acceptance:

- expose stable internal capability functions with authorization and audit context;
- do not expose raw database rows;
- keep read, generation, and external-delivery permissions separate;
- add golden and adversarial evaluations for evidence, tenancy, context compatibility, and unsupported claims;
- document how a future chat or `/api/v1` adapter wraps the contracts;
- do not build the external API or chat interface in this phase.

### OIP-8 — Future chat and artifact interface, deferred

Start only when users demonstrate repeated demand for conversational analysis or artifact generation and OIP-0 through OIP-7 are stable.

Entry criteria:

- profile and context gates are reliable in production;
- organization/market authorization is proven;
- artifact generation and preview are reusable outside chat;
- evidence-backed answers pass the evaluation suite;
- the selected interface SDK provides a material benefit over the existing UI;
- the work is tied to activation, retention, expansion, or revenue evidence.

## Migration and rollout

1. Add contracts and pure eligibility rules with no production writes.
2. Run the resolver in shadow mode against SanoMed and representative existing profiles.
3. Add additive storage only after the shadow output and schema are reviewed.
4. Backfill preview existing identities and markets; inspect collisions and unmapped records.
5. Apply confirmed profiles in a bounded cohort with delivery held.
6. Gate new onboarding behind confirmed context.
7. Gate report generation and delivery.
8. Transition existing clients cohort by cohort.
9. Enable monitoring after alert ownership and retry closure are proven.

Rollback disables new context enforcement for affected internal workflows while retaining context and quarantine history. Rollback must never re-enable delivery of an artifact already proven incompatible.

## Local-first development and release policy

Local verification is the primary implementation feedback loop. GitHub CI is the independent release gate, not the place where ordinary development iteration occurs.

Co-founder coordination follows the repository-root `AGENTS.md`. Active ownership, status, next action, and cross-agent handoffs live in the assigned GitHub issue and PR rather than in additional plan or handoff files. Claude reads the small `CLAUDE.md` entrypoint, which points to the same contract. This keeps durable decisions in this plan while preventing duplicated work queues and growing session diaries.

For each bounded issue:

1. reproduce the defect or define the acceptance fixture locally;
2. implement the smallest coherent change on an isolated branch;
3. run focused unit and integration tests during iteration;
4. run the relevant database/migration preview without production writes;
5. run the complete affected test suites, type-check, build, and browser smoke locally;
6. inspect the first-value onboarding journey and held report/artifact locally with realistic fixtures;
7. review the diff for unrelated files, secrets, generated noise, and migration safety;
8. commit and push one locally green candidate;
9. let GitHub CI run once as independent confirmation;
10. merge only after required checks pass;
11. deploy the merged revision to Cloudflare;
12. run a short production smoke using a safe canary or held artifact and record fresh evidence.

CI must not be skipped, but active continuous polling is unnecessary. The implementation operator can yield while CI runs and resume from a later check or notification. A failed check returns the issue to local reproduction and repair; do not repeatedly patch through CI. Unrelated long-running optional checks do not block unless repository branch protection or the change's risk contract makes them required.

Cloudflare deployment happens only from a reviewed, merged, CI-green revision. Before deployment, verify environment-variable parity because a Wrangler deploy may replace dashboard plaintext variables with the checked-in configuration. Database migrations remain additive, previewed first, and separately confirmed before apply. A successful deploy is not closure until the customer-critical production smoke passes.

This policy reduces wasted CI cycles, provider calls, and operator/token time while preserving independent verification and production safety.

## Verification matrix

Required test scenarios:

- same business name in Canada and the UK;
- `.ca` redirecting to an approved `.com` canonical domain;
- unrelated `.co.uk` lookalike;
- bilingual Montreal local business;
- US business with the same name as a Canadian business;
- European business with regional and multilingual markets;
- multi-location clinic;
- national service headquartered in another region;
- global/online-only software company;
- franchise and parent-brand ambiguity;
- missing structured address;
- changed redirect or rebrand;
- wrong-country competitor;
- directory/publisher mistaken for a competitor;
- provider failure versus true zero citation;
- market edit after a completed baseline;
- stale run attached to a new context;
- cross-tenant profile and evidence access;
- artifact generation allowed while sharing is denied;
- monitor retries and evidence-based closure.

Verification sequence for customer-critical changes:

`fixture/reproduction -> pure tests -> repository tests -> integration tests -> type-check/build -> browser onboarding smoke -> held artifact inspection -> production canary -> fresh production evidence`

## Measures

Hard controls:

- 100% of new paid baselines have a confirmed context version;
- 100% of delivered reports contain one compatible context version;
- 100% of tracked competitors come from the approved cohort version;
- 100% of private evidence retrieval passes exact tenant authorization;
- zero known identity-conflict artifacts are delivered.

Operational measures to establish during shadow rollout:

- automatic detection coverage;
- percentage requiring user correction;
- identity and geographic conflict rate;
- time from client creation to confirmed baseline;
- competitor acceptance/edit rate;
- baseline retry and failure rate;
- report quarantine rate and reason;
- support intervention rate;
- cost per successfully confirmed and measured profile.

Do not set expansion targets until shadow data establishes the baseline. Optimize first for false-match prevention and useful first value, then reduce confirmation friction.

## Explicit non-goals

- no permanent agent per organization;
- no general CRM or customer-data platform;
- no organization knowledge graph beyond proven domain/alias/ownership needs;
- no vector database or production semantic retrieval without a new passing experiment;
- no chat SDK or general-purpose assistant in the current scope;
- no automatic external publishing or sharing from a conversational request;
- no silent learning or autonomous policy mutation;
- no unreviewed cross-tenant data reuse;
- no multi-market aggregate score until a customer requires it and the methodology is defined;
- no new microservice or externally published package without a second runtime consumer;
- no attempt to infer every possible location, subsidiary, brand, or competitor on day one.

## Definition of done

The plan is implemented when:

1. SanoMed has a verified Canadian profile and fresh compatible held report with no UK contamination.
2. A new agency or direct-business user can add a company, confirm the detected business and market, approve competitors, and receive a correctly scoped baseline without founder assistance.
3. Local, national, global, bilingual, and multi-location cases follow explicit policies.
4. Every downstream artifact is bound to one organization and Market Context version.
5. Identity, geography, provider, evidence, or tenant conflicts stop customer-facing delivery with an actionable owner and retry path.
6. Existing customers are classified and migrated without rewriting historical evidence.
7. UI, agents, reports, and future adapters can call the same stable capabilities.
8. No chat interface, per-client agent, vector system, or new service has been added without demonstrated demand.

## Immediate sequencing decision

Implementation must begin with OIP-0 and OIP-1, then OIP-4/OIP-5 fail-closed compatibility gates before broad onboarding automation. The onboarding experience follows once the source-of-truth contract and safety gates exist. This prevents a polished form from continuing to feed unsafe downstream behaviour.

No founder decision is currently required to execute OIP-0 through OIP-7 within existing product direction, spend caps, providers, privacy rules, and delivery approvals. Founder approval remains required for material pricing, spend, privacy/legal, new provider credentials, or external-delivery policy changes.
