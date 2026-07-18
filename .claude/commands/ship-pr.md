---
description: Code-review a PR, then (only if it passes) deploy to Cloudflare and merge it.
argument-hint: "[PR number] (defaults to the current branch's PR)"
---

Ship PR **#$ARGUMENTS** (if empty, resolve the PR for the current branch with `gh pr view --json number`).

Work the steps in order. **STOP and report** the moment any step fails or finds a blocker — never deploy on a failed review or a failing build.

## 1 — Review the PR
- `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS` to load the change.
- Review for **correctness bugs, security issues, and obvious simplifications** (invoke the `/code-review` skill if available). Rank findings by severity.
- `npm run type-check` — must be clean.
- If any **blocking** correctness/security issue exists, STOP and report it. Do not deploy.

## 2 — Pre-deploy env parity (critical)
`wrangler deploy` sets the Worker's **plaintext vars** to exactly `wrangler.jsonc [vars]` — any prod dashboard var missing from the file is **dropped**. Secrets are preserved (never in the file).
- Confirm nothing would be dropped/changed: if the user pastes the prod Variables/secrets list, diff the plaintext keys+values against `wrangler.jsonc [vars]` (expect an exact match). If you can't see the dashboard, note that and ask the user to confirm before proceeding.
- Confirm `.env.local` / `.dev.vars` are gitignored and their local/test values won't ship: `NEXT_PUBLIC_*` prod values come from `wrangler.jsonc`, and any dev bypass (e.g. `NEXT_PUBLIC_E2E_BYPASS_TURNSTILE`) is disabled by its `NODE_ENV === 'production'` guard.

## 3 — Build & deploy
- Auth: `npx wrangler whoami`. If not authenticated, ask the user to run `npx wrangler login` themselves (you can't run browser OAuth) and wait.
- `npm run deploy` (queue-check guard → OpenNext build → `wrangler deploy`). Capture the **Version ID**.
- This publishes **live to getgeopulse.com** — an outward-facing action. Make sure the review passed first.

## 4 — Verify live
- Load a real page on **getgeopulse.com** that exercises the change; confirm it renders and the console is clean. If the deploy baked wrong env (localhost URL, test keys), STOP and roll back (`wrangler rollback` or redeploy from `main`).

## 5 — Merge
- `gh pr merge $ARGUMENTS --squash --delete-branch`.
- Sync local: `git checkout main && git pull`.

## Report
Return: the review summary (findings + verdict), the deploy Version ID, live-verification result, and merge status.
