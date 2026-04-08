# Agency Pilot Plan - Lifter

Last updated: 2026-04-01

## Goal

Enable a first agency pilot for `lifter.ca` where an agency team can:
- sign in with email + password
- manage multiple client sites from one dashboard
- run deep audits for as many pilot clients as allowed
- see per-client audit history
- use GEO-Pulse for both client domains and the agency's own domain
- receive pilot entitlements from an internal admin control plane instead of public billing rules

This pilot should also strengthen the long-term benchmark platform rather than bypass it.

This is a pilot-control plan first, not a generic enterprise platform build.

## Current truth

The repo already has:
- auth via Supabase login
- a user dashboard
- scans and report history linked to one user
- paid deep-audit checkout via Stripe
- admin-only pages inside `/dashboard/*`
- some existing admin-controlled feature-flag patterns in the content area

The repo does not yet have:
- agency or workspace tenancy
- client accounts under an agency
- agency-user roles
- email + password account provisioning flow
- feature entitlements for audit/product surfaces
- model-policy overrides by account or client
- pilot billing exemptions for deep audit
- an admin control page for account-level flags

## Product direction

The first implementation target is not "all agencies."

The first implementation target is:
- one internal pilot agency: `lifter.ca`
- one admin-controlled agency workspace
- one small set of invited users
- one dashboard that can switch between multiple client domains
- one entitlement/control plane that lets GEO-Pulse turn features on or off without code edits

That means the system should be shaped as a multi-tenant control model now, even if only one agency uses it first.

It also means the system should be shaped as a benchmark-aware data model now, even if only one pilot agency uses it first.

## Pilot requirements

### Agency access
- agency users can sign in with email + password
- agency users belong to one agency workspace
- agency users can see only their own agency data
- GEO-Pulse admin can invite or provision the first `lifter.ca` users manually

### Client management
- one agency can manage many client records
- each client can have one or more tracked domains
- audits, reports, and history should roll up under the client, not only under the raw user
- the agency itself should also be representable as a client record for `lifter.ca`

### Audit operations
- agency users can launch audits without going through public checkout when the pilot exemption is enabled
- audit history should be filterable by client/domain
- the same dashboard should support repeat audits over time

### Entitlements and feature flags
- GEO-Pulse admin needs one account-control surface
- that surface should control:
  - whether the agency pilot is enabled
  - whether deep audit is allowed
  - whether payment is required
  - which UI modules are visible
  - which audit/report features are enabled
  - which model policy applies by default
- flags should be account-shaped, not hard-coded to one email

### Model policy
- GEO-Pulse admin should be able to choose which model lane an agency or client uses
- this must support future overrides such as:
  - `gemini`
  - `gpt-5.5`
  - `claude-4.6`
- the product should store:
  - requested model policy
  - effective model used
  - override scope (`global`, `agency`, `client`)

## Benchmark alignment requirements

This pilot must align with the benchmark vision.

Agency usage should not create a parallel product silo that is useless for the benchmark layer later.

The first pilot should instead help GEO-Pulse build structured, reusable vertical data from real usage.

For `lifter`, that means:
- the first likely agency-linked vertical is `medical_clinics`
- client records should support ICP / vertical tagging from the start
- audit and report lineage should preserve enough metadata to segment later by:
  - agency
  - client
  - domain
  - vertical
  - subvertical
  - model policy
  - entitlement state
  - run source

Benchmark-safe rule:
- agency data may inform future benchmark lanes
- but benchmark claims should only be made from explicitly segmented and methodologically comparable slices
- do not treat all agency audits as benchmark-grade evidence by default

## Recommended control model

Use a small account hierarchy:

1. `agency_accounts`
- one row for `lifter`
- holds plan state, pilot status, billing mode, and default model policy

2. `agency_users`
- maps auth users into an agency
- holds role such as `owner`, `manager`, `member`

3. `agency_clients`
- one row per client managed by the agency
- supports `lifter.ca` itself as one client

4. `agency_client_domains`
- one or more domains per client

5. `agency_feature_flags`
- explicit account-level and optionally client-level flags

6. `agency_model_policies`
- default model family / exact model id
- optional override at client scope

7. benchmark-aware metadata on agency and client records
- vertical
- subvertical
- ICP tag or service concentration
- operator notes about cohort fit when useful

Do not encode this pilot through:
- one-off email allowlists
- special cases in Stripe checkout only
- dashboard branching based on a single platform-admin allowlist

Do not encode this pilot in a way that loses future benchmark lineage:
- no generic untyped client rows
- no hidden model overrides
- no audit path that bypasses account / client attribution

## Recommended UI direction

### Agency dashboard v1
- account switcher context: current agency
- client switcher: choose client or agency-self
- client overview cards:
  - tracked domains
  - latest audit
  - audit count
  - last audit date
- audit history table scoped to selected client
- action to run a new audit for a chosen client domain

### Admin control page v1
- new internal admin page for agency pilot controls
- first live record: `lifter`

Minimum controls:
- agency enabled
- audit enabled
- payment required
- dashboard modules enabled
- default model policy
- client-specific overrides

## Billing direction for the pilot

For `lifter` pilot, billing should be entitlement-driven, not public-checkout-driven.

Recommended v1:
- add a `payment_required` flag at agency scope
- when false, eligible agency/client audits bypass Stripe checkout and queue the deep audit directly
- keep the current Stripe path intact for public self-serve users

Do not remove the existing paid path.
Add a second allowed path for entitled agency accounts.

## Benchmark-safe data rules

Every agency-triggered audit should preserve:
- `agency_account_id`
- `agency_client_id`
- tracked domain identity
- vertical / subvertical context when known
- requested model policy
- effective model
- run source such as:
  - `public_self_serve`
  - `agency_dashboard`
  - `internal_benchmark`
  - `admin_manual`

This is important because later benchmark analysis may need to answer questions like:
- how do `medical_clinics` perform over time?
- does one model lane behave differently for agency-managed clinic sites?
- do repeated audit/report outcomes show stable vertical patterns?

The agency system should therefore be compatible with future cohort-building, not hostile to it.

## Iteration order

### AP-001 - Freeze the account model
- define the agency, client, domain, user, flag, and model-policy tables
- define row ownership and visibility rules
- define how existing `scans` and `reports` relate to agency/client scope
- define benchmark-aware metadata requirements for agency/client/domain lineage
- make `medical_clinics` the first explicit vertical example for the `lifter` pilot

Current repo state:
- implemented in `supabase/migrations/019_agency_pilot_foundation.sql`
- the schema now exists, but no admin UI or product workflow writes to it yet

### AP-002 - Add the first agency control plane
- create admin data helpers for agency accounts, users, clients, flags, and policies
- add a minimal admin page to create and edit the first `lifter` agency record

Current repo state:
- implemented minimally at `/dashboard/agencies`
- the current surface supports:
  - creating agency accounts
  - adding clients
  - setting feature flags
  - setting model policies
- it does not yet support:
  - user invitation or membership assignment
  - richer editing flows
  - audit launching from agency context

### AP-003 - Add agency membership and password login
- support invited agency users with email + password
- keep existing magic-link auth available if needed, but do not block pilot on it
- gate agency pages by agency membership, not by admin email

Current repo state:
- implemented minimally
- `/dashboard/agencies` can now provision an agency user by email, password, and role
- `/login` now supports both password sign-in and magic-link sign-in
- what is still missing from this slice:
  - richer invite / reset-password flow
  - agency-member-specific dashboard routing
  - agency product pages gated by agency membership

### AP-004 - Add client-scoped dashboard history
- show client list, client domains, and audit/report history
- make the selected client the operating context for audits

Current repo state:
- implemented minimally on `/dashboard`
- agency members can now switch agency account and client context
- agency-linked scans and reports already written with agency lineage can now be viewed by that context
- agency members can now create clients and add tracked domains directly from the agency dashboard
- what is still missing from this slice:
  - richer client/domain editing flows
  - archive/delete controls
  - stronger write-path defaults beyond the current selected agency context

### AP-005 - Add pilot audit bypass
- if the selected agency/client has `payment_required = false`, allow deep audit queueing without Stripe checkout
- preserve public paid flow for everyone else

Current repo state:
- implemented minimally
- agency-context scans can now be launched with agency lineage from the home-page scan flow
- eligible agency scan results now route through a zero-dollar internal bypass path instead of Stripe when `payment_required = false`
- the bypass reuses the existing deep-audit queue/report path so report status still updates through the current results flow
- what is still missing from this slice:
  - more explicit agency-specific checkout/status messaging across every screen
  - stronger audit-launch controls directly from the agency dashboard
  - deeper entitlement gating beyond the current payment bypass seam

### AP-006 - Add model-policy overrides
- add effective model resolution in one place
- support default by agency and override by client
- record requested and effective model in audit metadata

Current repo state:
- implemented minimally for Gemini-backed runtime paths
- agency/client policy now resolves in one shared server seam for:
  - `free_scan`
  - `deep_audit`
- requested model policy and effective model are now stamped into scan metadata
- deep-audit queue setup now stores the resolved model policy in `scan_runs.config`
- current limitation:
  - stored `openai`, `anthropic`, or other unsupported providers do not execute yet
  - they currently fall back to the runtime Gemini default while preserving requested-policy lineage

### AP-007 - Add module-level UI flags
- hide or show product surfaces based on entitlements
- start with:
  - audit dashboard
  - report history
  - benchmark / GEO tracker views
  - future client reporting modules

Current repo state:
- implemented minimally for the first agency surfaces
- a shared entitlement resolver now supports account-level and client-level overrides for:
  - `agency_dashboard_enabled`
  - `scan_launch_enabled`
  - `report_history_enabled`
  - `deep_audit_enabled`
  - `geo_tracker_enabled`
- current enforcement:
  - `/dashboard` hides or locks agency modules based on those entitlements
  - agency-context scan launch is blocked when `scan_launch_enabled` is false
  - agency deep-audit CTA and checkout path are blocked when `deep_audit_enabled` is false
- current limitation:
  - there is not yet a dedicated agency GEO tracker surface to gate beyond the live entitlement state
  - broader agency self-service settings remain admin-only for now

## What "Lifter can use this today" should mean

The first usable pilot does not need every enterprise feature.

It needs this minimum bar:
- one `lifter` agency account exists
- one or more `lifter` users can sign in with password
- `lifter` can create/select a client
- `lifter` can run a deep audit for that client without paying
- `lifter` can see past audits by client
- GEO-Pulse admin can change the effective model policy and feature entitlements without code edits

And it should already produce structured pilot data that can later support:
- vertical-specific cohort analysis
- model-lane comparison
- agency-linked benchmark segmentation

## Non-goals for the first pilot

Do not combine these into the first `lifter` slice:
- self-serve agency signup
- usage-based billing
- complex seat management
- agency-to-agency benchmarking
- external client login portals
- full RBAC matrix
- custom white-labeling

Also avoid this mistake:
- building an agency dashboard that stores usage in a way that cannot later be segmented into clean benchmark cohorts

## Immediate next engineering order

When this work becomes active, the first build order should be:
1. schema + admin control model
2. agency membership + password login
3. client-scoped dashboard
4. pilot audit bypass
5. model-policy override
6. module-level feature flags

That order is intentionally shaped around `lifter` being able to use the product quickly while preserving a clean control-plane foundation.
