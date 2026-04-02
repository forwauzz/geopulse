# Cloudflare Workflows Deploy Guard Plan

## Purpose

Fix the current deployment reliability gap where config drift (example: Turnstile hostname/key mismatch) reaches production before detection.

This plan adds Cloudflare-native deployment guards so GEO-Pulse catches config and functional regressions before client traffic does.

## Problem statement

Recent production behavior showed landing-page scan failures caused by Turnstile widget/domain mismatch (`110200` client-side errors).  
Current deploy flow does not enforce:
- pre-deploy config integrity checks
- post-deploy synthetic canary checks
- automatic stop/alert when critical checks fail

Result: issues can pass build/test but fail in live runtime.

## Scope

In scope:
- Cloudflare Workflows orchestration for deploy gates
- config integrity checks (env vars/secrets/required bindings)
- post-deploy canary checks for critical user paths
- structured logging + alert hooks

Out of scope (for this slice):
- full automated rollback implementation
- non-critical product analytics checks
- broad load/performance benchmarking

## Phase plan

### Phase A - Pre-deploy guard workflow

Build a workflow step that validates deployment prerequisites before promoting a release.

Checks:
- required public vars present and non-placeholder (including `NEXT_PUBLIC_TURNSTILE_SITE_KEY`)
- required secrets present (including `TURNSTILE_SECRET_KEY`)
- required bindings present (`SCAN_QUEUE`, `REPORT_FILES`, `SCAN_CACHE`)
- feature-flag combinations valid (distribution flags, benchmark flags)

Fail behavior:
- mark workflow failed
- emit structured error event
- do not proceed to deploy step

### Phase B - Post-deploy canary workflow

After deploy, run a short synthetic flow against production host:
- landing page reachable
- Turnstile widget loads without immediate client-side config failure
- `/api/scan` flow can reach server path with valid verification token in controlled test mode
- queue/report path sanity check (enqueue + consumer health indicators)

Fail behavior:
- mark workflow failed
- create incident log entry and send alert

### Phase C - Operational alerts and runbook hardening

Add operator visibility and response tooling:
- alert destinations (email/Slack/webhook)
- consistent incident payload schema
- triage checklist for common failure classes:
  - Turnstile domain/key mismatch
  - missing secret
  - queue binding drift
  - post-deploy canary regression

## Initial implementation checklist

1. Create workflow definition under `workers/` for deploy-guard orchestration.
2. Add guard functions:
- `validateRuntimeConfig()`
- `runPostDeployCanary()`
- `emitDeployGuardAlert()`
3. Wire workflow trigger from deploy pipeline (manual + CI trigger path).
4. Add structured logs for each step with release id and environment tag.
5. Add docs update in deploy runbook with operator commands and failure triage path.

## Acceptance criteria

A release is considered protected when:
1. A missing/mismatched Turnstile config fails before release promotion.
2. A missing required secret fails before release promotion.
3. A broken landing-page scan canary fails within minutes after deploy and alerts operators.
4. Workflow outputs include a clear pass/fail report per step.

## Owner and priority

- Owner: Platform / backend
- Priority: P0 (deployment safety)
- Target: implement Phase A first, then Phase B in same rollout window if feasible

