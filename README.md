# GEO-Pulse

GEO-Pulse is a Next.js + Cloudflare Workers product for AI search readiness audits.

Implemented today:
- free scan
- guided results journey
- preview save / lead capture
- paid deep audit via Stripe
- queue-backed report generation
- markdown + PDF delivery
- auth + dashboard
- admin eval analytics
- retrieval eval writers and drilldown

## Current status

The product is materially implemented, but launch is not fully closed.

Remaining Phase 4 operator/security work:
- SPF / DKIM / DMARC (`P4-003`)
- WAF policy / closure (`P4-004`)
- final launch security sign-off (`P4-006`)

See:
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

## Key flows

1. User scans a site and gets a preview audit.
2. Results page presents the next step clearly:
   - continue to the paid full audit
   - or subtly save the preview for later
3. Stripe checkout collects the delivery email for the paid report.
4. Webhook + queue generate the full audit.
5. Report is delivered by email and unlocked in the app.

## Tech

- Next.js App Router
- Cloudflare Workers / OpenNext
- Supabase
- Stripe
- Resend
- Gemini
- pdf-lib

## Development

Primary commands:

```bash
npm run type-check
npm run test
npm run build
```

More operator and eval commands:
- `docs/07-deploy-and-ops-runbook.md`
- `docs/06-environment-and-secrets.md`

## Source of truth

- task ledger: `agents/memory/PROJECT_STATE.md`
- evidence log: `agents/memory/COMPLETION_LOG.md`
- handoff docs: `docs/README.md`
