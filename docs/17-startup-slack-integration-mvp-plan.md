# Startup Slack Integration MVP Plan

Last updated: 2026-04-04

## Goal

Deliver a minimal Slack integration so startup teams can send audit/report updates to the right Slack workspace and channel without complex workflow setup.

## Scope (MVP only)

- connect one or more Slack workspaces to one startup workspace
- save one or more channel destinations
- manually send report/audit updates to a chosen destination
- optionally auto-post report updates on scheduled deep-audit cadence when `slack_auto_post=true`
- log delivery status (`sent` / `failed`) for operator visibility

Not in MVP:
- complex routing rules
- workflow builder
- automatic posting enabled by default
- advanced Slack-only paid features

## Progress

- `SL-001` complete: contract freeze
- `SL-002` complete: Slack service keys + startup rollout flags
- `SL-003` complete: minimal Slack schema foundation
- `SL-004` complete: Slack OAuth connect/disconnect foundation
- `SL-005` complete: destination UI and destination save flow
- `SL-006` complete: manual send action from report/audit context
- `SL-007` complete: normalized Slack message formatter wired to manual send
- `SL-008` complete: delivery events persist queued/sent/failed + failure reasons
- `SL-009` complete: workspace `slack_auto_post` toggle (default off)
- `SL-010` complete: centralized Slack service controls wired in `/dashboard/services`
- `SL-011` complete: focused Slack tests and edge-case hardening
- `SL-012` complete: Alie pilot rollout runbook + evidence checklist (`docs/18-startup-slack-pilot-rollout-runbook.md`)
- `SL-013` complete: cron scheduler auto-enqueues due startup deep audits for Slack-enabled workspaces
- `SL-014` complete: report queue consumer auto-posts `new_audit_ready` Slack messages after report completion when gates allow

## SL-001 Contract (first slice complete)

### Events to support

1. `new_audit_ready`
2. `plan_ready`

### Message payload contract

Each Slack send builds one normalized payload:

- `startup_workspace_id`
- `destination_id`
- `event_type` (`new_audit_ready` | `plan_ready`)
- `site_domain`
- `score` (nullable)
- `score_delta` (nullable)
- `summary_bullets` (0 to 3)
- `report_url` (dashboard/results deep link)
- `markdown_url` (nullable)
- `sent_by_user_id`

### Message format (simple)

1. header: event + site
2. score block: score and delta when present
3. up to 3 bullets
4. links:
- open in GEO-Pulse
- view markdown (only when available and entitled)

### Gating rules

Slack send is allowed only when all are true:

1. startup rollout flag allows Slack (`slack_agent` for manual sends)
2. service entitlements allow Slack for the bundle/workspace:
- `slack_integration`
- `slack_notifications`
3. destination exists for that startup workspace

`markdown_url` is included only when `markdown_audit_export` is enabled.

### Default operator posture

- manual send only
- `slack_auto_post` default `false`
- email delivery remains default path for non-technical teams

## Byte-sized implementation plan

1. `SL-002`: add service keys + rollout flags for Slack
2. `SL-003`: add minimal Slack tables (installations, destinations, delivery events)
3. `SL-004`: implement Slack OAuth connect/disconnect
4. `SL-005`: add simple destination UI in startup dashboard
5. `SL-006`: add manual "Send to Slack" action on startup report/audit surface
6. `SL-007`: implement normalized Slack message formatter from SL-001 contract
7. `SL-008`: persist delivery attempts and statuses
8. `SL-009`: optional `slack_auto_post` toggle (off by default)
9. `SL-010`: wire Slack keys into centralized `/dashboard/services` controls
10. `SL-011`: add focused tests for gates, formatter, and delivery logging
11. `SL-012`: run Alie pilot rollout and capture evidence (operator runbook now in repo)
12. `SL-013`: add cron scheduler to find due `slack_auto_post` workspaces and enqueue deep-audit jobs
13. `SL-014`: auto-send Slack delivery from report completion path for eligible startup workspaces

## Verification posture for `SL-013` + `SL-014`

- Add backend-focused tests for scheduling logic and gating/eligibility behavior.
- Keep E2E browser scope unchanged for this slice because no new browser interaction path was introduced.
- Current targeted proof:
  - `lib/server/startup-slack-schedule.test.ts`
  - `npx vitest run lib/server/startup-slack-schedule.test.ts`
  - `npx tsc --noEmit`

## Acceptance criteria for MVP release

1. Founder can connect Slack and save at least one destination.
2. Founder can manually send one audit update to selected channel.
3. Delivery status is visible in app for last attempt.
4. Slack behavior respects centralized service gates and rollout flags.
5. Email-first path remains unaffected for non-Slack users.
