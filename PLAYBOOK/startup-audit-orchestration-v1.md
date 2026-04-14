# Startup Audit Orchestration v1

Last updated: 2026-04-14

## Intent

Extend the existing startup workspace system so one startup audit can become a durable execution run:
- audit received
- repo-aware planning
- multi-model review passes
- approval-gated PR execution
- manual follow-up tracking
- longitudinal improvement history

This is an extension of the startup dashboard, recommendation lifecycle, implementation-plan, PR workflow, Slack delivery, and benchmark-history systems already in repo. It is not a parallel backend.

## Product defaults

- startup workspace remains the system of record
- Slack remains additive:
  - trigger surface
  - notification surface
  - not the source of truth
- planning is allowed before approval
- code execution is not allowed before approval
- `auto_pr` stays suggest-only by default

## Architecture rules

1. Reuse the existing lineage spine:
   - `startup_workspace`
   - `scan`
   - `report`
   - `startup_recommendation`
   - `startup_implementation_plan`
   - `startup_agent_pr_run`
2. Add one parent audit-execution record instead of inventing a parallel orchestration datastore.
3. The orchestrator reads markdown and repo context, but does not write implementation code.
4. Execution workers implement only approved `auto` tasks.
5. Manual/operator-required tasks must be first-class records in the app, not buried in PR descriptions.
6. Model routing must be role-based and centrally configurable from admin service/model policy controls.
7. Every orchestration step must stamp effective provider/model metadata into persisted history.

## Multimodel posture

The orchestration flow must support different models by role, resolved through centralized service/model policy:

- `startup_audit_orchestrator`
- `startup_audit_repo_review`
- `startup_audit_db_review`
- `startup_audit_risk_review`
- `startup_audit_execution`
- `startup_audit_pr_summary`

Changing the planner/reviewer/executor model must be possible from admin without code changes.

## Milestones

### M1. Audit Execution Foundation
User should be able to test:
- a startup audit creates one execution record
- execution history is visible in the app
- execution status changes persist correctly

### M2. Execution Timeline in Startup UI
User should be able to test:
- latest audit shows linked execution
- execution detail is visible without checking the database

### M3. Rich Plan Task Model
User should be able to test:
- one generated plan contains byte-sized tasks
- manual steps are distinct from auto tasks

### M4. Orchestrator Planning Contract
User should be able to test:
- invalid planner output is rejected
- saved plans always include summary, task graph, risks, and manual actions

### M5. Multimodel Service Keys
User should be able to test:
- changing model policy in admin changes future orchestration runs
- execution history shows which model handled each role

### M6. Repo Review Pass
User should be able to test:
- plan references likely touched areas/modules
- markdown-only recommendations become repo-aware tasks

### M7. DB Review + Risk Review Passes
User should be able to test:
- a change that needs migration is flagged before PR execution
- risky changes surface manual/operator work

### M8. Planning Workflow
User should be able to test:
- one audit results in one complete `plan_ready` execution
- step failures are visible and retryable

### M9. Slack Trigger Integration
User should be able to test:
- scheduled or Slack-origin audit creates one execution
- duplicate Slack sends do not create duplicate executions

### M10. Manual Approval Gate
User should be able to test:
- plans are reviewable in-app
- approval is required before PR execution starts
- founder/admin approval controls are visible in the audits tab for `plan_ready` executions

### M11. Execution Worker Contract
User should be able to test:
- one approved task group creates one bounded PR run payload
- manual tasks are excluded from auto-execution

### M12. PR Run Integration
User should be able to test:
- PR open/merge/fail updates execution and task state in app
- PR runs can be linked to a startup audit execution and a bounded plan-task group instead of recommendation rows only

### M13. Manual Action Tracking
User should be able to test:
- the app shows exactly what still needs a human
- execution can wait on and resume from manual completion

### M14. Startup Dashboard Orchestration UI
User should be able to test:
- current execution, task lanes, blockers, and model provenance are visible in the dashboard

### M15. Improvement History
User should be able to test:
- see which audits turned into plans, PRs, validated fixes, and manual blockers

### M16. Benchmark Feed Readiness
User should be able to test:
- execution outcomes can be summarized by workspace and outcome category

### M17. Execution Worker Launch Path
User should be able to test:
- founder/admin can queue the next approved execution task batch from the startup dashboard
- only auto-capable tasks are included in the PR run
- queued, merged, failed, and cancelled PR states sync back into linked execution-task rows

### M18. Scheduled Execution Dispatch
User should be able to test:
- worker cron can auto-queue the next approved execution task batch
- only workspaces with startup dashboard + GitHub agent + auto-PR enabled are considered
- ambiguous repo selection or existing active PR runs cause safe skip behavior instead of duplicate dispatch

## Byte-sized task registry

| Task ID | Description | Owner | Status |
|---|---|---|---|
| SAO-001 | Freeze startup audit orchestration v1 scope, defaults, and architecture rules in playbook + project memory | Orchestrator | DONE |
| SAO-002 | Add `startup_audit_executions` + `startup_audit_execution_events` schema with startup-member RLS | Backend + Database | DONE |
| SAO-003 | Add typed execution contracts + server helpers + transition validation | Backend | DONE |
| SAO-004 | Surface execution history and detail in startup dashboard | Frontend + Backend | DONE |
| SAO-005 | Extend plan-task model with execution mode, dependencies, evidence, and manual-action fields | Backend + Database | DONE |
| SAO-006 | Freeze orchestrator planner output contract and persistence shape | Architect + Backend | DONE |
| SAO-007 | Seed orchestration role service keys and route role-level model policy through centralized admin controls | Backend + Admin | DONE |
| SAO-008 | Add repo-review step contract and artifact persistence | Backend | DONE |
| SAO-009 | Add DB-review and risk-review step contracts and persistence | Backend | DONE |
| SAO-010 | Implement planning workflow: execution -> reviews -> plan_ready | Backend | DONE |
| SAO-011 | Add approval-gated execution state and founder/admin approval actions | Backend + Frontend | DONE |
| SAO-012 | Extend PR workflow linkage from recommendation-only runs to execution/task-aware runs | Backend | DONE |
| SAO-013 | Add manual operator task tracking and wait/resume behavior | Backend + Frontend | DONE |
| SAO-014 | Add orchestration dashboard module for plan, blockers, approvals, and model provenance | Frontend + Backend | DONE |
| SAO-015 | Add improvement-history rollups and benchmark-ready execution outcome summaries | Backend + Frontend | DONE |
| SAO-016 | Add founder/admin execution-batch queueing and task-state sync through the PR workflow | Backend + Frontend | DONE |
| SAO-017 | Add scheduled worker pickup for approved execution batches behind rollout + entitlement gates | Backend + Worker | DONE |

## Sequencing

Build order:
1. `SAO-001` ... `SAO-006`
2. `SAO-007`
3. `SAO-008` ... `SAO-010`
4. `SAO-011` ... `SAO-013`
5. `SAO-014` ... `SAO-015`

First meaningful checkpoint:
- `SAO-010`
- one audit can create one repo-aware, multimodel, persisted implementation plan

Current approval truth:
- planning workflow now marks completed plans `ready_for_review`
- founder/admin controls can approve or reject the latest `plan_ready` execution from `/dashboard/startup?tab=audits`
- approval state currently lives on execution metadata and blocks future execution-worker work by contract, even though execution-worker automation is not wired yet

Current PR-linkage truth:
- PR runs can now carry `execution_id` plus bounded `plan_task_ids`
- recommendation linkage remains backward-compatible and nullable instead of mandatory
- PR status sync now updates linked execution state (`executing`, `completed`, `failed`) as well as recommendation lifecycle when a recommendation is still attached

Current manual-operator truth:
- implementation plans now hydrate `execution_id` from plan metadata so manual task actions can update the linked audit execution without a parallel lookup path
- manual implementation tasks can now be marked `blocked` or `done` through typed task-status helpers
- startup audit executions can now pause in `waiting_manual` from both `plan_ready` and `executing`, and can resume back to `plan_ready` or `executing`
- `/dashboard/startup` overview now exposes a manual operator queue with founder/admin controls to block execution on a manual task and resume once the manual step is completed

Current orchestration-dashboard truth:
- the startup dashboard overview now includes a dedicated orchestration module for the latest execution
- that module shows execution state, approval state, linked plan task count, summary/blocker text, and model provenance for planner/repo/db/risk review roles
- the execution read model now hydrates plan linkage, manual wait metadata, and role-level effective model names from execution metadata for dashboard use

Current improvement-history truth:
- startup tracking metrics now include execution-history rollups plus stable benchmark-ready outcome buckets: `In flight`, `Blocked manual`, `Completed`, `Failed`, and `Cancelled`
- `/dashboard/startup` overview now exposes an improvement-history module with execution totals, manual blockers, completed count, and the benchmark-ready outcome summary
- focused Playwright coverage now clicks the visible founder/admin orchestration controls in trial mode and captures screenshots for the orchestration, manual-operator, approval, and improvement-history states

Current execution-worker-launch truth:
- founder/admin users can now queue the next approved execution task batch from the startup overview PR activity panel when rollout + entitlement gates allow PR execution
- the next batch is derived from the linked implementation plan using only `todo` tasks that are auto-capable and dependency-ready; manual tasks are excluded
- execution-task rows now sync with execution-aware PR runs: queued execution batches move selected tasks to `in_progress`, merged PR runs move them to `done`, failed PR runs move them to `failed`, and closed/cancelled runs return them to `todo`
- focused helper coverage now asserts bounded task-batch selection and execution-task state sync in `lib/server/startup-implementation-plan.test.ts` and `lib/server/startup-agent-pr-workflow.test.ts`

Current scheduled-dispatch truth:
- worker cron now runs `runScheduledStartupExecutionDispatch(...)` after the existing startup Slack auto-post sweep
- scheduled execution dispatch scans `plan_ready` executions, requires `approved_for_execution`, and re-resolves workspace rollout flags plus startup GitHub / PR service gates before queueing work
- auto-dispatch is intentionally conservative: it skips executions with no approver/creator actor, no execution-linked latest plan, no dependency-ready auto tasks, active queued/running/open PR runs, or ambiguous enabled-repo selection
- auto-dispatch currently selects the single enabled GitHub repo only when exactly one allowlisted repo is enabled; anything broader is logged and skipped until preferred-repo selection is modeled explicitly
