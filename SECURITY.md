# GEO-Pulse Security Guide

This file is the security reference for the GEO-Pulse codebase. Every item marked **[LAUNCH BLOCKER]** must be complete before going live. Every item marked **[AI PITFALL]** is something AI coding tools commonly get wrong — review manually.

Current truth:
- repo-side protections for RLS, SSRF, Stripe webhook verification, and Turnstile are implemented
- launch is still not fully closed because DNS/email auth (`P4-003`) and final launch sign-off (`P4-006`) remain open
- Cloudflare managed WAF remains an operator decision (`P4-004`), while repo mitigation is already in place

---

## The Five Launch Blockers

These five items block launch if incomplete. They are not optional.

| # | Item | Where | Status |
|---|------|--------|--------|
| 1 | RLS enabled on every Supabase table | `supabase/migrations/*.sql` | ✅ Migrations + new tables must keep RLS |
| 2 | SSRF validation on every user-submitted URL | `workers/lib/ssrf.ts` + callers | ✅ Enforced on scan path — extend to any new fetch of user URLs |
| 3 | Stripe webhook signature verification | `app/api/webhooks/stripe/route.ts` | ✅ `constructEvent` before handling |
| 4 | Cloudflare Turnstile on scan form, server-side validated | `components/scan-form.tsx`, `app/api/scan`, `lib/server/turnstile.ts` | ✅ Server validates token |
| 5 | SPF + DKIM + DMARC before first email send | Cloudflare DNS + Resend dashboard | ⬜ Pending operator completion before production launch |

---

## Secrets Management

**How secrets are stored:**
- Production: `wrangler secret put SECRET_NAME` — secrets injected at Workers runtime, never in source
- Local dev: `.dev.vars` file — already in `.gitignore`, never committed

**Git:** Never commit API keys, JWTs, `sk_live_` / `sk_test_`, `whsec_`, `service_role` keys, or Turnstile/Resend secrets. Only commit env **templates** (e.g. `.dev.vars.example`, optional `.env.example`) with placeholders. `wrangler.jsonc` `[vars]` is for non-sensitive config only (public URLs, Stripe **Price IDs**, Turnstile **site** key). Verify before push: `git diff` has no new secrets; optional `git check-ignore -v .dev.vars` should show it ignored.

**Required secrets (set via `wrangler secret put`):**
```
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY
RESEND_API_KEY
TURNSTILE_SECRET_KEY
```

**[AI PITFALL]** AI tools frequently:
- Put `service_role` key in `wrangler.jsonc` `[vars]` section — this exposes it in source code. `[vars]` is for non-sensitive config only.
- Generate Supabase clients using `service_role` in frontend code — this bypasses all RLS.
- Suggest using `process.env` in Workers — use the typed `Env` interface instead.

---

## Supabase RLS

**Rule:** RLS is enabled on every table in `001_initial_schema.sql` before the first row is inserted.

**[AI PITFALL]** AI tools frequently generate schema without enabling RLS, then suggest enabling it "later". This is dangerous because:
- All data is publicly accessible via the Supabase REST API without RLS
- The SQL Editor bypasses RLS — test queries using the anon key client

**The `leads` table has NO user-facing RLS policy** — this is intentional. It stores pre-auth email captures and must only be accessed via `service_role` in Workers. No `CREATE POLICY` on `leads` is correct.

**Testing checklist:**
```bash
# Test that anon key cannot read leads table
curl https://your-project.supabase.co/rest/v1/leads \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
# Expected: 403 or empty array (RLS blocks it)
# If you get data back: RLS is not working correctly
```

---

## SSRF Prevention

**File:** `workers/lib/ssrf.ts`

Users submit URLs. The scan engine fetches those URLs. This is a textbook SSRF vector.

**Always use `validateUrl()` before any fetch of a user-submitted URL:**
```typescript
import { validateUrl } from '../lib/ssrf';

const validation = await validateUrl(userInput);
if (!validation.ok) {
  return new Response(JSON.stringify({ error: validation.reason }), { status: 400 });
}
// Now safe to fetch
const res = await fetch(validation.safeUrl, { redirect: 'manual' });
```

**Implemented protections:**
- `validateUrl()` for user-facing scan entrypoints enforces `https:` only, blocks credentials, blocks non-standard ports, blocks private/internal hostname patterns, blocks IP literals, and blocks single-label hosts.
- `validateEngineFetchUrl()` is used by deep-audit fetch paths and allows `http`/`https` on ports `80/443` only, with the same hostname / IP-literal restrictions.
- `fetchGateText()` follows redirects manually and re-validates each hop before fetching the next location.
- DA-005 browser rendering is deep-audit only, opt-in, and must start from a URL that has already passed the engine fetch gate. GEO-Pulse first validates and resolves the final page URL through the normal fetch gate, then optionally asks Cloudflare Browser Rendering to render that already-validated final URL.

**Runtime limitation:**
- Cloudflare Workers do **not** expose native DNS resolution for this codepath, so GEO-Pulse does **not** currently resolve arbitrary public hostnames to IPs before fetch.
- The current protection model is hostname-pattern blocking + IP-literal rejection + manual redirect validation, not DNS-based allow/deny enforcement.
- Browser Rendering does not remove this limitation. It is treated as a post-validation rendering step, not as a substitute for the fetch gate.

**Browser Rendering guardrails (DA-005):**
- Disabled by default unless `DEEP_AUDIT_BROWSER_RENDER_MODE` and Browser Rendering credentials are explicitly configured.
- Paid deep-audit path only; the free scan path does not invoke Browser Rendering.
- On render failure, GEO-Pulse falls back to the already-fetched raw HTML rather than widening retries or skipping SSRF validation.
- Any future Browser Rendering `/crawl` integration must get a fresh Security review before being marked done.

**Blocked ranges / host patterns:**
- `127.0.0.0/8` — loopback
- `10.0.0.0/8` — private class A
- `172.16.0.0/12` — private class B
- `192.168.0.0/16` — private class C
- `169.254.0.0/16` — link-local (AWS/GCP metadata endpoint)
- IPv6 loopback, link-local, unique local
- IP address literals (require domain names only)
- Single-label hostnames
- Non-HTTPS schemes on user-facing scan entrypoints

**[AI PITFALL]** AI tools frequently skip the private IP blocklist or only check scheme. Always review fetch code that handles user-submitted URLs manually.

---

## Stripe Webhook Security

**[AI PITFALL]** AI tools frequently generate webhook handlers that process events without verifying the `Stripe-Signature` header. This allows anyone to forge payment events.

**Always verify before processing:**
```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';

export async function POST(request: Request) {
  const rawBody = await request.text(); // Must be raw text, NOT parsed JSON
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // env.STRIPE_WEBHOOK_SECRET comes from wrangler secret — never hardcode
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  // Idempotency: check if this event was already processed
  // Store stripe_event_id in payments table, return 200 if already seen

  // Only handle events you need:
  if (event.type === 'checkout.session.completed') {
    // ... process payment
  }

  return new Response('OK', { status: 200 });
}
```

---

## Rate Limiting

**Scan endpoint** (`/api/scan`):
- 10 requests/minute per IP via CF Workers Rate Limiting binding
- 20 scans/day per email address (KV storage)
- Block IPs with >50 requests/day

**Stripe checkout:**
- 5 attempts per IP per hour (KV storage)
- Prevents brute-force card testing

**Turnstile** provides bot protection on form submission — validate server-side, always.

---

## Email Security (Resend)

Before sending the first email, configure in Cloudflare DNS:

| Record | Type | Value |
|--------|------|-------|
| SPF | TXT on `mail.geopulse.io` | `v=spf1 include:_spf.resend.com ~all` |
| DKIM | TXT | Key from Resend dashboard |
| DMARC | TXT on `_dmarc.geopulse.io` | `v=DMARC1; p=none; rua=mailto:dmarc@geopulse.io` |

Start with `p=none` (monitor mode), escalate to `p=quarantine` after 30 days, then `p=reject`.

Use a dedicated sending subdomain to protect the root domain reputation.

Current operator note:
- domain purchase / DNS setup is currently blocked outside the repo by a billing issue
- do not claim email-launch readiness until that blocker is resolved and evidence is attached in `COMPLETION_LOG.md`

---

## Next.js CVE-2025-29927 (Auth Bypass)

A critical vulnerability allowing authentication bypass via the `x-middleware-subrequest` header.

**Mitigations:**
1. Enable the Cloudflare WAF managed rule: Dashboard → Security → WAF → Managed Rules
2. Keep Next.js updated (patched in recent versions)
3. Do not rely solely on middleware for auth checks — validate session in Server Components too

Current repo truth:
- `middleware.ts` includes the application-layer `x-middleware-subrequest` guard
- targeted tests exist for the middleware CVE guard and Stripe / Turnstile launch checks
- managed WAF is still an operator-side closure item, not a missing repo implementation

---

## Security Headers

Configured in `next.config.ts`. Verify headers are present after deployment:
```bash
curl -I https://geopulse.io | grep -i "x-content-type\|x-frame\|content-security"
```

---

## GDPR / Quebec Law 25

The `leads` table stores email addresses from non-authenticated users (free scan email gate).

Before actively targeting Quebec or EU users:
- Add a compliant privacy notice at the email gate
- Provide explicit opt-in, not opt-out
- Implement email unsubscribe in Resend
- Store consent timestamp in leads table

Current product nuance:
- the free results page includes a preview-save email path
- paid deep-audit delivery email comes from Stripe checkout
- both flows should remain truthful about what is being saved or delivered

**Do not launch active targeting of these regions without legal review.**

---

## AI Coding Safety Summary

When using Cursor or any AI tool on this codebase:

| Never let AI write | Always do instead |
|---|---|
| Auth logic from scratch | Use Supabase Auth or Better Auth |
| Stripe webhook handlers | Copy from official Stripe docs, verify signature |
| SSRF validation | Import `validateUrl` from `workers/lib/ssrf.ts` |
| Supabase client with service_role in frontend | Use anon key in frontend, service_role in Workers only |
| RLS-less schema | Run `001_initial_schema.sql` — RLS is already in there |

---

*Last updated: 2026-03-26 | GEO-Pulse v0.1.0*
