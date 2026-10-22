# Claude startup instructions

1. Read `AGENTS.md` completely before acting.
2. Read the assigned GitHub issue and only its linked plan/ADR sections.
3. Check `owner:claude` and `handoff:claude` work before claiming something new.
4. Check whether an issue explicitly places you in acting-owner mode and obey its scope and return condition.
5. Use an isolated branch/worktree and preserve unrelated changes.
6. Keep active status and handoffs in the issue/PR; do not create separate handoff documents.
7. In normal mode, hand customer-facing implementation to Codex for independent verification and merge/deploy closure. In explicit acting-integration-owner mode, follow the failover rules in `AGENTS.md`.

The founder's direct request overrides an older issue. If a substantial new implementation request has no issue, create or identify one bounded issue before coding.
