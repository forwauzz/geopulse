# Current State

Last consolidated: 2026-03-26

## Product Status

GEO-Pulse is a working Next.js + Cloudflare Workers product with these end-to-end paths implemented:
- free scan
- guided results journey
- lead capture / preview save
- paid deep-audit checkout
- Stripe webhook + queue processing
- PDF + markdown report generation
- email delivery
- auth + dashboard
- admin eval analytics + retrieval drilldown
- marketing attribution reporting
- retrieval / prompt evaluation foundation

## Current Phase

Current orchestrator phase: `Phase 4 - Launch`

Launch is not fully closed yet.

## What Is Implemented

### Core product
- landing + scan flow
- Turnstile validation
- SSRF-gated scanning
- deterministic + LLM-assisted checks
- weighted scoring + category scoring
- results page + share image
- session-aware landing header:
  - logged out: sign-in only
  - logged in: dashboard + sign out

### Results and report UX
- centralized delayed long-wait loading overlay for slower user actions
- guided audit journey on results:
  - preview first
  - paid full audit as primary next step
  - preview-save as the subtle secondary path
- state-driven status on results page:
  - preview ready
  - checkout cancelled
  - payment return awaiting confirmation
  - full audit in progress
  - report delivered
- interactive in-browser report view above markdown sections

### Paid deep audit
- `scan_runs` / `scan_pages`
- multi-page crawl
- robots/sitemap discovery
- section-aware sampling
- chunked queue continuation
- coverage summary
- technical appendix
- markdown + PDF report artifacts
- R2-backed report delivery
- Stripe checkout email is the authoritative delivery address for paid reports

### Deep audit advanced work
- DA-004 complete as shipped scope:
  - crawl-delay handling
  - crawl metrics
  - chunk progress
  - continuation guardrails
  - queue-based continuation up to the 1000-page cap
- DA-005 complete as shipped scope:
  - optional Browser Rendering-backed SPA fallback for paid deep audits
  - disabled by default
  - not a full Cloudflare `/crawl` orchestration layer

### Admin / eval / retrieval foundation
- report eval runs table + admin UI
- site-centric eval analytics across report + retrieval runs
- Promptfoo run persistence into Supabase
- retrieval run writer into aggregate + prompt/passage/answer tables
- retrieval drilldown page from admin evals
- deterministic retrieval harness
- Promptfoo harness + suites
- RAGAS fit note with current no-go decision

### Marketing attribution
- event ingestion
- UTM/session capture
- attribution views
- weekly email reporting

## Current Blockers

These still block launch closure:
- `P4-003` SPF / DKIM / DMARC operator setup
- `P4-006` launch security sign-off
- `P4-004` WAF remains operationally unresolved (`deferred / mitigated` in repo)

## Most Important Truths

- The product is materially real, not a stub.
- The results/report UX now reflects real payment/report state instead of optimistic query-string messaging.
- Launch readiness is still gated by operational security closure, not by missing core product code.
- Deep-audit core scale plumbing is implemented; remaining launch risk is operational/security closure, not DA-004 core code.
- Retrieval analytics are implemented for deterministic and Promptfoo-backed runs, but RAGAS runtime remains intentionally unshipped.
