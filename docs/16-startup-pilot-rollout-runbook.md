# Startup Pilot Rollout Runbook

Last updated: 2026-04-04

## Purpose

Execute startup beta rollout safely using per-workspace flags:
- `startup_dashboard`
- `github_agent`
- `auto_pr`

Default safe mode is:
- `startup_dashboard=true`
- `github_agent=true`
- `auto_pr=false` (suggest-only)

## Preconditions

1. Startup workspace exists in `/dashboard/startups`.
2. Startup member(s) assigned and able to access `/dashboard/startup`.
3. Service controls configured in `/dashboard/services`:
   - `github_integration`
   - `agent_pr_execution`
4. If paid mode is required, Stripe mapping rows exist and are active in `service_billing_mappings`.
5. Startup timeline events visible in `/dashboard/startups`.

## Rollout Phases

1. Dashboard-only phase
- Set flags:
  - `startup_dashboard=true`
  - `github_agent=false`
  - `auto_pr=false`
- Validate:
  - startup dashboard loads
  - GitHub module shows rollout-disabled state
  - timeline records startup dashboard activity/events

2. GitHub connect phase
- Set flags:
  - `startup_dashboard=true`
  - `github_agent=true`
  - `auto_pr=false`
- Validate:
  - GitHub connect/disconnect path works
  - allowlist save works
  - timeline records install session/create/connect/allowlist events

3. Suggest-only PR phase
- Keep:
  - `auto_pr=false`
- Validate:
  - PR queue action returns suggest-only status (`pr_suggest_only`)
  - recommendation approval flow remains usable
  - no PR runs are queued while suggest-only is active

4. Auto-PR phase (after sign-off)
- Set flags:
  - `startup_dashboard=true`
  - `github_agent=true`
  - `auto_pr=true`
- Validate:
  - approved recommendation can queue PR run
  - PR run status transitions (`queued` -> `pr_opened` -> `merged` or `failed`)
  - recommendation lifecycle sync behavior is correct
  - timeline records PR workflow and model-policy events

## Rollback

If issues appear:
1. Disable `auto_pr` first.
2. Disable `github_agent` if needed.
3. Keep `startup_dashboard` enabled unless full pilot pause is required.
4. Use `/dashboard/startups` timeline to identify latest failure reason and actor context.

## Pilot Evidence Checklist

1. Screenshot or event log sample of each rollout phase.
2. At least one startup timeline trail showing:
- rollout flag update event
- GitHub lifecycle event
- recommendation/PR/model-policy event
3. Final operator decision:
- continue pilot
- pause and rollback
- widen to second workspace
