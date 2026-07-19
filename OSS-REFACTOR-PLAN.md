# GEO Pulse — Open-Source Refactor Plan

Working plan for the OSS version. Source of truth for the loop-based workflow.
(Companion to the existing `agents/memory/PROJECT_STATE.md` ledger.)

## North star
- Open-source GEO Pulse.
- **Remove the paywall** — the full audit becomes free, no Stripe, no account wall.
- Work in autonomous **loops** with minimal user involvement.

## Design principles (NEW — 2026-07-18)
1. **The scorecard is marketing, not engineering.** The free-scan result a visitor first
   sees must read like a *marketing scorecard*: benefit-led, plain-language, confidence-
   building. Lead with what it means for their visibility and growth, not with HTTP
   headers and JSON-LD. Minimize jargon; translate every technical check into an outcome.
2. **The full audit report can be technical.** Once someone runs the deep audit, the
   detailed report is allowed to be engineer-facing: exact findings, header names,
   schema types, per-page breakdowns, copy-paste fixes. Depth lives here, not in the
   scorecard.
   > Rule of thumb: scorecard = "why it matters"; audit report = "exactly what to change".
3. **Flag the paid/legacy path.** Everything tied to the old paid (Stripe) model is
   *legacy* and on the way out. It must be clearly flagged in both code and UI during the
   transition so the removal loop is a search away and nothing paid ships silently.

### "Flag legacy paid" convention
- **Code:** tag every paid/Stripe-coupled block with a searchable marker
  `// LEGACY-PAID:` (+ one line on what replaces it). One `grep -r "LEGACY-PAID"` = the
  full removal checklist.
- **Config:** gate paid surfaces behind a single `LEGACY_PAID_ENABLED` flag (default
  `false` in OSS) so they can be switched off before code is deleted.
- **UI:** where a paywall/upsell still renders, show a small muted marker
  ("Legacy — being removed") so it's never mistaken for the OSS path.

## Design direction (inspiration: flightstory.com)
Adopt the **Flight Story** aesthetic as the north-star look (captured 2026-07-18):
- **Stark monochrome** — pure black on white, minimal color; semantic color used sparingly.
- **Oversized UPPERCASE grotesk display type** — Neue Haas Grotesk Display / Helvetica-lineage
  (Inter Tight / Neue Montreal as free substitutes), weight ~600, hero sizes ~100px+.
- **Big statement numbers** (e.g. the score, "$400 MIL"-style stats), editorial/agency confidence,
  generous negative space, minimal ornamentation.
- This is a deliberate departure from the current soft Material-3 slate-blue theme. Treat as a
  future **redesign pass** on the scorecard + marketing pages, not a Loop-1 change.
- [x] **Scorecard flightstory pass (PR #9)** — oversized UPPERCASE grotesk headers + bold grotesk
  numbers (Inter black) replacing Newsreader serif; monochrome-forward, keeps M3 tokens + light/dark.
  ⚠️ needs a human visual review (automated screenshots were unreliable in the build env).
- [ ] Marketing pages (home/pricing) flightstory pass — follow-on.

## Loops (roadmap)

### Loop 1 — Scorecard + stepped results  ✅ built (preview), ⏳ marketing-tone pass
- [x] `components/score-report.tsx` — 6-step guided report, M3 tokens + Inter/Newsreader.
- [x] Real fixture (`score-report.fixtures.ts`, immersivelabs 68/D+) + dev route `/dev/scorecard`.
- [x] Verified live (light+dark, no console/type errors).
- [x] **Marketing-tone rework** (per principle 1): plain-language verdict, renamed pillars
      (Getting found / Being understood / Being trusted / Showing up in answers / Turning
      visits into customers), problem-framed gap headlines, plain "growth plan". Technical
      copy moved out — lives in `score-report.copy.ts` (`MARKETING_CHECKS`), original
      finding/fix untouched for the Loop-2 report.
- [x] Rank confirmed failures above "Couldn't check" in gaps.
- [x] `legacyPaidEnabled` prop: default false = free CTA; true = "LEGACY — PAID" marker +
      Stripe-steer. Preview both at `/dev/scorecard` and `/dev/scorecard?paid=1`.
- [x] **Swapped** `<ScoreReport>` into `components/results-view.tsx` (full-width, owns the
      page). The live Stripe checkout / email-gate / delivered-report blocks are reused
      verbatim inside a `deepAuditSlot` (Step 6) — paid flow untouched, now UI-flagged
      "Legacy — paid (Stripe)". Data path extended for full issues:
      `get-scan-for-public-share.ts` + `app/api/scans/[id]/route.ts` now return `issues`.
      tsc 0 errors; `/results/[id]` + `/api/scans/[id]` compile; error state graceful.
      `score-display.tsx` now unused (safe to delete after live verification).
- [x] **VERIFIED LIVE (2026-07-18)** — ran a real scan of anthropic.com (58/F, guest scan
      `372aad30…`); the swapped `/results/[id]` rendered the full marketing scorecard on live
      data, projection "58 → 88 (+30)", and Step 6 showed "LEGACY — PAID (STRIPE)" + the real
      $29 DeepAuditCheckout intact. No console errors. Loop 1 DONE. Ready for `wrangler login`
      + deploy when Uzziel chooses.

- [x] **DEPLOYED TO PROD (2026-07-18)** — `wrangler deploy` version `d1d85619-48a2-4ffb-8280-5201485d758f`,
      live at getgeopulse.com. Pre-deploy: diffed prod dashboard vs `wrangler.jsonc` — all 56
      plaintext vars + values identical, 11 secrets preserved (deploy = code only, no env change).
      Verified: build baked prod NEXT_PUBLIC values (getgeopulse.com URL + real Turnstile key),
      NOT the local `.env.local` test values. Confirmed the new scorecard renders live on prod.
      Committed on branch `feat/oss-marketing-scorecard` (pushed) — **not yet merged to main**.

> **Local dev env gotcha:** `getScanApiEnv()` reads via `getCloudflareContext` (wrangler
> platform proxy) → server secrets for `npm run dev` MUST live in **`.dev.vars`**, NOT
> `.env.local` (the repo's `.dev.vars.example` note is misleading). `.env.local` only feeds
> the browser (`NEXT_PUBLIC_*`). Both are gitignored. Dev server auto-picks a free port
> (3000→3003…); the scan API needs the Turnstile test secret in `.dev.vars` too.

### Loop 1.5 — Scorecard charts (marketing)
- [ ] **"You are here → you could be here"** projection: single bar, current score +
      recoverable points from the growth plan (68 → 87). Highest marketing value; uses the
      already-computed `+N pts`. In Loop-1 scope.
- [x] **Peer marker** — distribution strip (You vs Typical vs Top 10%) in the score section.
      `lib/server/get-score-benchmark.ts` computes percentile/median/p90 from the `scans`
      score distribution (v0: JS over the score column, ~129 rows; add KV cache / SQL RPC at
      scale). Wired through `api/scans/[id]` + results-view; honest "sites we've scanned"
      copy; hidden under sampleSize 20. Verified live (anthropic 58 → 64th pct). Not yet deployed.
- [ ] SKIP for now: pillar radar/spider (decorative with 2 empty pillars).

### Loop 4 — Local competitor comparison (auto-discovery)
Uzziel's vision (2026-07-18): don't compare vs all scanned sites — compare vs the
site's ACTUAL local competitors, discovered automatically. Pipeline:
1. **Detect** business type + city from the scanned page (Gemini / schema.org address).
2. **Confirm** — show detected industry+city, let the user edit before searching (DECIDED).
3. **Discover** local competitors via Gemini **Google-Search grounding** (`google_search`
   tool; verified the API accepts it on `gemini-2.0-flash`). No SERP API wired; grounding
   is the path.
4. **Scan** 3-5 competitors (reuse `runFreeScan`) — N scans = real Gemini cost + latency.
5. **Compare** — "you vs your local competitors," each named + scored.

Decisions: runs as a **separate async action** ("Find my local competitors" button, not
inline — DECIDED); confirm/edit detection first (DECIDED); keep the generic peer marker as
a **fallback** when no competitor data (DECIDED).

**v1 SHIPPED (manual entry, 2026-07-18):** `components/competitor-compare.tsx` — user adds a
competitor URL → scans via existing `/api/scan` → side-by-side table (Overall + 3 pillars,
winner highlighted per row), up to 3 competitors; generic peer strip is the empty-state
fallback. Wired via `ScoreReport competitorSlot` (results-view). `PeerStrip` exported for
reuse. Uses the repo's `NEXT_PUBLIC_E2E_BYPASS_TURNSTILE` dev flag. Verified: table renders
(dev `?compete=1`), live scan fires + errors surface. **No billing needed** — this skips
grounded search; a competitor scan = a normal free scan.
> Caveat: competitor scans inherit the free-scan limitation — bot-protected sites (openai,
> cloud providers, etc.) return 403 to the plain fetcher. Local SMB competitors (the real use
> case) rarely block. Deep-audit browser-rendering would fix it later.
- [x] **Steps 1-3 SHIPPED on MOCK (PR #10, 2026-07-18)** — full detect→confirm→discover pipeline
  deployed live (Version `77591612-293f-4812-957b-c8fc9ccc80ee`, getgeopulse.com).
  - **Detect** (`POST /api/competitors/detect`) — deterministic heuristic (schema.org `@type` +
    `PostalAddress` + industry keywords). No LLM, **works today**. Verified live: immersivelabs.com
    → "IT services / Bristol", high confidence.
  - **Confirm** — editable industry + city before searching (`components/competitor-discovery.tsx`).
  - **Discover** (`POST /api/competitors/discover`) — **mock** default returns deterministic,
    clearly-labelled `.example` sample competitors with sample scores (whole UI demos with zero
    Gemini cost); **live** path (`COMPETITOR_DISCOVERY_MODE=live` + billed key) calls Gemini with
    the `google_search` tool (`lib/server/competitor-discovery-gemini.ts`), falls back to mock on
    quota/billing failure. Pure logic unit-tested (16 tests); DOM-verified (detect→confirm→discover
    →add-to-table), clean console.
  - **Only remaining blocker: Gemini billing** — flip `COMPETITOR_DISCOVERY_MODE=live` once billed.

> **PREREQUISITE — Gemini billing.** The current key is free-tier and hit a 429 quota
> immediately during a single grounded-search test. Grounded discovery + 3-5 competitor
> scans per request will exhaust free tier instantly. Needs billing enabled on the Gemini
> key (or a dedicated search API) before this works live or can be tested end-to-end.
> Note: the existing benchmark/GPM subsystem (`benchmark-execution`, `benchmark-grounding`,
> `geo-performance-prompt-builder`) is adjacent infra to reuse/learn from.

### Loop 2 — Full audit report (technical)  ✅ already satisfied (2026-07-18)
- [x] The deep-audit report is ALREADY technical + per-page: `build-deep-audit-markdown.ts`
      emits Executive Summary → Priority Action Plan → Detailed Check Reference → Per-page
      Reference → Technical Appendix; `report-viewer.tsx` renders it with a TOC sidebar,
      scroll-spy, section chips, PDF/markdown download, resend. No rebuild needed — verified
      the free-audit path (item 1) feeds the same pipeline (a free audit generated a report).

### Loop 3 — De-paywall behind a flag (per principle 3)  ✅ built (PR #8)
- [x] `LEGACY_PAID_ENABLED` flag (cf-env + wrangler var + `isLegacyPaidEnabled` + `'free'` mode).
- [x] `/api/checkout` free branch (email + amount 0 → direct queue, no Stripe); Stripe path flagged `// LEGACY-PAID`.
- [x] `checkoutMode='free'` resolution (auth + public); free-mode UI (email field, "Run full audit — free", "Free & open source" marker).
- [x] wrangler.jsonc set `"true"` so getgeopulse stays paid; verified both modes locally via API.

**Not a deletion — a toggle.** Default OSS behavior (`LEGACY_PAID_ENABLED=false`):
anyone can create access and get full reports easily, free. When paid is later activated
(`LEGACY_PAID_ENABLED=true`), users are steered to Stripe. Flag every paid surface
(LEGACY-PAID markers) + a muted UI "Legacy" marker so the two modes are never confused.
The `<ScoreReport legacyPaidEnabled>` prop already implements this at the CTA.
Legacy paid surface inventory (starting point):
- API: `app/api/checkout`, `app/api/webhooks/stripe`, `app/api/billing/subscribe`,
  `app/api/billing/portal`, `app/api/admin/reconcile-deep-audit`
- Components: `deep-audit-checkout.tsx`, `checkout-status-banner.tsx`,
  `subscription-status-banner.tsx`, `new-subscriber-welcome-banner.tsx`,
  `pricing-bundle-card.tsx`, `email-gate.tsx`
- Flow: `components/results-view.tsx` (the "Step 2" paid checkout), `app/pricing/page.tsx`,
  `app/dashboard/billing/page.tsx`
- Backend: deep-audit queue trigger currently fired by the Stripe webhook → must fire
  directly from a free "Run full audit" action instead (`workers/queue`, `workers/report`)
- Deps/env: `stripe` package, `STRIPE_*` env vars

## Loop 5 — Admin-only autonomy experiments (Uzziel only)
Two autonomous systems, gated to Uzziel's account (admin-only). The "no human in the loop"
setting lives on his **profile** (a per-user autonomy flag), so the capability can later be
offered to other users who opt in. These are **experiments** — keep them flexible, iterate.

### 5a — Daily self-improvement loop (getgeopulse.com audits itself → auto-ships)
- [x] **CONTROL PLANE + SELF-AUDIT LOOP + SHIP SPINE SHIPPED (PR #11, 2026-07-18)** — deployed
  live (Version `0859b503-13ea-47ad-bd21-d2a1c6d0bbeb`). **OFF by default.**
  - **Steps 1-2 (audit → email):** `lib/server/self-improvement.ts` runs a free scan on
    getgeopulse.com, builds a weight-ranked improvement plan (pure, unit-tested), emails it via
    Resend, records a ledger row. Daily gate in `workers/cloudflare-entry.ts` at
    `SELF_IMPROVEMENT_HOUR_UTC` (12:00 UTC) on an existing cron tick.
  - **Control plane** (migration `047`, service-role-only RLS): `self_improvement_runs` (ledger),
    `self_improvement_settings` (enable / **kill switch** / autonomous-ship gate / recipient),
    `user_autonomy_flags` (per-user no-human-in-the-loop opt-in — the "profile" autonomy flag).
  - **Admin surface** `POST/GET /api/admin/self-improve` — dual auth (platform-admin session OR
    `x-self-improve-secret`), manual trigger + settings toggle. Verified live: rejects unauth 401.
  - **Step 3 self-gated ship spine:** `scripts/autonomous-ship.mjs` = `/ship-pr` minus human
    confirmations, gates kept (kill switch → type-check → tests → build → deploy → verify-live
    with **auto-rollback** → merge); `.claude/commands/auto-ship.md` runbook; on-ramp
    `.github/workflows/self-improve.yml` (phase-1 scheduled gates + secret-gated audit trigger).
  - **Remaining to activate (operator, intentionally manual per the guardrails below):** (a) apply
    migration `047` to prod (`supabase db push` — CI-blocked by design); (b) set
    `SELF_IMPROVEMENT_ENABLED="true"` + toggle DB `enabled`; (c) provision the external headless
    Claude runtime + `ANTHROPIC_API_KEY` for phase-2 autonomous code-gen. Everything else is live.

Fully autonomous, **no human gate**:
1. **Cron (daily)** → run an audit on `getgeopulse.com` (free scan or deep audit).
2. **Email** the report to Uzziel (Resend is already wired — `RESEND_*`).
3. Hand the report to a **local autonomous coding agent** (headless Claude Code / cron agent)
   that: reads the report → drafts a plan → implements on a branch → **reviews, deploys, and
   merges** — reusing the `/ship-pr` backbone but with the human confirmations removed.
- Architecture options: the `schedule` skill / a cron cloud agent / a GitHub Action invoking a
  headless agent. `/ship-pr` (`.claude/commands/ship-pr.md`) is the review→deploy→merge spine.
- **Autonomy ≠ no safety.** Since a human won't gate it, the loop MUST self-gate: type-check +
  tests + production build must pass before deploy; auto-rollback (`wrangler rollback`) if live
  verification fails; bounded scope per run (small diffs); and a kill switch. "No human in the
  loop" is the goal; automated safety gates are how it stays safe. (Flag for Uzziel: an
  unattended agent with prod deploy + merge rights is powerful and genuinely risky — these gates
  are non-negotiable, and a first phase that opens a PR + auto-merges only on green checks is the
  safer on-ramp before true zero-touch.)

### 5b — Autonomous marketing / visibility experiment (no involvement)
- [x] **MEASURE → PROPOSE LOOP SHIPPED (PR #12, 2026-07-18)** — deployed live (Version
  `347177d0-278a-4e1a-88dd-494569264846`). **OFF by default.** Built on the EXISTING content
  machine + distribution engine + 100-topic registry — **no new tables**.
  - **Measure:** coverage gaps in `docs/13-topic-registry-v1.json` (topics with no `content_items`
    yet) = "where are we invisible". A GPM visibility signal (citation/share-of-voice/opportunities
    via `buildGpmReportPayload`) can layer into `selectProposalCandidates` later.
  - **Propose:** `lib/server/marketing-autopilot.ts` creates **review-gated** `content_items` briefs
    (`status:'brief'`) for the next weak topics, capped (`MARKETING_AUTOPILOT_DAILY_CAP`, default 2).
    They surface in `/dashboard/content` for a human to draft — **never auto-published** (the
    "review the first batch" guardrail). Pure selection logic unit-tested (7 tests).
  - **Daily gate** in `workers/cloudflare-entry.ts` at `MARKETING_AUTOPILOT_HOUR_UTC` (13:00 UTC);
    kill switch (`MARKETING_AUTOPILOT_KILL`) overrides everything.
  - **Admin surface** `GET/POST /api/admin/marketing-autopilot` (dual auth: session OR
    `x-marketing-autopilot-secret`). Verified live: rejects unauth 401.
  - **BLOCKER — channel/tool access:** creating social distribution jobs needs a **connected**
    distribution account (X/LinkedIn OAuth / Ghost). With none connected the autopilot returns
    `channelAccess:'required'` and stops at review-gated briefs. Connect a channel + set
    `MARKETING_AUTOPILOT_ENABLED="true"` to go live. Reuses the distribution engine's `draft`/
    `review` statuses so nothing posts without approval.

Continuously grow GEO-Pulse's visibility with zero user involvement. Experimental / not rigid.
- **Reuse existing infra:** the repo already has a **distribution engine** (`DISTRIBUTION_ENGINE_*`,
  `auto_poster/`) with **X + LinkedIn OAuth** and **Ghost blog** admin — plus the benchmark/GPM
  system for measuring AI-answer visibility. That's the backbone.
- **Candidate tactics:** auto-generate GEO-optimized content (blog/llms.txt/FAQ), schedule social
  posts, publish comparison/benchmark pieces, and measure lift via the GPM subsystem — closing the
  loop (measure visibility → generate content to improve it → re-measure).
- Uzziel will grant whatever MCPs/tools are needed (analytics, social, SEO). 
- **Guardrails even in an experiment:** it publishes to public channels on his behalf, so keep
  rate/quality caps and a review of the *first* batch before it runs unattended; avoid spammy
  volume that would harm the brand.

## Environment / access state
- Repo: `C:\Dev\geopulse\geopulse` (GitHub `forwauzz/geopulse`).
- Supabase MCP connected (project `vynrlgtxqnomxenakafn`); anon key in `.env.local`.
- Needed for a LIVE new scan: `SUPABASE_SERVICE_ROLE_KEY` + `GEMINI_API_KEY`.
- Cloudflare push: Uzziel runs `wrangler login` himself (interactive). No self-created
  accounts / credential entry by the agent.
