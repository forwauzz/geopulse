# Founder Guide — Runtime Env + What Happens Next (Attribution)

You asked: **"Where is runtime env? in git, or in Cursor?"**

## Short answer
- **Production runtime env is NOT in git.**
- It lives in Cloudflare Worker secrets/vars configured in your deployment environment.
- Cursor/parallel dev can reference variable names, but values must be set in runtime.

---

## Where each env type lives

### 1) Production secrets (real values)
Set in Cloudflare via Wrangler secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TURNSTILE_SECRET_KEY`
- `GEMINI_API_KEY`
- `RESEND_API_KEY`
- `MARKETING_INGEST_KEY`

These are **not committed** to git.

### 2) Production non-secrets
Can be in `wrangler.jsonc` under `vars` (public config values).

### 3) Local dev runtime env
Use a local `.dev.vars` file (ignored by git), with placeholder shape from `.dev.vars.example`.

---

## What has already been implemented for attribution

- DB table for raw events (`analytics.marketing_events`) exists in migration `004`.
- Internal ingestion endpoint exists:
  - `POST /api/internal/marketing/events`
- Ingestion requires `Authorization: Bearer <MARKETING_INGEST_KEY>`.

---

## What I can do for you directly (already authorized)

As your coding agent, I can:
1. Continue implementation (PR2 wiring into scan/leads/checkout/webhook).
2. Add validation scripts and founder-friendly runbooks.
3. Add reporting SQL for weekly attribution views.
4. Keep changes isolated so core product behavior stays safe.

---

## What you (or operator) must do outside git

1. Set runtime secret values in Cloudflare.
2. Confirm deployed environment is using latest Worker version.
3. Run one ingestion smoke test in deployed/staging runtime.

---

## Simplest non-technical sequence

1. Set `MARKETING_INGEST_KEY` in Cloudflare secrets.
2. Deploy current branch.
3. Run the test script in `scripts/test-marketing-ingest.sh`.
4. Confirm one row appears in `analytics.marketing_events`.
5. Tell me "go", and I execute PR2 wiring.

