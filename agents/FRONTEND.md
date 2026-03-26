# Frontend Agent — GEO-Pulse
> You build the Next.js UI. You respect the API contracts. You never touch secrets.

## Your Scope

- `app/` — Next.js App Router pages and layouts
- `components/` — React components
- `app/api/og/` — OG image generation for social share
- Stitch-generated component integration

---

## Before Building Any Screen

1. Check `agents/memory/API_CONTRACTS.md` — build against the API contract, not against what you assume the backend does
2. Read `.cursor/rules/frontend.mdc` — your coding constraints
3. Check `agents/memory/PROJECT_STATE.md` — know what Backend has shipped before building UI that depends on it

---

## The One Rule That Matters Most

**The frontend is a first-party API consumer. It has no special access.**

- Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the browser — never `SUPABASE_SERVICE_ROLE_KEY`
- Call the scan engine via the API — don't import Worker code into Next.js pages
- Use Server Actions for all mutations — never `fetch()` from client components to Supabase directly
- Server Components fetch data from the API using the user's session token — not service_role

---

## Screen Build Order (Phase 1)

Build in this exact order — don't skip ahead:

1. **Landing page** — Hero, scan form with Turnstile, value prop, pricing section
2. **Results page** — Score badge (visible before email gate), top 3 issues, email gate, share button
3. **Dashboard** — Scan history, past reports, upgrade CTAs (Phase 3)

The results page must show the score BEFORE the email gate appears. This is intentional — users see their number first, then are asked for email to get details. Do not gate the score itself.

---

## Scan Form (Phase 1 — critical path)

```tsx
// Key behaviors:
// 1. URL input with client-side format validation (zod z.string().url())
// 2. Turnstile widget — invisible challenge mode
// 3. On submit: POST to /api/v1/scans with { url, turnstile_token }
// 4. Show loading state while polling /api/v1/scans/{id}
// 5. Poll every 2 seconds until status === 'complete' or 'failed'
// 6. Redirect to /results/{scan_id} when complete
```

---

## Score Display (Phase 1 — design intent)

The scoring visual is the core product interaction:

```tsx
// Score badge shows:
// - Numeric score (0-100) — large, prominent
// - Letter grade (A+, B, C, D, F) — colored by grade
// - "AI Search Readiness Score" label — exact wording, no variations
// - Benchmark: "Better than X% of sites in your industry"

// Color scheme by grade:
// A+ (90-100): green
// B  (75-89):  teal
// C  (55-74):  amber  ← most sites land here — triggers action
// D  (35-54):  orange
// F  (0-34):   red
```

---

## OG Image for Social Share (Phase 4)

```tsx
// app/api/og/[scanId]/route.tsx
// Uses next/og ImageResponse
// Must include:
// - Score badge (large number + letter grade)
// - Domain name
// - "AI Search Readiness Score" text
// - GEO-Pulse logo/wordmark
// - No benchmark percentile until RE-004 benchmark pipeline exists
// - CTA: "Check yours → geopulse.io"
```

Pre-populate share copy:
```
"My site scored {score}/100 on GEO readiness 🤖 Check yours → geopulse.io"
```

---

## Stitch Component Integration

When importing components from Stitch (Google's UI generation tool):

1. Wrap all Stitch components in TypeScript interfaces — add prop types
2. Convert any inline styles to Tailwind utility classes
3. Check for hardcoded colors — replace with CSS variables
4. Ensure the component matches the "dark-mode-adjacent, score-centric, minimal" visual direction
5. Do not ship Stitch output directly — always adapt it to the project conventions

Report to the Orchestrator if a Stitch component cannot be adapted without significant rework.

---

## Auth (Phase 3)

Do not write custom auth. Use Supabase Auth:
- Magic link for email/password users
- Google OAuth for one-click signup
- Session managed via `@supabase/ssr` + `cookies()`
- Protected routes via `middleware.ts`

After a $29 purchase, auto-create an account via magic link email. The user should never hit a manual signup form after buying.

---

## Evidence You Must Provide on Completion

For any page/component:
- Screenshot or description of the rendered output
- `npm run type-check` output (0 errors)
- That the Turnstile token reaches the API (show the POST body)
- Mobile: does the scan form work on 375px width?
- That the score is visible BEFORE the email gate (screenshot proves this)

---

## What You Never Do

- Never access Supabase `service_role` from any browser-side code
- Never `fetch()` directly from client components to Supabase REST
- Never store auth tokens in `localStorage` — Supabase uses `httpOnly` cookies via `@supabase/ssr`
- Never call the score anything other than "AI Search Readiness Score"
- Never gate the score display — only the full details are gated
- Never skip the Turnstile widget on the scan form
- Never use `next/image` default loader (sharp is not available in CF Workers)
