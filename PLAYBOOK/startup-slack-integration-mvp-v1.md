# Startup Slack Integration MVP v1

Last updated: 2026-04-04

## Intent

Ship one narrow Slack path for startup teams:
- connect Slack
- pick channel destination
- send report updates manually
- optionally auto-send report updates on schedule for explicitly enabled workspaces

## Product defaults

- email remains default delivery mode
- Slack is opt-in per startup workspace
- auto-post is disabled by default

## Service-control alignment

Slack rollout must stay centralized:
- service keys control entitlement posture
- startup rollout flags control per-workspace exposure
- channel destinations are workspace-scoped records

## Simplicity rules

1. No workflow builder in MVP.
2. No complex per-event routing matrix in MVP.
3. Do not block email flows if Slack is disconnected.
4. Keep UI to one setup card + one destination list + one send action.

## Rollout posture

Pilot with one workspace (`Alie`) first:
1. connect one Slack workspace
2. add one destination channel
3. send manual updates for real reports
4. review delivery logs
5. only then consider `slack_auto_post`
6. if `slack_auto_post` is enabled, keep rollout to one workspace first and verify scheduler + delivery logs before broader enablement
