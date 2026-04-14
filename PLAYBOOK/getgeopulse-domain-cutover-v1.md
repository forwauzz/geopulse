# getgeopulse.com Domain Cutover v1

Last updated: 2026-03-30

## Purpose

Freeze the exact operator checklist for moving GEO-Pulse from the temporary `*.workers.dev` hostname to `https://getgeopulse.com/`.

This slice is intentionally lean:
- production app URL in repo config now targets `https://getgeopulse.com/`
- dashboard / DNS / Auth / email / WAF steps remain operator actions
- this does not claim that the domain is live yet

---

## What this changes in repo

- `wrangler.jsonc` production `NEXT_PUBLIC_APP_URL` now points to `https://getgeopulse.com/`

This means future production deploys and redirect logic should treat `getgeopulse.com` as the canonical public origin.

---

## What this does not close by itself

Buying the domain does **not** close `P4-004` by itself.

What it does unlock:
- `P4-003` can now be completed because DNS can be configured
- final `P4-006` sign-off can proceed after DNS + production smoke evidence exist

What still remains separate:
- `P4-004` is still the Cloudflare WAF / launch-policy decision

---

## Operator cutover checklist

### 1. Cloudflare domain + routing

- Add `getgeopulse.com` to the correct Cloudflare account if not already present
- Point the apex domain at the GEO-Pulse Worker / custom domain setup
- Decide whether `www.getgeopulse.com` should redirect to apex or vice versa
- Ensure TLS is active and the custom hostname is serving successfully

Success condition:
- `https://getgeopulse.com/` loads the current GEO-Pulse app

### 2. Turnstile hostname allowlist

- In Cloudflare Turnstile, add:
  - `getgeopulse.com`
  - `www.getgeopulse.com` if that hostname will ever be used directly
- Keep the `*.workers.dev` host only if you still need it for preview/manual smoke flows

Success condition:
- Turnstile challenges render and validate on the custom domain without hostname errors

### 3. Supabase Auth URL configuration

- Set Supabase Auth site URL to:
  - `https://getgeopulse.com`
- Add redirect URLs for:
  - `https://getgeopulse.com/auth/callback`
  - `https://www.getgeopulse.com/auth/callback` only if needed
- Remove stale production redirect assumptions later if the old host should no longer be used

Success condition:
- magic-link login succeeds on the custom domain

### 4. Stripe production URLs

- Confirm the live Stripe webhook endpoint is:
  - `https://getgeopulse.com/api/webhooks/stripe`
- Confirm checkout success / cancel URLs resolve through the new domain
- Re-test one production checkout after cutover

Success condition:
- checkout returns to the custom domain
- webhook is received on the custom domain
- paid report flow still completes

### 5. Resend + DNS (`P4-003`)

Recommended sending identity:
- use a mail subdomain, e.g. `mail.getgeopulse.com`

Configure the Resend-provided DNS records for:
- SPF
- DKIM
- DMARC

Recommended evidence to capture:
- Cloudflare DNS screenshots
- `dig` output for the final TXT/CNAME records
- one successful production send using the intended `RESEND_FROM_EMAIL`

Success condition:
- `P4-003` can be marked complete with evidence

### 6. WAF (`P4-004`)

After the domain is live in Cloudflare:
- decide whether to enable the relevant managed WAF protection for the Next.js / `x-middleware-subrequest` class of abuse
- if managed WAF is unavailable on the active plan, explicitly document the mitigated launch stance instead of leaving this ambiguous

Success condition:
- either WAF evidence is attached
- or Security explicitly accepts the app-layer mitigation as the launch posture

### 7. Production smoke before `P4-006`

Run on `https://getgeopulse.com`:
- home page
- free scan
- results page
- login
- dashboard
- one paid checkout
- webhook receipt
- report delivery email

Success condition:
- final `P4-006` sign-off has domain, DNS, and smoke evidence attached

---

## Minimal evidence bundle to paste later

When the operator work is done, capture:
- custom-domain route live screenshot
- Turnstile hostname success screenshot
- Supabase Auth redirect settings screenshot
- Stripe webhook endpoint screenshot
- DNS / Resend evidence for SPF, DKIM, DMARC
- WAF screenshot or mitigated-launch decision note
- one successful production paid-flow result on `getgeopulse.com`

---

## Current recommended sequencing

1. Route `getgeopulse.com` to the live app
2. Update Turnstile + Supabase + Stripe endpoints
3. Complete Resend DNS (`P4-003`)
4. Make the WAF decision (`P4-004`)
5. Run production smoke
6. Close `P4-006`
