# Startup Dashboard + Entitlements v1

Last updated: 2026-04-04

## Purpose

Freeze the product/architecture principles for a startup-founder path that shares one backend model with agency workflows.

This playbook is strategy + constraints.
Execution tasks are tracked in `docs/15-startup-dashboard-entitlements-plan.md`.

## Strategic Position

GEO-Pulse should support:
- agency operators who manage multiple clients
- startup founders/teams who want to ship improvements without hiring a full marketing team

Both paths must run on one centralized control plane.

## Non-negotiable Architecture Rules

1. One entitlement source of truth.
- All UI/API/job gating must resolve through one server-side entitlement resolver.

2. One service catalog.
- Every capability is modeled as a service key.
- Bundle membership is data, not route logic.

3. One tenancy model.
- Startup and agency are workspace types over shared primitives.
- No forked backend domain model.

4. Pricing as configuration.
- Services must support `free` now and `paid` later without code refactor.

5. Feature-flagged rollout.
- New startup and automation surfaces must stay behind explicit runtime flags.

## Startup Dashboard Product Rules

1. Shared dual-mode visual system (light + dark) from semantic theme tokens, with user-toggle persistence.
2. No vanity widgets.
3. Every graph must map to an action list.
4. Core views:
- site trend over time
- issue burn-down
- recommendation lifecycle status
- PR/merge outcomes
- impact windows (7/14/30 day)

## Agent Execution Rules

1. Markdown audit -> implementation plan -> approval -> PR -> validation.
2. Default execution mode is suggest/PR, not direct merge.
3. Recommendation states must be explicit and auditable.
4. PR lifecycle must sync back into the recommendation timeline.

## GitHub Integration Rules

1. Use GitHub App, not OAuth App, for repo automation.
2. Use repo allowlists and minimum permissions.
3. Never push directly to protected branches.
4. Preserve full audit logs for agent actions.

## Model Routing Rules

Model selection must support deterministic scope precedence:
1. global default
2. service default
3. bundle override
4. workspace override

Each service can also define:
- fallback model
- max budget per run
- allowed provider set

## Billing/Bundling Rules

1. Bundles toggle services on/off with optional limits.
2. Stripe mapping is linked to bundles/add-ons, not embedded in feature code.
3. Skills remain free initially but must already be represented in the paid-capable model.

## Implementation Entry Point

Current next step is pilot rollout execution from:
- `docs/15-startup-dashboard-entitlements-plan.md`

Centralized entitlement foundation, Stripe billing mapping, shared UI gate adapters, startup timeline observability, and rollout guardrails are now in repo; continue with operator-led pilot rollout execution.
