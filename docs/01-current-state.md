# Current State

Last consolidated: 2026-03-26

## Product Status

GEO-Pulse is a working Next.js + Cloudflare Workers product with these implemented end-to-end paths:
- free scan
- results page
- lead capture
- paid deep-audit checkout
- Stripe webhook + queue processing
- PDF + markdown report generation
- email delivery
- auth + dashboard
- admin eval page
- marketing attribution reporting
- prompt/eval foundation

## Current Phase

Current orchestrator phase: `Phase 4 - Launch`

Launch is not fully closed yet.

## What Is Implemented

### Core product
- Landing + scan flow
- Turnstile validation
- SSRF-gated scanning
- deterministic + LLM-assisted checks
- weighted scoring + category scoring
- results page + share image

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
- interactive in-browser report view

### Deep audit advanced work
- DA-004 partial:
  - crawl-delay handling
  - crawl metrics
  - chunk progress
  - continuation guardrails
- DA-005 complete as shipped scope:
  - optional Browser Rendering-backed SPA fallback for paid deep audits
  - disabled by default
  - not a full Cloudflare `/crawl` orchestration layer

### Admin / eval / retrieval foundation
- report eval runs table + admin UI
- structural eval replaced with integrity rubric
- golden report fixtures
- deterministic retrieval harness
- promptfoo harness + suites
- ragas fit note with no-go decision

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
- The paid report is now much more truthful than earlier iterations.
- Launch readiness is still gated by operational security closure, not by missing core product code.
- The deepest remaining engineering gap is DA-004 Workflows-scale orchestration for very long crawls.
