# Startup Slack Pilot Rollout Runbook (Alie)

Last updated: 2026-04-04

## Purpose

Run the first real startup Slack pilot in a controlled way for `Alie`, capture evidence, and keep rollback simple.

## Preconditions

1. Startup workspace exists and founder can access `/dashboard/startup`.
2. `/dashboard/services` has startup bundle/service posture set for Slack:
- `slack_integration` enabled for the target startup bundle/workspace.
- `slack_notifications` enabled for the target startup bundle/workspace.
3. Startup rollout flags allow Slack:
- `slack_agent=true` for manual sends.
- `slack_auto_post=false` for initial pilot safety (phase A).
4. Slack app credentials are configured in runtime:
- `STARTUP_SLACK_CLIENT_ID`
- `STARTUP_SLACK_CLIENT_SECRET`
- `STARTUP_SLACK_APP_INSTALL_URL`

## Pilot Steps

1. Connect Slack workspace
- In `/dashboard/startup`, use Slack connect.
- Confirm one active installation is visible in the Slack card.

2. Save destination channel
- Add one destination with:
  - installation
  - `channel_id`
  - optional `channel_name`
  - set default destination (optional)
- Confirm destination appears as active in the destination list.

3. Send audit update manually
- In report/audit send module, choose:
  - report
  - destination
  - event type `new_audit_ready`
- Send and confirm success status in UI.

4. Send plan update manually
- Repeat with event type `plan_ready`.
- Confirm success status in UI.

5. Verify delivery log entries
- In Slack card delivery history, verify latest attempts show `sent`.
- Confirm failed rows (if any) include clear failure reason text.

6. Keep autopost disabled for pilot
- Leave `slack_auto_post=false` through first pilot cycle.
- Change only after explicit operator sign-off.

7. Optional autopost validation (phase B)
- Enable `slack_auto_post=true` for one pilot workspace only after phase A evidence is complete.
- Wait for the scheduled cadence window or run the scheduler path through controlled operator execution.
- Confirm a new deep audit is enqueued and completed.
- Confirm one `new_audit_ready` auto-post message is delivered to the configured default active destination.
- Confirm delivery events include a row sourced from autopost (`source=auto_post` in payload metadata).

## Evidence Capture Checklist

Collect this for `Alie`:

1. Slack installation evidence
- Screenshot of connected workspace row in `/dashboard/startup`.

2. Destination evidence
- Screenshot of destination list with at least one active destination.

3. Send success evidence
- Screenshot of `new_audit_ready` manual send success state.
- Screenshot of `plan_ready` manual send success state.

4. Delivery-status evidence
- Screenshot of delivery event list showing `sent` rows.
- If a failure occurred, capture row with `error_message`.

5. Autopost evidence (phase B only)
- Screenshot or logs showing scheduled deep-audit enqueue for the workspace.
- Screenshot of Slack channel showing auto-posted audit message.
- Screenshot or SQL output showing delivery event written for the auto-post send.

6. Structured log evidence (optional but recommended)
- Record at least one `startup_slack_manual_send_succeeded` log row.
- Record at least one `startup_slack_manual_send_failed` log row if a failure test is run.
- Record `startup_slack_schedule_enqueued` and `startup_slack_auto_post_succeeded` rows for phase B.

## SQL Verification Snippets (optional)

Use Supabase SQL editor for direct verification:

```sql
select
  startup_workspace_id,
  event_type,
  delivery_status,
  destination_id,
  created_at,
  error_message
from public.startup_slack_delivery_events
where startup_workspace_id = '<startup_workspace_id>'
order by created_at desc
limit 20;
```

```sql
select
  created_at,
  event_type,
  metadata
from public.app_logs
where event_type in (
  'startup_slack_manual_send_succeeded',
  'startup_slack_manual_send_failed',
  'startup_slack_schedule_enqueued',
  'startup_slack_auto_post_succeeded',
  'startup_slack_auto_post_failed'
)
order by created_at desc
limit 20;
```

## Rollback

If issues occur:

1. Set `slack_agent=false` for workspace (disables manual send entry point).
2. Optionally disconnect Slack installation from startup dashboard.
3. Keep email/report delivery paths unchanged (Slack is additive only).
4. Re-check centralized service toggles in `/dashboard/services` before retry.

## Exit Criteria

Pilot is considered complete when all are true:

1. One startup workspace (`Alie`) has connected Slack and one active destination.
2. One `new_audit_ready` and one `plan_ready` manual send are successful.
3. Delivery history confirms `sent` statuses for those sends.
4. Evidence artifacts are captured and linked in operator notes.
5. If phase B is executed, one scheduled auto-post cycle is verified end to end.
