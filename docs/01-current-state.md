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
- live share-snapshot action:
  - native share when available
  - copy-link fallback
  - OG image preview link
- session-aware landing header:
  - logged out: sign-in only
  - logged in: dashboard + sign out

### Results and report UX
- centralized delayed long-wait loading overlay for slower user actions
- guided audit journey on results:
  - preview first
  - paid full audit as primary next step
  - preview-save as the subtle secondary path
- top-of-page action band on results:
  - preview state: scrolls users directly to buy or save
  - generating state: explains what happens next and where recovery lives
  - delivered state: prioritizes open/download/sign-in recovery actions
- state-driven status on results page:
  - preview ready
  - checkout cancelled
  - payment return awaiting confirmation
  - full audit in progress
  - report delivered
- delivered-report access stays truthful:
  - direct links only appear when hosted PDF or markdown artifacts exist
  - report viewer falls back to PDF download when no web report is available
- paid-report recovery is now explicit:
  - delivered results page points users to sign in with the Stripe checkout email
  - login page explains the recovery rule
  - dashboard empty state tells users how to recover an already-purchased report
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
- benchmark run-detail lineage inspection:
  - prompt -> response -> citations -> grounded evidence status on the existing admin detail page
- narrow benchmark cohort frames:
  - explicit stored cohort definition
  - read-only comparison panel on benchmark domain history
- multi-model benchmark lane support:
  - one provider boundary
  - multiple enabled live model ids via env allowlist
- benchmark schedule hardening:
  - bounded launches per sweep
  - early stop after repeated failures
  - structured failure visibility on the existing log path
- benchmark collection start path:
  - explicit CSV seed import helper for schedule-enabled benchmark domains
  - explicit frozen query-set seed fixture for the first `law_firms` lane
  - explicit schedule preview command before enabling the recurring lane
  - explicit one-shot scheduled-sweep command for proving the recurring lane immediately
  - explicit scheduled-window summary command for reviewing one frame from the terminal
  - explicit outlier-selection command for choosing the first manual review set
  - explicit run-diagnostic command for selected grounded outlier runs before manual lineage review
  - recurring schedule can now narrow by vertical and seed priority
  - twice-daily schedule windows are supported for slow internal collection lanes
  - first live-window interpretation is now frozen:
    - grounded citation-rate deltas are usable internal signal
    - exact-page quality is currently not a useful gating metric for this lane
    - current grounded runs are mostly producing domain-level attribution, not page-level provenance
  - two-window decision freeze is now explicit:
    - the first `law_firms` lane should currently be treated as a domain-level grounded attribution lane
    - comparable collection should continue without a provenance-matcher rewrite or scale-up
- benchmark operations decision freeze:
  - do not split into a separate benchmark service yet
  - 500 to 1000-site ops remain planned, not implemented

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
- The share/report action layer now better matches reality: share snapshot is a real action, and delivered-report copy no longer overpromises direct access.
- Launch readiness is still gated by operational security closure, not by missing core product code.
- Deep-audit core scale plumbing is implemented; remaining launch risk is operational/security closure, not DA-004 core code.
- Retrieval analytics are implemented for deterministic and Promptfoo-backed runs, but RAGAS runtime remains intentionally unshipped.
