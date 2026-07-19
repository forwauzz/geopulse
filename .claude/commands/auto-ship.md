---
description: Autonomous (no-human) variant of /ship-pr — self-gated deploy+merge for Loop 5a.
argument-hint: "[PR number] (optional; omit for gates-only dry run)"
---

Ship PR **#$ARGUMENTS** fully autonomously (Loop 5a — getgeopulse.com self-improvement). This is
`/ship-pr` with the human confirmations removed and the safety gates kept. Use this ONLY when a
headless agent has implemented a **small, bounded** change on a branch and the account has autonomy
enabled (`user_autonomy_flags.autonomy_enabled`) and the kill switch is off
(`self_improvement_settings.kill_switch = false`, `SELF_IMPROVEMENT_KILL` unset).

## Guardrails (non-negotiable)
- **Bounded scope:** one focused change per run. If the diff is large or touches auth/payments/
  migrations, STOP and leave it for a human.
- **Gates before deploy:** `npm run type-check`, `npm run test`, and the OpenNext build MUST all
  pass. Never deploy on a red gate.
- **Auto-rollback:** if live verification fails after deploy, roll back (`wrangler rollback`).
- **Kill switch wins:** re-check it right before deploy.

## Steps
1. Confirm autonomy is enabled and the kill switch is off (query `self_improvement_settings`).
2. Run the self-gated spine — it enforces all of the above:
   ```
   node scripts/autonomous-ship.mjs --pr $ARGUMENTS --target https://getgeopulse.com/
   ```
   For a gates-only check (no deploy/merge): add `--dry-run`.
3. Record the outcome (Version ID, PR merge status, or the abort reason) in `self_improvement_runs`.

## When NOT to auto-ship (escalate to a human)
- Failing gates, flaky tests, or an ambiguous diff.
- Anything touching secrets, billing, auth, RLS, or DB migrations.
- Live verification failing twice in a row (possible env/config problem, not a code bug).
