# GEO-Pulse Agent Protocol
> Version: 1.0 | Owner: Orchestrator | Last updated: see git log

## Overview

This document defines how all agents in the GEO-Pulse build system communicate, claim work, prove completion, and update shared memory. Every agent must read this file before starting any task.

---

## The Agent Roster

| Agent | Role | Scope |
|-------|------|-------|
| **Orchestrator** | Lead. Decomposes work, delegates, verifies evidence, updates PROJECT_STATE.md | All files |
| **Architect** | System design, ADRs, API contract design, interface definitions | `workers/lib/interfaces/`, `docs/adr/` |
| **Backend** | Cloudflare Workers, scan engine, queue consumers, Stripe webhooks | `workers/` |
| **Frontend** | Next.js App Router, Server Actions, Stitch UI integration | `app/`, `components/` |
| **Database** | Supabase migrations, RLS policies, query optimization | `supabase/` |
| **Security** | Security reviews, SSRF, RLS audit, secret scanning | Cross-cutting, all files |
| **QA** | Test authoring, test execution, coverage verification, anti-hallucination challenges | `__tests__/`, `*.test.ts` |
| **API** | API-as-a-service layer, OpenAPI spec, API key management, versioning | `workers/api/`, `docs/api/` |

---

## The Completion Protocol — No Shortcuts

This is the core anti-hallucination mechanism. **No agent may claim a task is complete without evidence.**

### What counts as evidence

| Task type | Required evidence |
|-----------|------------------|
| Code written | File path + line count + key function names |
| Type check passes | Paste output of `npm run type-check` (zero errors required) |
| Unit tests written | File path + test names + `npm test -- --testPathPattern=filename` output |
| Unit tests pass | Actual test runner output with pass/fail counts — not a summary |
| Migration applied | `supabase db push` output or SQL execution log |
| Security check | Specific finding or explicit "no issues" with what was checked |
| API endpoint works | Actual `curl` or `wrangler dev` response pasted verbatim |

### What does NOT count as evidence
- "I've completed the implementation" (claim without output)
- "Tests pass" without showing test runner output
- "The file has been created" without showing its content
- "No security issues found" without specifying what was checked
- Summarizing what the code does instead of showing the code

### The Challenge Protocol
If the Orchestrator doubts a claimed completion, it will issue a **Challenge**:
- "Show me line 34 of `workers/scan-engine/index.ts`"
- "Run `npm run type-check` right now and paste the exact output"
- "What does the `validateUrl` function return when given `http://169.254.169.254`?"

Agents that cannot answer challenges have not completed the work. The task goes back to pending.

---

## Memory Update Rules

### Who updates what
- **PROJECT_STATE.md** — Orchestrator only, after verified completion
- **DECISIONS.md** — Architect writes, Orchestrator approves
- **COMPLETION_LOG.md** — QA agent writes actual evidence; Orchestrator countersigns
- **API_CONTRACTS.md** — API agent writes, Architect reviews, Orchestrator approves

### When to update
- Start of task: Orchestrator marks task `IN_PROGRESS` in PROJECT_STATE.md
- Completion claimed: Agent posts evidence in COMPLETION_LOG.md
- Completion verified: Orchestrator marks task `DONE` in PROJECT_STATE.md
- Blocking issue found: Any agent writes a `BLOCKER:` entry in PROJECT_STATE.md immediately

### Format for COMPLETION_LOG entries
```
## [TASK-ID] — [Task name]
**Agent:** Backend
**Claimed complete:** 2026-03-23
**Evidence type:** Unit test output + type check
**Evidence:**
```
[paste actual output here — no paraphrasing]
```
**Orchestrator verification:** ✅ ACCEPTED / ❌ CHALLENGED
```

---

## Delegation Format

When Orchestrator delegates a task, it uses this format:

```
DELEGATE TO: [Agent]
TASK: [Clear description]
PHASE: [Phase number from PRD]
ACCEPTANCE CRITERIA:
  - [ ] [Specific, verifiable criterion 1]
  - [ ] [Specific, verifiable criterion 2]
EVIDENCE REQUIRED: [What proof is needed]
DEPENDENCIES: [What must be done first]
BLOCKERS: [Known issues to watch for]
```

---

## Anti-Hallucination Rules

1. **Never generate test output** — run the actual tests and paste real output
2. **Never claim "I checked X"** without showing what check command was run and what it returned
3. **Never summarize file contents** — paste the actual relevant lines
4. **Never mark a security check done** without the Security agent explicitly signing off
5. **Never skip the type check** — TypeScript errors in production are not acceptable
6. **Never generate fake `curl` responses** — run the actual dev server and paste real output
7. **If you are not sure**, say "I need to verify this" — do not guess and present it as fact

---

## SOLID Enforcement Responsibilities

| Principle | Agent responsible |
|-----------|------------------|
| **S** — Single Responsibility | Architect reviews; each Worker/component does one thing |
| **O** — Open/Closed | Architect defines extension points; Backend implements |
| **L** — Liskov Substitution | Architect defines interfaces; QA writes substitution tests |
| **I** — Interface Segregation | API agent ensures consumers only see needed endpoints |
| **D** — Dependency Inversion | Architect defines abstractions; Backend/Frontend depend on them |

---

## Escalation

If any agent hits a blocker it cannot resolve:
1. Write `BLOCKER: [description]` in PROJECT_STATE.md immediately
2. Tag it with the blocking agent name
3. Orchestrator re-delegates or flags for human review
4. No agent silently skips a blocker — that is the same as hallucinating completion

---

## Reading Order for New Agents

1. This file (AGENT_PROTOCOL.md) ← you are here
2. `agents/memory/PROJECT_STATE.md` — current state of the build
3. `agents/memory/DECISIONS.md` — decisions already made (do not re-debate these)
4. `.cursor/rules/base.mdc` — base coding rules
5. Your role-specific agent file in `agents/`
6. Your scoped cursor rule in `.cursor/rules/`
7. **Merge discipline:** Open PRs use `.github/pull_request_template.md`. CI (`.github/workflows/ci.yml`) must be green; Security sign-off rules are in `agents/SECURITY_AGENT.md`. Security reference: `SECURITY.md`.
