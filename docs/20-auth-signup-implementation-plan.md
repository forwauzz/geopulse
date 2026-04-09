# Auth + Signup Byte Task Plan

Last updated: 2026-04-09

## Goal

Keep the public auth surface lean, predictable, and easy to maintain while proving the selected pricing tier survives signup and continues to Stripe checkout.

## Scope

In scope:
- pricing-tier clicks into the auth flow
- single-path signup UX
- password-based signup rollout
- bundle preservation through onboarding
- focused tests for the new auth path

Out of scope:
- billing/subscription mechanics unrelated to signup
- dashboard redesign
- admin authorization changes
- broad auth refactors that are not needed for the signup path

## Byte Tasks

| Task ID | Task | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| BT-001 | Simplify the public auth entry into a single sign-up path with a secondary sign-in link beneath it | Frontend | DONE | `app/login/page.tsx`, `app/login/login-form.tsx`, and `components/pricing-bundle-card.tsx` present one signup panel for pricing-tier clicks, with `Or sign in` rendered beneath the primary action and no side-by-side split on the signup path |
| BT-002 | Replace magic-link signup with password signup plus password confirmation | Backend + Frontend | DONE | `app/login/actions.ts`, `app/login/login-form.tsx`, `app/login/actions.test.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run app/login/actions.test.ts` |
| BT-003 | Preserve the selected bundle through signup so checkout resumes on the correct tier | Backend + Frontend | DONE | `app/login/actions.ts`, `app/login/actions.test.ts`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run app/login/actions.test.ts` |
| BT-004 | Align auth callback and onboarding redirects with the password-based signup flow | Backend | DONE | `app/login/actions.ts`, `app/login/login-form.tsx`, `app/auth/callback/route.ts`, `app/login/actions.test.ts`, `npx.cmd vitest run app/login/actions.test.ts` |
| BT-005 | Add focused tests for signup UI, bundle preservation, and redirect behavior | QA | DONE | `app/login/actions.test.ts`, `app/login/page.test.tsx`, `npx.cmd tsc --noEmit`, `npx.cmd vitest run app/login/actions.test.ts app/login/page.test.tsx` |
| BT-006 | Update repo docs and current-state notes after each completed slice | Orchestrator | DONE | `PLAYBOOK/auth-signup-v1.md`, `docs/20-auth-signup-implementation-plan.md`, `docs/01-current-state.md`, and `agents/memory/PROJECT_STATE.md` |

## Operating Rules

- Keep each implementation slice independently mergeable.
- Do not combine the password-auth rollout with unrelated billing or dashboard work.
- Update `agents/memory/PROJECT_STATE.md` and the current-state doc after each completed byte task.
- Record evidence before marking a byte task done.
