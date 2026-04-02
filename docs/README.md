# GEO-Pulse Docs

This folder is the implementation handoff set for GEO-Pulse as of 2026-03-26.

Read these in order:
1. `docs/01-current-state.md`
2. `docs/02-implementation-map.md`
3. `docs/03-verification-and-evidence.md`
4. `docs/04-open-work-and-risks.md`
5. `docs/05-handoff-playbook.md`
6. `docs/06-environment-and-secrets.md`
7. `docs/07-deploy-and-ops-runbook.md`
8. `docs/08-architecture-flows.md`
9. `docs/09-agency-pilot-lifter-plan.md`
10. `docs/10-cloudflare-workflows-deploy-guard-plan.md`

Supporting source files used to build this set:
- `agents/ORCHESTRATOR.md`
- `agents/memory/PROJECT_STATE.md`
- `agents/memory/COMPLETION_LOG.md`
- `agents/memory/AGENT_PROTOCOL.md`
- `agents/memory/DECISIONS.md`
- `agents/memory/API_CONTRACTS.md`
- `SECURITY.md`
- `PLAYBOOK/`
- `wrangler.jsonc`
- `.dev.vars.example`
- `.env.local.example`

Scope note:
- This `docs/` folder is the handoff-oriented source of truth for implemented product state, operator setup, and continuation guidance.
- `agents/memory/PROJECT_STATE.md` remains the task ledger used by the orchestrator workflow.
- If `docs/` and an older playbook note disagree, trust the implementation-backed statement in `docs/` and then verify against code.
- As of 2026-03-26, this set includes the guided results journey, state-driven paid report UX, admin eval analytics/drilldown, retrieval writers, and the completed DA-004 / DA-005 shipped scope.
