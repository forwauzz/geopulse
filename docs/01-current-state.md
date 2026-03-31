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

## Current planning stream

A separate planning-only content-machine stream now exists on branch `planning/content-machine-v1`.

Current truth:
- planning docs still exist on `planning/content-machine-v1`
- the first implementation slice is now in repo: canonical content tables, downstream delivery records, a server-side admin data helper, and a minimal `/dashboard/content` inventory page
- the second implementation slice is now in repo too: provider-control records for downstream destinations, a destination admin helper, and feature-flag controls for newsletter providers inside `/dashboard/content`
- the third implementation slice is now in repo too: local draft import from `PLAYBOOK/content-machine-drafts` into canonical `content_items` via an admin action in `/dashboard/content`
- the fourth implementation slice is now in repo too: a first content-item detail/editor page at `/dashboard/content/[contentId]` for reviewing and updating imported records
- the fifth implementation slice is now in repo too: a provider adapter contract, first Kit adapter, and a draft-push action from the content-item page into the selected destination
- no public blog runtime or full publish workflow is shipped yet
- the repo now has a first-pass product marketing context, founder voice draft, social-research synthesis, blog LLM-readiness spec, content-machine blueprint, and content-writing skill spec
- the implementation direction remains site-first and LLM-searchability-aware so GEO-Pulse does not create a visibility product while publishing weakly extractable content on its own domain

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
- Layer One report-rewriter contract freeze:
  - the repo now has a frozen section-order contract for future Layer One report rewrites
  - this is a writing-contract artifact only, not a new prompt/runtime implementation yet
- Layer One evidence-discipline freeze:
  - the repo now has frozen claim-boundary rules for future Layer One report rewrites
  - this is still a writing-policy artifact only, not a new prompt/runtime implementation yet
- Layer One tone and verbosity freeze:
  - the repo now has frozen tone rules for future Layer One report rewrites
  - the intended output is plain, direct, and operator-trustworthy rather than consultancy-styled
- Layer One recommendation-format freeze:
  - the repo now has a frozen action-card shape for future Layer One report rewrites
  - priority actions should now resolve into issue, why it matters, action, priority, and confidence
- Layer One ambiguous-signal wording freeze:
  - the repo now has frozen wording patterns for future Layer One report rewrites when findings are real but not fully diagnostic
  - examples include `402/403`, low-confidence extraction, partial schema, stale dates, and mixed page-level outcomes
- Layer One rewrite-prompt path:
  - the repo now includes a local script that builds the constrained Layer One rewrite prompt from existing report markdown
  - this is the first actual implementation seam for the report rewriter rules; the product report runtime itself is still deterministic
- Layer One gold rewrite fixture:
  - the repo now includes a first gold-standard rewritten Layer One report fixture for `cllcenter.com`
  - this exists to anchor future prompt tuning against a concrete target output rather than abstract style rules only
- Automatic Layer One report eval writing:
  - generated deep-audit markdown now writes a deterministic `report_eval_runs` row automatically after report creation
  - admin eval analytics can now show real Layer One report history over time under a dedicated `layer_one_report` framework
- Layer One internal rewritten-artifact contract freeze:
  - the repo now has a frozen rule that any rewritten Layer One report should begin as a second internal artifact, not an immediate replacement for the deterministic paid report
  - the next implementation step should store and evaluate both versions before any customer-facing default is changed
- Report Design Phase A — design contracts frozen (RD-001 through RD-006 were docs only; RD-007 is the first tiny code-facing enabling slice):
  - team-owner taxonomy: all 22 checks mapped to Engineering / Content / Brand / Product (`PLAYBOOK/rd-001-team-owner-taxonomy-v1.md`)
  - executive brief contract: CRO-facing opening section spec (`PLAYBOOK/rd-002-executive-brief-contract-v1.md`)
  - immediate wins format: ticket-style pre-filtered fast-start section spec (`PLAYBOOK/rd-006-immediate-wins-format-v1.md`)
  - section order contract: new body order and appendix split frozen (`PLAYBOOK/rd-005-section-order-contract-v1.md`)
  - "What AI-Ready Leaders Do Differently" contract: audit-derived best-practice framing spec (`PLAYBOOK/rd-004-ai-ready-leaders-contract-v1.md`)
  - Team Action Map (rd-010) is the only remaining Phase A section still pending
  - RD-007 (first code slice): standalone `TeamOwner` type + `TEAM_OWNER_MAP` + `getTeamOwner` helper in `workers/report/team-owner-map.ts`; no customer-facing behavior changed; 5/5 tests pass
  - no report output, PDF, or web UI changed yet; Phase B implements these contracts
- Layer One internal rewritten-artifact implementation:
  - deep-audit report generation can now optionally create a second internal rewritten markdown artifact after the deterministic markdown is built
  - the rewritten artifact is best-effort, separately stored, separately evaluated, and does not replace the paid report by default
- Layer One report internal comparison access:
  - admin eval analytics now link report rows to a report-detail page
  - that page groups sibling `report_eval_runs` by `scan_id` so deterministic and rewritten report variants can be compared side-by-side for one scan
- Layer One operator judgment seam:
  - the report-detail admin page now supports `better`, `worse`, or `unclear` judgments on the rewritten report variant
  - judgments are stored in `report_eval_runs.metadata` so repeated internal review can build an evidence base before any paid-report default changes
- Report Design Phase B enabling seam:
  - normalized report issue rows now carry `teamOwner` via the standalone RD-007 map
  - this is a data-shape propagation step only; no customer-facing report sections use owner grouping yet
- Report Design canonical payload propagation:
  - the canonical deep-audit report payload now preserves `teamOwner` on highlighted issues, all issues, and page-level issue rows
  - this still does not change customer-facing report structure; it only makes owner data available deeper in the report pipeline
- Report Design internal Immediate Wins seam:
  - the canonical deep-audit report payload now derives an internal-only `immediateWins` block from owner-aware issues
  - the markdown report now renders a first deterministic `Immediate Wins` section from that block
  - this is the first owner-aware customer-facing report section; broader report-order, PDF, and web-viewer redesign work is still pending
- Report Design per-page markdown cleanup:
  - passed checks in the per-page checklist no longer print `Fix:` lines
  - the per-page checklist now shows only non-passing rows
  - this reduces noisy, contradictory report copy without changing scoring, findings, or report order
- Report Design bounded low-confidence wording:
  - customer-facing report rendering now rewrites raw low-confidence transport tokens like `http_403` into bounded explanatory wording
  - the underlying audit data is unchanged; only customer-facing markdown/PDF phrasing was softened
- Report Design metadata-guidance cleanup:
  - broken title-length guidance like `1070` has been corrected at the audit-check source
  - customer-facing reports now inherit a readable `10-70` title range from the underlying check output

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
  - explicit multi-window recurrence command for freezing recurring winners/laggards from a small chosen window set
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
 - law-firms fit analysis freeze:
   - the first 21-domain `law_firms` lane is now explicitly understood as a mixed cohort, not one coherent law-firm frame
   - the current query set mixes multiple legal-service intents against firms with very different specialties
   - the broad lane remains useful for internal directional collection, but not yet as a precision methodology lane
 - law-firms replacement-target freeze:
   - the first narrow replacement lane should target `business_counsel / biglaw / enterprise`
   - the next query-set rewrite should serve that subgroup only
 - law-firms narrow query-set draft freeze:
   - the first replacement query-set draft now exists for the `business_counsel / biglaw / enterprise` subgroup
   - it is a frozen draft fixture only, not yet seeded or scheduled
 - law-firms narrow target-domain freeze:
   - the first replacement lane now has an explicit 17-domain target list under `law_firms_business_counsel_v1`
   - the broad 21-domain lane remains unchanged for comparability
 - law-firms narrow seed path freeze:
   - the first replacement query-set draft now has an explicit seed command
   - this still does not make the narrow lane live until scheduling is configured separately
   - the seeded draft query-set record now exists:
     `9910b5ac-ade6-42be-9dca-9b85c04e4469`
 - law-firms narrow preview path:
   - the scheduler can now narrow by explicit canonical-domain allowlist
   - this enables previewing the frozen 17-domain business-counsel cohort without disturbing the live broad lane
 - first live narrow law-firms lane:
   - `law-firms-business-counsel-v1` completed its first 17-domain window cleanly
   - the narrower frame produced cleaner grounded-vs-ungrounded signal than the broad mixed lane
   - exact-page quality still remained non-gating
 - primary law-firms benchmark lens:
   - after three comparable windows, `law-firms-business-counsel-v1` is now the primary internal law-firms benchmark frame
   - the original broad `law-firms-p1-v1` lane is now a secondary legacy comparison frame
 - narrow-lane recurrence review:
   - the repo now includes a small terminal-only recurrence helper for explicit multi-window review on the current schedule frame
   - this is intended for evidence review across a few comparable windows, not a new benchmark subsystem
 - schedule run-now override:
   - the scheduler now supports `--window-date YYYY-MM-DDTHH` for controlled internal creation of the next benchmark window without waiting for cron time to advance

### Marketing attribution
- event ingestion
- UTM/session capture
- attribution views
- weekly email reporting

### Content machine foundation
- canonical content inventory tables:
  - `public.content_items`
  - `public.content_distribution_deliveries`
- downstream provider registry:
  - `public.content_distribution_destinations`
- service-role-only storage for:
  - content ids
  - briefs and drafts
  - target persona / topic / CTA metadata
  - downstream newsletter or syndication delivery records
- server-side admin helper:
  - `lib/server/content-admin-data.ts`
- server-side destination helper:
  - `lib/server/content-destination-admin-data.ts`
- minimal admin inventory UI:
  - `/dashboard/content`
- provider-control panel inside `/dashboard/content`:
  - explicit enabled / disabled state
  - paid-plan requirement visibility
  - API/scheduling/archive capability visibility
  - operator-facing availability reason
- local draft import inside `/dashboard/content`:
  - reads `PLAYBOOK/content-machine-drafts`
  - groups brief / article / newsletter assets by slug
  - derives stable `content_id` values
  - upserts idempotently into canonical content storage
- first content detail/editor page:
  - `/dashboard/content/[contentId]`
  - basic metadata editing
  - brief/draft markdown editing
  - delivery visibility per content item
- first destination adapter seam:
  - provider adapter contract
  - first Kit implementation
  - draft push from `/dashboard/content/[contentId]`
  - downstream delivery record persisted after push
  - computed destination readiness from both feature flags and live environment state
  - structured push events written into the admin logs stream for operator debugging
- dashboard admin navigation now links to the content inventory

## Current Blockers

These still block launch closure:
- `P4-003` SPF / DKIM / DMARC operator setup
- `P4-006` launch security sign-off
- `P4-004` WAF remains operationally unresolved (`deferred / mitigated` in repo)

Current domain truth:
- the new production domain is now `getgeopulse.com`
- repo production config now points at `https://getgeopulse.com/`
- buying the domain removes the old purchase blocker, but launch is still waiting on DNS/email/WAF/operator evidence

## Most Important Truths

- The product is materially real, not a stub.
- The results/report UX now reflects real payment/report state instead of optimistic query-string messaging.
- The share/report action layer now better matches reality: share snapshot is a real action, and delivered-report copy no longer overpromises direct access.
- Launch readiness is still gated by operational security closure, not by missing core product code.
- Deep-audit core scale plumbing is implemented; remaining launch risk is operational/security closure, not DA-004 core code.
- Retrieval analytics are implemented for deterministic and Promptfoo-backed runs, but RAGAS runtime remains intentionally unshipped.
- The first live `law_firms` benchmark lane is operationally real, but its current frame is over-mixed: many domain/query pairs are low-fit by design because the cohort mixes enterprise firms, immigration, divorce, PI, and employment specialists under one broad query set.
- The first replacement benchmark lane should not try to fix "all law firms" at once. The next precision slice is now explicitly anchored on the `business_counsel / biglaw / enterprise` subgroup.
- The first replacement query-set draft is now frozen as a methodology artifact. It narrows the frame to enterprise/business-law buying intent, but it is not live until the exact target cohort is frozen too.
- The first replacement cohort is now frozen too: 17 business-counsel-oriented domains from the current priority-1 lane. The next live experiment should be launched as a separate narrow frame, not by mutating the current broad lane.
- The first narrow live law-firms experiment now validates the methodology direction: narrowing the cohort/query frame improved signal quality even though page-level provenance behavior did not change yet.
- The law-firms benchmark strategy is now clearer: the narrow business-counsel lane is the main internal lens, and the broad lane should no longer drive methodology decisions by itself.
- Layer One report quality improvement should start at the rewrite layer, not retrieval. The first frozen step is now the report contract: confirmed findings, bounded implications, priority actions, optional advanced GEO ideas, and open questions should be separated instead of blended.
- Layer One report quality now also has a frozen evidence boundary: rewritten reports should not invent market data, hard-diagnose weak signals, or present optional GEO strategy as confirmed audit fact.
- Layer One report quality also now has a frozen tone boundary: future rewrites should open with the site and findings, use plain operational language, and cut inflated industry framing.
- Layer One report quality also now has a frozen action boundary: priority recommendations should be compact, concrete, and mechanically consistent instead of mixing strategy prose with implementation steps.
- Layer One report quality also now has a frozen ambiguity boundary: future rewrites should describe uncertain findings with observed signal, bounded implication, and verification step instead of jumping to root cause.
- The first implementation step for report hardening is now in repo too: a reusable Layer One rewrite-prompt builder exists for existing markdown reports, while customer-facing report generation remains deterministic.
- Deep-audit report viewing no longer depends on the browser fetching the raw markdown file URL directly. The results/report UI now uses a same-origin markdown proxy route, which also provides a stable markdown download path for delivered reports.
