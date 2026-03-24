## Summary

<!-- What changed and why (one short paragraph). -->

## Task / phase

<!-- e.g. P4-001, Phase 4 — Launch -->

- **TASK_ID / phase:** 

## Evidence (required before merge)

- [ ] **`npm run type-check`** passes (CI runs this — fix locally if CI is red)
- [ ] **`npm run test`** passes
- [ ] **`agents/memory/COMPLETION_LOG.md`** updated with **real** command output (not paraphrased), if this PR completes a tracked task

## Security sign-off (when applicable)

Check **agents/SECURITY_AGENT.md** — required before Orchestrator marks done if this PR touches:

- User-submitted URLs / scan path  
- Auth, session, or middleware  
- Stripe webhooks or checkout  
- Supabase schema / RLS  
- API key issuance  
- Email sending at scale  

- [ ] **Not applicable** — no security-sensitive surface area  
- [ ] **Applicable** — `COMPLETION_LOG.md` includes **Security Sign-Off** block for the task ID (or linked issue)

## Docs / state

- [ ] **`agents/memory/PROJECT_STATE.md`** updated by Orchestrator only after evidence is accepted (usually a follow-up commit or separate PR is OK if you coordinate)
