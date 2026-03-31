# Completion Log
> Written by: QA agent (evidence entries) + Orchestrator (verification decisions)
> This file is append-only. Never edit past entries.
> A task is not done until it has an entry here AND Orchestrator has marked it ACCEPTED.

---

### 2026-03-30 - RD-007 Standalone team-owner mapping artifact

Added the first code-facing implementation artifact from the Phase A design: a standalone team-owner lookup module derived directly from the RD-001 taxonomy.

Files changed:
- `workers/report/team-owner-map.ts` (new)
- `workers/report/team-owner-map.test.ts` (new)
- `agents/memory/PROJECT_STATE.md` (RD-007 added and marked DONE)

What was implemented:
- `TeamOwner` type: `'Engineering' | 'Content' | 'Brand' | 'Product'`
- `TEAM_OWNER_MAP`: frozen `Record<string, TeamOwner>` keyed by check ID, covers all 22 currently implemented checks (11 Engineering, 9 Content, 2 Brand, 0 Product)
- `getTeamOwner(checkId)`: returns `TeamOwner | undefined`; undefined for any check ID not in the map
- No changes to `audit.ts` interfaces, any check files, payload types, or any existing runtime path
- File lives in `workers/report/` (report-framing concern, not scan-engine concern)

What was not changed:
- No customer-facing report behavior changed
- No interfaces modified
- No existing files touched

Verification:
- `npm run type-check` → 0 errors
- `npx vitest run workers/report/team-owner-map.test.ts` → 5/5 tests pass
  - all 22 known check IDs covered
  - all entries map to valid TeamOwner values
  - correct counts per owner (11/9/2/0)
  - unknown IDs return undefined

---

### 2026-03-30 - RD-004 "What AI-Ready Leaders Do Differently" contract

Froze the content rules and format for the audit-derived best-practices context section of the paid report.

Files changed:
- `PLAYBOOK/rd-004-ai-ready-leaders-contract-v1.md` (new)
- `agents/memory/PROJECT_STATE.md` (RD-004 status → DONE)

What was decided:
- Section position: 5th in the customer-facing body (per RD-005 order)
- Core framing constraint: "AI-ready sites" language derives the positive standard from each check's own pass condition — not from external competitor measurement
- Required format per gap block: AI-ready sites / This site / Gap — three fields, bounded language throughout
- Selection: weight ≥ 6, not LOW_CONFIDENCE, failed or WARNING; 3–6 blocks, ordered by weight descending
- Prohibited: named competitors, percentage statistics, benchmark quartile claims, "industry leaders" framing unless measured
- Section is context-only; no action steps (those live in Immediate Wins and Team Action Map)
- Full illustrative example included with three blocks (JSON-LD, extractability, E-E-A-T)

Verification:
- Docs-only slice; no runtime or code changes; no type-check required

---

### 2026-03-30 - RD-005 Section order contract

Froze the new section order for the paid deep-audit report — the architectural reorganization that moves CRO-relevant narrative to the front and all technical detail to a clearly labeled appendix.

Files changed:
- `PLAYBOOK/rd-005-section-order-contract-v1.md` (new)
- `agents/memory/PROJECT_STATE.md` (RD-005 status → DONE)

What was decided:
- New body order (6 sections): Executive Brief → Immediate Wins → Team Action Map → Score Summary → "What AI-Ready Leaders Do Differently" → Coverage Summary
- Appendix (A–E): Score Breakdown (all checks) → Priority Action Plan → Pages Scanned → Per-Page Checklist → Technical Appendix
- No technical data is deleted — all existing sections survive as appendix material
- Appendix labeled: "For Engineering and SEO Teams"
- Two body sections are placeholders pending their own slices: Team Action Map (rd-010) and "What AI-Ready Leaders Do Differently" (rd-004)
- Layer One rewriter contract section order will need a future update to align — noted in this doc; both co-exist for now
- This contract is the specification Phase B implementation tasks will implement; no runtime code changes in this slice

Verification:
- Docs-only slice; no runtime or code changes; no type-check required

---

### 2026-03-30 - RD-006 Immediate Wins format

Froze the format and selection rules for the Immediate Wins section — the pre-filtered, ticket-style fast-start layer of the paid report.

Files changed:
- `PLAYBOOK/rd-006-immediate-wins-format-v1.md` (new)
- `agents/memory/PROJECT_STATE.md` (RD-006 status → DONE)

What was decided:
- Selection criteria: failed or WARNING status AND weight ≥ 5 AND confidence not LOW_CONFIDENCE; top 3-5 by weight descending
- Disqualifiers: LOW_CONFIDENCE, BLOCKED, NOT_EVALUATED, weight < 5, or fix requires cross-team unblocking before work can start
- Five required fields per win: What (imperative voice), Who (single team owner from RD-001), Why (one sentence, audit-tied, bounded), How (specific enough to act without reading further), Effort (Quick / Moderate only)
- Format is implementation-ticket style, not audit-finding style — "Add", "Update", "Remove", not "X needs improvement"
- Immediate Wins is not a replacement for Priority Actions; both exist with intentional overlap — wins are the fast-access pre-filtered version
- Full illustrative example included with three wins (robots.txt, JSON-LD, Q&A content) to make format concrete

Verification:
- Docs-only slice; no runtime or code changes; no type-check required
- Format validated for consistency with `layer-one-report-recommendation-format-v1.md` action card pattern

---

### 2026-03-30 - RD-002 Executive Brief contract

Froze the required shape and content rules for the Executive Brief — the new opening section of the paid report designed for CRO-level readers.

Files changed:
- `PLAYBOOK/rd-002-executive-brief-contract-v1.md` (new)
- `agents/memory/PROJECT_STATE.md` (RD-002 status → DONE)

What was decided:
- Executive Brief has four required elements in fixed order: (1) site condition statement, (2) three-finding summary with team owner labels, (3) single primary action directive naming the responsible owner, (4) directional exposure statement
- Three-finding summary uses the four owners from RD-001 exactly; each bullet names owner, issue, and bounded consequence
- Primary action directive maps to the highest-weight failed check; one directive only, no list
- Directional exposure statement: no numeric estimates, no revenue projections, no invented statistics — bounded language ("suggests", "may", "likely") tied to audit findings
- Maximum 300 words; works as a standalone document if extracted
- Replaces the existing executive summary section; transition to happen in RD-005
- Full illustrative example included in the doc with real domain (techehealthservices.com) to make expectations concrete

Verification:
- Docs-only slice; no runtime or code changes; no type-check required
- Contract reviewed against all five existing Layer One PLAYBOOK docs for consistency

---

### 2026-03-30 - RD-001 Team-owner taxonomy

Created the first Report Design Phase A design document: team-owner taxonomy mapping all 22 implemented audit checks to four owners (Engineering, Content, Brand, Product).

Files changed:
- `PLAYBOOK/rd-001-team-owner-taxonomy-v1.md` (new)
- `agents/memory/PROJECT_STATE.md` (added Report Design task registry section)

What was decided:
- 11 checks → Engineering (server config, technical directives, infrastructure): `ai-crawler-access`, `llms-txt`, `json-ld`, `schema-types`, `security-headers`, `snippet-eligibility`, `canonical`, `robots-meta`, `https-only`, `viewport`, `html-size` — combined weight 56 (50.5%)
- 9 checks → Content (writing, editorial structure, page maintenance): `llm-qa-pattern`, `llm-extractability`, `heading-structure`, `title-tag`, `meta-description`, `freshness`, `internal-links`, `external-links`, `alt-text` — combined weight 45 (40.5%)
- 2 checks → Brand (organizational identity, credibility signals, brand representation surfaces): `eeat-signals`, `open-graph` — combined weight 10 (9.0%)
- 0 checks → Product (gap noted): no conversion readiness or CTA checks exist yet; `conversion_readiness` category is in the scoring system but unimplemented
- Ambiguous assignments are documented with decision rationale in the taxonomy file
- This is docs-only; no runtime check logic, no category scoring, no PDF/UI changed

Verification:
- No code changes; no type-check required for this slice
- Document reviewed against all 22 check files in `workers/scan-engine/checks/`

---

### 2026-03-30 - Deep-audit markdown delivery fix

Added `app/api/scans/[id]/report-markdown/route.ts` and switched the report viewer to load markdown through the app instead of browser-fetching the raw storage URL directly. Also added a direct markdown download action in the delivered-report UI.

Current truth: `View report` no longer depends on client-side fetches to the raw markdown object URL, so delivered markdown reports are less likely to fail because of public object access or CORS behavior.

### 2026-03-30 - Layer One internal rewritten-artifact contract freeze

Added `PLAYBOOK/layer-one-internal-rewrite-artifact-v1.md` to freeze the next implementation boundary for paid-report improvement.

Current truth:
- the deterministic paid report remains the customer-facing source of truth for now
- any rewritten Layer One markdown should begin as a second internal artifact
- the next implementation step should store and evaluate both artifacts side-by-side before any paid default is changed

### 2026-03-30 - Layer One internal rewritten-artifact implementation

Implemented the first internal rewritten-report generation seam in the paid deep-audit pipeline.

Files:
- `lib/server/layer-one-report-internal-rewrite.ts`
- `lib/server/layer-one-report-internal-rewrite.test.ts`
- `lib/server/report-eval-writer.ts`
- `lib/server/report-eval-writer.test.ts`
- `lib/server/cf-env.ts`
- `workers/report/r2-report-storage.ts`
- `workers/queue/report-queue-consumer.ts`
- `docs/06-environment-and-secrets.md`

What changed:
- added a best-effort internal Layer One rewrite helper that reuses the frozen rewrite prompt contract
- gated runtime execution behind `DEEP_AUDIT_INTERNAL_REWRITE_ENABLED`
- allowed optional model override via `DEEP_AUDIT_INTERNAL_REWRITE_MODEL`
- stored rewritten markdown separately at `deep-audits/<scanId>/report.rewritten.md`
- wrote a second `report_eval_runs` row for the rewritten artifact under the existing `layer_one_report` framework
- kept deterministic paid report delivery unchanged when rewrite is disabled or fails

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/layer-one-report-internal-rewrite.test.ts lib/server/report-eval-writer.test.ts workers/report/deep-audit-report.test.ts lib/server/stripe/checkout-completed.test.ts`

### 2026-03-30 - Layer One report internal comparison access

Added the first admin comparison surface for deterministic vs rewritten report evals.

Files:
- `app/dashboard/evals/report/[id]/page.tsx`
- `app/dashboard/evals/page.tsx`

What changed:
- `layer_one_report` rows in the main eval analytics table now link to a report detail page
- the new detail page loads one `report_eval_runs` row plus sibling report-eval rows for the same `scan_id`
- deterministic and internal rewritten variants are compared side-by-side on score and key metrics
- run metadata and available artifact links are visible in one place for operator review

Verification:
- `npm.cmd run type-check`

### 2026-03-30 - Layer One operator judgment seam

Added the first lightweight persistent review loop for rewritten report quality.

Files:
- `app/dashboard/evals/actions.ts`
- `app/dashboard/evals/report/[id]/page.tsx`

What changed:
- report detail now supports `better`, `worse`, and `unclear` judgments for rewritten report variants
- judgments are stored in `report_eval_runs.metadata`
- the comparison page now shows the latest judgment, timestamp, and judging admin email when available

Verification:
- `npm.cmd run type-check`

### 2026-03-30 - Report Design teamOwner propagation slice

Propagated `teamOwner` into normalized report issue rows using the standalone RD-007 lookup map.

Files:
- `workers/report/deep-audit-report-helpers.ts`
- `workers/report/deep-audit-report-helpers.test.ts`
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- `IssueRow` now includes optional `teamOwner`
- `parseIssues(...)` now normalizes issue rows and attaches owner metadata from `getTeamOwner(checkId)`
- markdown generation now uses the shared issue parser instead of its own duplicate local parser
- no report section order, PDF layout, web UI, or customer-facing output changed in this slice

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/deep-audit-report-helpers.test.ts workers/report/deep-audit-report.test.ts workers/report/team-owner-map.test.ts`

### 2026-03-30 - Report Design canonical payload teamOwner propagation

Carried `teamOwner` through the canonical deep-audit report payload.

Files:
- `workers/report/deep-audit-report-payload.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- page-level `issuesJson` in the canonical payload now stores normalized `IssueRow[]` instead of raw unknown values
- `highlightedIssues` and `allIssues` in the canonical payload now store normalized `IssueRow[]`
- payload construction now preserves `teamOwner` across the report data model instead of dropping it after helper parsing
- no customer-facing report section order, PDF layout, or web UI changed in this slice

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/deep-audit-report-helpers.test.ts workers/report/deep-audit-report.test.ts workers/report/team-owner-map.test.ts`

### 2026-03-30 - Report Design internal Immediate Wins payload seam

Added the first owner-aware ticket-selection seam to the canonical deep-audit payload.

Files:
- `workers/report/immediate-wins.ts`
- `workers/report/immediate-wins.test.ts`
- `workers/report/deep-audit-report-payload.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- added `buildImmediateWins(...)`, which selects up to 5 owner-aware, medium/high-weight, non-low-confidence failed or warning issues
- added a compact `ImmediateWinPayload` shape with `what / who / why / how / effort`
- extended the canonical deep-audit payload with `immediateWins`
- kept the section internal-only at this stage; no markdown, PDF, or web-render change happened in this slice

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/immediate-wins.test.ts workers/report/deep-audit-report.test.ts workers/report/deep-audit-report-helpers.test.ts workers/report/team-owner-map.test.ts`

### 2026-03-30 - Report Design deterministic Immediate Wins markdown slice

Rendered the first owner-aware report section into the deterministic paid markdown report.

Files:
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- added a deterministic `## Immediate Wins` section after the existing executive summary
- each win now renders as a compact ticket-style block with `Who`, `Why`, `How`, and `Effort`
- reused the already-derived owner-aware payload data instead of introducing a new scoring or prompt path
- kept the broader report order, PDF layout, and web report viewer structure unchanged

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/immediate-wins.test.ts workers/report/deep-audit-report.test.ts workers/report/deep-audit-report-helpers.test.ts workers/report/team-owner-map.test.ts`

### 2026-03-30 - Report Design per-page markdown cleanup slice

Removed contradictory `Fix:` lines from passed checks in the per-page markdown checklist.

Files:
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- per-page checklist rows now show `Fix:` only for non-passing checks
- passed checks still keep their finding text and status, but no longer show action copy that implies something is broken
- this is a narrow trust/readability cleanup only; no scoring, payload selection, PDF output, or report order changed

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/deep-audit-report.test.ts`

### 2026-03-30 - Report Design bounded low-confidence wording slice

Removed raw transport-token leakage from customer-facing report wording.

Files:
- `workers/report/deep-audit-report-helpers.ts`
- `workers/report/deep-audit-report-helpers.test.ts`
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/build-deep-audit-pdf.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- added a shared `customerFacingFinding(...)` helper for report rendering
- raw tokens like `http_403` are now rewritten into bounded wording when surfaced in markdown or PDF
- low-confidence access/delivery failures now read as verification-needed interference, not as direct content diagnosis
- underlying stored audit findings remain unchanged; this is a presentation-layer trust fix only

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/deep-audit-report.test.ts workers/report/deep-audit-report-helpers.test.ts`

### 2026-03-30 - Report Design metadata-guidance cleanup slice

Corrected broken title-length guidance at the audit-check source.

Files:
- `workers/scan-engine/checks/check-title.ts`
- `workers/scan-engine/check-title.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- replaced the corrupted title-length guidance separator in the title check output
- customer-facing reports now inherit `aim for 10-70` instead of broken `1070`-style text
- added a regression test directly at the check level so this string does not silently break again

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/scan-engine/check-title.test.ts`

### 2026-03-30 - Report Design per-page markdown compression slice

Reduced report noise by limiting the per-page checklist to non-passing rows only.

Files:
- `workers/report/build-deep-audit-markdown.ts`
- `workers/report/deep-audit-report.test.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- the markdown per-page checklist now filters out `PASS` rows
- pages with no non-passing items now render a compact placeholder instead of a full pass list
- this keeps page-level evidence visible while removing one of the largest remaining sources of repetition

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run workers/report/deep-audit-report.test.ts`

### 2026-03-30 - Production domain cutover prep slice

Aligned repo production config and operator runbook to the newly purchased `getgeopulse.com` domain.

Files:
- `wrangler.jsonc`
- `PLAYBOOK/getgeopulse-domain-cutover-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- production `NEXT_PUBLIC_APP_URL` now points to `https://getgeopulse.com/`
- added a dedicated operator checklist for Cloudflare custom-domain routing, Turnstile hostname allowlist, Supabase Auth redirects, Stripe webhook/return URLs, Resend DNS, and WAF follow-up
- updated launch-state docs to reflect that domain purchase is no longer the blocker; the remaining blocker is DNS / custom-domain / evidence completion
- recorded explicitly that buying the domain does not close `P4-004` by itself

Verification:
- docs/config slice only
- no runtime code-path logic changed beyond the production app URL constant in `wrangler.jsonc`

## 2026-03-29 - two-window benchmark decision freeze

Froze the operator decision after two comparable `law_firms-p1-v1` windows on `gemini-2.5-flash-lite`.

Files changed:
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that two comparable windows now show the same high-level pattern:
  - clean paired collection
  - meaningful grounded-vs-ungrounded citation-rate deltas
  - `0%` exact-page quality across the lane
  - domain-level grounded attribution in targeted diagnostics
- Froze the lane interpretation as `domain-level grounded attribution` for now.
- Froze the near-term operator rule:
  - keep collecting comparable windows
  - keep `exact_page_quality_rate` visible but non-gating
  - do not prioritize provenance-matcher work for this lane
  - do not widen scale or change methodology yet

Verification:
- This was a docs-only decision freeze based on already verified run evidence and diagnostics.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - law-firms fit analysis freeze

Froze the first manual taxonomy and fit analysis for the current 21-domain `law_firms` priority-1 lane.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that the current `law_firms` lane is a mixed cohort rather than one coherent law-firm comparison frame.
- Grouped the 21 live domains into likely sub-cohort buckets:
  - business counsel / biglaw / enterprise
  - employment / labor
  - immigration specialist
  - family law / divorce
  - personal injury / consumer litigation
- Recorded that the frozen `law-firms-p1-core v1` query set mixes multiple legal-service intents, so many current domain/query pairs are low-fit by design.
- Froze the new interpretation rule: future redesign work should treat cohort split and query-set redesign as coupled work, while the current broad lane stays unchanged for comparability.

Verification:
- This was a docs-only analysis freeze based on the current seed file, the frozen query-set fixture, the grounding prompt/evidence path, and the two completed benchmark windows.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - law-firms replacement-target freeze

Froze the first narrow replacement target for the `law_firms` benchmark redesign.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that the first narrow replacement lane should target the `business_counsel / biglaw / enterprise` subgroup.
- Recorded the initial target-domain list from the current 21-domain live lane.
- Froze the rule for the next slice: the next law-firms query-set rewrite should serve that subgroup only, rather than trying to improve the whole mixed lane at once.

Verification:
- This was a docs-only methodology decision based on the already-frozen fit analysis.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - business-counsel narrow query-set draft freeze

Froze the first narrow replacement query-set draft for the `business_counsel / biglaw / enterprise` subgroup.

Files changed:
- `eval/fixtures/benchmark-law-firms-business-counsel-v1-query-set.json`
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Added a draft-only query-set fixture for the first narrow replacement lane.
- Kept the fixture intentionally narrow:
  - business-buyer intent
  - enterprise/business-law framing
  - no PI, divorce, immigration-only, workers-comp, or estate-planning prompts
- Froze the operational rule that this draft is not yet seeded or scheduled.
- Recorded that the next methodology slice should freeze the exact target-domain list before the draft becomes a live lane candidate.

Verification:
- This was a fixture-and-docs methodology slice only.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - business-counsel target-domain freeze

Froze the exact target-domain list for the first narrow `business_counsel / biglaw / enterprise` replacement lane.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded the explicit frozen cohort identity for the first narrow lane:
  - `law_firms_business_counsel_v1`
  - 17 domains
- Recorded the deliberate exclusions from the current 21-domain broad lane:
  - `forthepeople.com`
  - `cordellcordell.com`
  - `fragomen.com`
  - `seyfarth.com`
- Froze the operational rule that the next narrow live experiment should launch as a separate frame rather than mutating the existing broad lane.

Verification:
- This was a docs-only methodology slice based on the already-frozen fit analysis and narrow query-set draft.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - business-counsel query-set seed path

Added the explicit seed command for the first narrow `business_counsel / biglaw / enterprise` draft query set.

Files changed:
- `package.json`
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`

What changed:
- Added `npm run benchmark:seed:query-set:business-counsel`.
- Pointed the command at `eval/fixtures/benchmark-law-firms-business-counsel-v1-query-set.json`.
- Recorded the operator rule that this command only creates the draft query-set record and does not make the narrow lane live on its own.

Verification:
- This was a small script-alias and docs slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - business-counsel query-set seeded

Seeded the first narrow `business_counsel / biglaw / enterprise` draft query-set record.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`

What changed:
- Recorded the successful seed result for the narrow draft query set.
- Froze the returned record id for later narrow-lane preview and scheduling work:
  - `query_set_id: 9910b5ac-ade6-42be-9dca-9b85c04e4469`
  - `query_count: 6`

Verification:
- Operator command:
  - `npm run benchmark:seed:query-set:business-counsel`
- Output confirmed:
  - `benchmark query set seed ok: query_set_id: 9910b5ac-ade6-42be-9dca-9b85c04e4469 query_count: 6`
- No additional type-check, Vitest, or Playwright was needed for this evidence-only slice.

## 2026-03-29 - benchmark schedule domain-allowlist slice

Added an optional canonical-domain allowlist to the existing benchmark scheduler so narrow cohort previews can be exact without disturbing the live broad lane.

Files changed:
- `lib/server/benchmark-repository.ts`
- `lib/server/benchmark-schedule.ts`
- `lib/server/benchmark-schedule.test.ts`
- `types/geo-pulse-env.d.ts`
- `docs/06-environment-and-secrets.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `docs/01-current-state.md`

What changed:
- Added `BENCHMARK_SCHEDULE_DOMAINS` as an optional comma-separated canonical-domain allowlist.
- Extended the scheduler preview/execution seam to pass the explicit domain allowlist through the existing repository filter.
- Kept the behavior opt-in so the broad live lane is unchanged unless the new env var is set.
- Recorded the narrow preview rule for the first `business_counsel / biglaw / enterprise` experiment.

Verification:
- Code-path verification is covered by updated `lib/server/benchmark-schedule.test.ts`.
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - first business-counsel narrow-lane result freeze

Froze the first live result for the narrow `business_counsel / biglaw / enterprise` law-firms lane.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that the first live `law-firms-business-counsel-v1` window completed cleanly:
  - `17` paired domains
  - `34` launched runs
  - `0` failures
- Recorded that the narrower frame produced cleaner grounded-vs-ungrounded signal than the broad mixed lane.
- Recorded that `exact-page quality` still remained `0%`, so the narrow-lane win is methodology fit, not a provenance-depth change.
- Froze the next operator rule: keep collecting repeated comparable windows on this narrow lane before changing prompt/model/evidence-depth or opening a second narrow law-firms sub-cohort.

Verification:
- Operator commands:
  - `npm run benchmark:schedule:run-now`
  - `npm run benchmark:schedule:summary -- --window-date 2026-03-30T00`
  - `npm run benchmark:schedule:outliers -- --window-date 2026-03-30T00`
- Output confirmed:
  - `schedule_version: law-firms-business-counsel-v1`
  - `domain_count: 17`
  - `launched_runs: 34`
  - `failed_runs: 0`
  - cleaner grounded citation-rate deltas under the narrow frame
- No type-check, Vitest, or Playwright was needed for this evidence-only decision slice.

## 2026-03-29 - primary law-firms lens freeze

Froze the primary internal law-firms benchmark lens after three comparable narrow-lane windows.

Files changed:
- `PLAYBOOK/law-firms-p1-fit-analysis-v1.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that `law-firms-business-counsel-v1` is now the primary internal law-firms benchmark frame.
- Demoted the original broad `law-firms-p1-v1` lane to a secondary legacy comparison frame.
- Recorded the first recurring narrow-lane winner set:
  - `lw.com`
  - `perkinscoie.com`
  - `fr.com`
  - `kirkland.com`
  - `sidley.com`
- Recorded the first recurring weaker grounded set:
  - `gibsondunn.com`
  - `btlaw.com`
  - `cozen.com`
  - `duanemorris.com`
  - `goodwinlaw.com`
- Froze the next operator rule: keep collecting the narrow lane unchanged and do not open a second narrow law-firms sub-cohort yet.

Verification:
- Operator evidence came from three completed narrow-lane windows:
  - `2026-03-30T00`
  - `2026-03-30T12`
  - `2026-03-31T00`
- Each completed with `17/17` paired domains and `0` failures.
- No type-check, Vitest, or Playwright was needed for this evidence-only decision slice.

## 2026-03-29 - schedule run-now window override

Added a small override to the schedule run-now command so the next benchmark window can be created on demand.

Files changed:
- `scripts/benchmark-schedule-run-now.ts`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/06-environment-and-secrets.md`
- `docs/01-current-state.md`

What changed:
- Added `--window-date YYYY-MM-DDTHH` support to `npm run benchmark:schedule:run-now`.
- Kept the change script-local so the scheduler core and cron path remain unchanged.
- Recorded the operator rule that this override is for controlled internal collection only.

Verification:
- `npm.cmd run type-check`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark recurrence review slice

Added a small terminal command for repeated-window benchmark review so recurring winners and laggards can be checked across a chosen set of comparable windows without building new benchmark infrastructure.

Files changed:
- `lib/server/benchmark-schedule-window-summary.ts`
- `lib/server/benchmark-schedule-window-summary.test.ts`
- `scripts/benchmark-schedule-recurrence.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added `buildBenchmarkScheduleMultiWindowSummary(...)` on top of the existing scheduled-window summary seam.
- Added `npm run benchmark:schedule:recurrence -- --window-dates YYYY-MM-DDTHH,YYYY-MM-DDTHH`.
- Kept the helper explicit and read-only:
  - chosen windows only
  - same query set / model / schedule frame
  - terminal output only
  - no new admin route or persistent rollup table
- Updated the benchmark docs so repeated-window review stays evidence-driven and lean.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-schedule-window-summary.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-30 - Layer One report rewriter contract freeze

Froze the first report-shape contract for future Layer One audit rewrites.

Files changed:
- `PLAYBOOK/layer-one-report-rewriter-contract-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added one explicit Layer One report rewriter contract with a fixed section order:
  - executive summary
  - confirmed audit findings
  - likely implications
  - priority actions
  - optional advanced GEO improvements
  - open questions and follow-up checks
- Recorded why this is the first slice:
  - recent rewritten reports can sound strong while blending audit-backed facts with speculative GEO strategy
  - the contract must be frozen before evidence-discipline or tone rules are tightened
- Recorded the next justified slice:
  - `L1-RW-002` evidence-discipline rules

Verification:
- Docs-only design slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - Layer One evidence-discipline freeze

Froze the minimum claim-boundary rules for future Layer One audit rewrites.

Files changed:
- `PLAYBOOK/layer-one-report-evidence-discipline-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added one explicit evidence-discipline document for Layer One rewrites.
- Froze the allowed claim classes:
  - confirmed findings
  - bounded implications
  - optional strategic recommendations
- Froze the prohibited patterns:
  - invented market statistics
  - hard root-cause claims from weak signals
  - fabricated operational specifics not present in the audit
  - overclaimed `2026 standard` language
  - collapsing optional GEO ideas into mandatory remediation
- Recorded the next justified slice:
  - `L1-RW-003` tone and verbosity cleanup

Verification:
- Docs-only design slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - Layer One tone and verbosity freeze

Froze the default presentation rules for future Layer One audit rewrites.

Files changed:
- `PLAYBOOK/layer-one-report-tone-and-verbosity-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added one explicit tone-and-verbosity document for Layer One rewrites.
- Froze the target presentation style:
  - plain
  - direct
  - specific
  - calm
  - operational
- Froze the key anti-patterns:
  - broad industry throat-clearing
  - consultancy-style inflation
  - repeated framing
  - long conclusions that restate the whole report
- Recorded the next justified slice:
  - `L1-RW-004` recommendation formatting

Verification:
- Docs-only design slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - Layer One recommendation-format freeze

Froze the default action-card format for future Layer One audit rewrites.

Files changed:
- `PLAYBOOK/layer-one-report-recommendation-format-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added one explicit recommendation-format document for Layer One rewrites.
- Froze the required action-card fields:
  - issue
  - why it matters
  - action
  - priority
  - confidence
- Froze the allowed `Priority` values:
  - `Immediate`
  - `Near-term`
  - `Later`
- Froze the allowed `Confidence` values:
  - `High`
  - `Medium`
  - `Low`
- Recorded the next justified slice:
  - `L1-RW-005` ambiguous-signal wording patterns

Verification:
- Docs-only design slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - Layer One ambiguous-signal wording freeze

Froze the standard wording patterns for ambiguous Layer One audit signals.

Files changed:
- `PLAYBOOK/layer-one-report-ambiguous-signal-wording-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added one explicit ambiguous-signal wording document for Layer One rewrites.
- Froze the three-step structure for non-binary findings:
  - observed signal
  - bounded implication
  - verification step
- Added standard patterns for:
  - `402/403` and low-confidence extraction
  - partial schema signals
  - stale freshness signals
  - mixed page-level outcomes
- Recorded that the next justified move is no longer another docs-only design slice.
- The next justified slice is now implementation of the rewrite rules in the actual prompt/runtime path.

Verification:
- Docs-only design slice.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - Layer One rewrite-prompt implementation slice

Implemented the first real execution seam for the Layer One report hardening rules.

Files changed:
- `lib/server/layer-one-report-rewrite-prompt.ts`
- `lib/server/layer-one-report-rewrite-prompt.test.ts`
- `scripts/layer-one-report-rewrite-prompt.ts`
- `package.json`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `docs/06-environment-and-secrets.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added a reusable prompt builder that converts report markdown into a constrained rewrite prompt for another LLM.
- The prompt builder applies the frozen Layer One rules:
  - fixed section order
  - evidence discipline
  - tone and verbosity rules
  - recommendation formatting
  - ambiguous-signal wording
- Added `npm run report:layer-one:rewrite-prompt -- --report <markdown-path>` for local use on existing reports.
- Kept the slice narrow:
  - no customer-facing report renderer changes
  - no retrieval changes
  - no claim that the shipped runtime now rewrites reports automatically

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/layer-one-report-rewrite-prompt.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-30 - Layer One real-world rewrite fixture slice

Added the first real-world external rewrite example for the new Layer One constrained prompt seam.

Files changed:
- `docs/review-inputs/reports/cllc-gemini-report.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added a markdown copy of the external Gemini-generated CLLC report as a stable local review fixture.
- This gives the new rewrite-prompt command a real bad-output example to run against, instead of relying only on the shipped sample audit fixture.
- Kept the slice narrow:
  - no UI changes
  - no product runtime changes
  - no claim that the external report itself is now corrected

Verification:
- Operator workflow slice only.
- The next step is to run the existing rewrite-prompt command against this markdown fixture.

## 2026-03-30 - Layer One gold rewrite fixture slice

Added the first gold-standard rewritten Layer One report fixture for prompt-tuning work.

Files changed:
- `eval/fixtures/cllc-layer-one-rewrite-gold.md`
- `docs/01-current-state.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added the merged CLLC rewritten report as a stable local fixture.
- This gives the rewrite workflow one concrete target output to compare against when future prompt changes are evaluated.
- Kept the slice narrow:
  - no prompt changes
  - no UI changes
  - no runtime report-generation changes

Verification:
- Fixture/docs slice only.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-30 - automatic Layer One report eval writing

Implemented automatic deterministic report-eval writes for generated deep-audit markdown.

Files changed:
- `lib/server/report-eval-writer.ts`
- `lib/server/report-eval-writer.test.ts`
- `workers/queue/report-queue-consumer.ts`
- `app/dashboard/evals/page.tsx`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added a deterministic Layer One report-eval summary/writer built on the existing markdown structural scorer.
- The writer records generated reports into `report_eval_runs` under framework `layer_one_report`.
- The queue consumer now writes this eval row automatically after a report is successfully created.
- The eval write is best-effort only:
  - report delivery still succeeds if the analytics insert fails
  - failures are logged through the existing structured log path
- Added a dedicated framework label in the admin eval analytics page so report quality history can be filtered and graphed directly.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/report-eval-writer.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - first live benchmark window interpretation slice

Froze the operator interpretation of the first live `law_firms` scheduled benchmark window after preview, immediate run, summary, outlier selection, and targeted run diagnostics.

Files changed:
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`

What changed:
- Recorded that the first live `law_firms-p1-v1` window on `gemini-2.5-flash-lite` completed cleanly across all 21 paired domains.
- Recorded that grounded-vs-ungrounded citation-rate deltas are now usable internal directional signal for this lane.
- Recorded that exact-page quality stayed at `0%` across the first window.
- Recorded that targeted winner/loser diagnostics showed mostly domain-level grounded citations rather than page URLs, so the current `0%` exact-page outcome should not be treated as enough evidence for a provenance-matcher rewrite.
- Froze the near-term operator rule: keep collecting comparable windows, keep outlier/lineage review lean, and do not widen scale or change the methodology without stronger evidence.

Verification:
- This was a docs-only interpretation freeze based on already verified commands and live run evidence.
- No type-check, Vitest, or Playwright was needed for this slice.

## 2026-03-29 - benchmark run-diagnostic slice

Added a terminal diagnostic for selected benchmark run-group ids so the team can distinguish matcher/normalization gaps from genuine domain-level grounding behavior before opening manual lineage pages.

Files changed:
- `lib/server/benchmark-run-diagnostic.ts`
- `lib/server/benchmark-run-diagnostic.test.ts`
- `scripts/benchmark-run-diagnostic.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added a small read-only run diagnostic that summarizes page-URL citations, domain-only citations, matched provenance, exact-vs-normalized matches, supported overlap, and sample URLs for a selected run group.
- Added `npm run benchmark:run:diagnostic -- --run-group-ids run-1,run-2`.
- Added a lightweight `probable_issue` label so the first diagnosis step is faster and more consistent.
- Kept the slice terminal-only and built entirely on existing run-detail / citation metadata.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-run-diagnostic.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark outlier-selection slice

Added a terminal command that ranks the biggest grounded winners and losers for the current scheduled benchmark window.

Files changed:
- `lib/server/benchmark-schedule-window-summary.ts`
- `lib/server/benchmark-schedule-window-summary.test.ts`
- `scripts/benchmark-schedule-outliers.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Extended the scheduled-window summary helper with outlier selection based on grounded minus ungrounded citation-rate delta.
- Added `npm run benchmark:schedule:outliers`.
- The command prints the top grounded winners and top grounded losers for the current configured window so manual lineage review starts from the highest-signal cases.
- Kept the slice terminal-only and read-only to preserve the lean current architecture.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-schedule-window-summary.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark scheduled-window summary slice

Added a read-only command that summarizes the current scheduled benchmark window per domain, pairing ungrounded and grounded runs for the configured frame.

Files changed:
- `lib/server/benchmark-schedule-window-summary.ts`
- `lib/server/benchmark-schedule-window-summary.test.ts`
- `scripts/benchmark-schedule-summary.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added a small summary helper that groups scheduled run groups by domain for one schedule window and pairs `ungrounded_inference` with `grounded_site`.
- Added `npm run benchmark:schedule:summary`.
- The summary prints the current configured schedule window with per-domain citation-rate comparison, exact-page quality, and both run-group ids.
- Kept the slice terminal-only and read-only so the first live benchmark lane is easier to review without introducing a new admin route.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-schedule-window-summary.test.ts lib/server/benchmark-schedule.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark schedule run-now slice

Added a one-shot scheduler command so the recurring benchmark lane can be executed immediately through the same scheduler path as cron.

Files changed:
- `scripts/benchmark-schedule-run-now.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added `npm run benchmark:schedule:run-now`.
- The command reuses `runScheduledBenchmarkSweep(...)` and the current `BENCHMARK_SCHEDULE_*` env instead of introducing a parallel benchmark orchestration path.
- Updated the benchmark collection runbook so the first operating lane now has an explicit immediate-proof step after preview and before relying on cron.

Verification:
- `npm.cmd run type-check`
- `npm.cmd run benchmark:schedule:preview`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark schedule preview slice

Added a dry-run preview path for the recurring benchmark schedule so operators can verify the exact query set, schedule window, and selected domains before waiting for cron or launching real scheduled runs.

Files changed:
- `lib/server/benchmark-schedule.ts`
- `lib/server/benchmark-schedule.test.ts`
- `scripts/benchmark-schedule-preview.ts`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added `previewBenchmarkScheduleSweep(...)` on the existing scheduler seam instead of introducing a separate selection path.
- Added `npm run benchmark:schedule:preview` so the current `BENCHMARK_SCHEDULE_*` env can be checked directly from the terminal.
- The preview prints the query-set identity, model lane, run modes, schedule window, selected domain count, and exact selected domains.
- Updated the benchmark collection playbook so preview is now the required step immediately before enabling the recurring lane.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-schedule.test.ts lib/server/benchmark-query-set-seed.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - law-firms query-set seed slice

Added a repeatable seed path for the first frozen `law_firms` benchmark query set so the initial recurring collection lane no longer depends on manual admin entry.

Files changed:
- `lib/server/benchmark-query-set-seed.ts`
- `lib/server/benchmark-query-set-seed.test.ts`
- `scripts/benchmark-seed-query-set.ts`
- `eval/fixtures/benchmark-law-firms-p1-query-set.json`
- `package.json`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `docs/01-current-state.md`
- `docs/06-environment-and-secrets.md`

What changed:
- Added a small query-set seeding helper that upserts one benchmark query set and replaces its queries using the existing repository seam.
- Added `npm run benchmark:seed:query-set` so the first recurring collection lane has a repeatable, scriptable query-set bootstrap path.
- Added the first frozen collection fixture at `eval/fixtures/benchmark-law-firms-p1-query-set.json`.
- Froze the first law-firms collection query-set identity as:
  - `law-firms-p1-core`
  - version `v1`
  - vertical `law_firms`
  - 8 queries
- Updated the benchmark collection playbook so the first lane now has one exact command sequence: seed query set, import seed domains, then enable the twice-daily schedule.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-query-set-seed.test.ts lib/server/benchmark-seed-queue.test.ts lib/server/benchmark-schedule.test.ts`
- No Playwright was needed because this slice changed no user-facing route.

## 2026-03-29 - benchmark collection start slice

Added the first narrow recurring benchmark collection path for category-based seed data.

Files changed:
- `lib/server/benchmark-seed-queue.ts`
- `lib/server/benchmark-seed-queue.test.ts`
- `scripts/benchmark-seed-domains.ts`
- `lib/server/benchmark-repository.ts`
- `lib/server/benchmark-schedule.ts`
- `lib/server/benchmark-schedule.test.ts`
- `package.json`
- `.dev.vars.example`
- `wrangler.jsonc`
- `types/geo-pulse-env.d.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `docs/06-environment-and-secrets.md`
- `PLAYBOOK/benchmark-collection-operations-v1.md`
- `PLAYBOOK/measurement-platform-roadmap.md`

What changed:
- Added a small CSV helper layer so `benchmark_seed.csv` can be parsed, filtered by industry and priority, and mapped into explicit schedule-enabled benchmark domains.
- Added `npm run benchmark:seed:domains` so the first collection slice can be imported without inventing a new benchmark subsystem.
- Extended the recurring benchmark scheduler so it can narrow sweeps to one benchmark vertical plus selected seed priorities.
- Added 12-hour schedule windows so a twice-daily lane does not self-dedupe against the first run of the day.
- Froze the first collection operating plan in `PLAYBOOK/benchmark-collection-operations-v1.md`.

Verification:
- `npm.cmd run type-check`
- `npx.cmd vitest run lib/server/benchmark-seed-queue.test.ts lib/server/benchmark-schedule.test.ts`
- No Playwright was needed because this slice changed no user-facing route.
## 2026-03-29 â€” results chronology slice

Added one explicit top-of-page action band to the customer results route so the next step is obvious before payment, during report generation, and after delivery.

Files changed:
- `components/results-view.tsx`
- `tests/e2e/smoke.spec.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added a new top-of-page action band on the results route, directly under the journey/status section.
- Preview state now points users straight to the paid audit or the preview-save path instead of making them infer the next move from lower on the page.
- Generating state now explains what is happening and where recovery lives, with direct links for refresh/sign-in.
- Delivered state now prioritizes open/download/sign-in actions as the main top-of-page choices, rather than burying those actions below the score block.
- Kept the change on the existing route and existing state model, with scroll-to actions for the current checkout/save sections instead of adding new routes or orchestration.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Playwright attempt:

```text
Error: spawn EPERM
```

Escalated targeted Playwright:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "checkout return messaging|in-progress action band|delivered results page explains dashboard recovery"`

```text
Running 3 tests using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:100:7 › public smoke flows › results page shows checkout return messaging before payment confirmation (18.9s)
  ✓  2 [chromium] › tests\e2e\smoke.spec.ts:136:7 › public smoke flows › results page surfaces the in-progress action band while the full audit is generating (5.9s)
  ✓  3 [chromium] › tests\e2e\smoke.spec.ts:167:7 › public smoke flows › delivered results page explains dashboard recovery with the checkout email (5.8s)

  3 passed (1.1m)
```

---

## 2026-03-29 â€” paid-report recovery slice

Tightened the successful paid-path recovery story so non-technical users know how to find the report again after purchase.

Files changed:
- `components/results-view.tsx`
- `app/login/page.tsx`
- `app/dashboard/page.tsx`
- `workers/report/resend-delivery-helpers.ts`
- `tests/e2e/smoke.spec.ts`
- `docs/01-current-state.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Delivered results now include an explicit recovery panel that tells the user to sign in with the Stripe checkout email if they want the report in the dashboard later.
- Customer login now includes a short recovery note explaining that paid reports attach to the Stripe checkout email.
- Dashboard empty state now explains the most likely recovery mistake: signing in with a different email than the purchase email.
- Delivery email helper copy now reinforces the same recovery rule for both attachment and download-link variants.
- Added Playwright browser proof for the delivered-results recovery panel while keeping the slice architecture-light.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Playwright attempt:

```text
Error: spawn EPERM
```

Escalated targeted Playwright:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "delivered results page explains dashboard recovery|customer login page renders the magic-link flow|authenticated admin session renders dashboard admin actions"`

```text
Running 3 tests using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:133:7 › public smoke flows › delivered results page explains dashboard recovery with the checkout email (27.1s)
  ✓  2 [chromium] › tests\e2e\smoke.spec.ts:297:7 › public smoke flows › customer login page renders the magic-link flow (10.7s)
  ✓  3 [chromium] › tests\e2e\smoke.spec.ts:323:7 › public smoke flows › authenticated admin session renders dashboard admin actions (6.7s)

  3 passed (1.5m)
```

---

## 2026-03-29 â€” paid-path traceability slice

Added the missing observability seam on the local paid-report path so founder testing can distinguish webhook success from queue/report-worker failure.

Files changed:
- `app/api/webhooks/stripe/route.ts`
- `lib/server/stripe/ensure-deep-audit-job-queued.ts`
- `workers/queue/report-queue-consumer.ts`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added structured success/failure logging to the Stripe `checkout.session.completed` webhook path with event id, session id, scan id, and duplicate status.
- Added structured queue-enqueue logging so the app now records when the deep-audit job was actually queued, and when queue send fails.
- Added report-worker lifecycle breadcrumbs for `report_job_started`, `report_job_email_sent`, and `report_job_completed`, complementing the existing failure logs.
- Kept the slice architecture-light: no new tables, no new routes, no new queue type, just better visibility on the existing paid-report pipeline.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run app/api/webhooks/stripe/route.test.ts lib/server/stripe/checkout-completed.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  12 passed (12)
   Start at  00:08:45
   Duration  1.50s (transform 1.06s, setup 0ms, import 1.65s, tests 482ms, environment 2ms)
```

---

## 2026-03-28 â€” UX-008 results/report action truth pass

Implemented one narrow customer-flow UX slice on the results-to-report transition after founder review of broken report/share actions.

Files changed:
- `components/results-view.tsx`
- `components/score-display.tsx`
- `components/report-viewer.tsx`
- `lib/client/results-journey.ts`
- `lib/client/results-journey.test.ts`
- `lib/client/report-viewer.ts`
- `tests/e2e/smoke.spec.ts`
- `docs/01-current-state.md`
- `docs/03-verification-and-evidence.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Turned the static score snapshot card into a real share action: native browser share when available, copy-link fallback when not, plus a direct preview link to the OG snapshot image.
- Tightened delivered-report messaging so the results page only promises direct access when PDF or markdown artifacts are actually present.
- Added clearer public results-page error states for missing, expired, and private scans instead of collapsing them into one generic load failure.
- Updated the report viewer to fall back to a direct PDF download when the interactive markdown artifact is unavailable, instead of implying the report is simply missing.
- Added browser proof for the new share action and the PDF-only fallback without widening the route surface.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/client/results-journey.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  17:31:14
   Duration  846ms (transform 333ms, setup 0ms, import 451ms, tests 31ms, environment 1ms)
```

Initial sandbox Playwright attempt:

```text
Error: spawn EPERM
```

Escalated targeted Playwright:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "share snapshot|PDF download only|checkout return messaging|report page renders interactive summary"`

```text
Running 3 tests using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:100:7 › public smoke flows › results page shows checkout return messaging before payment confirmation (15.3s)
  ✓  2 [chromium] › tests\e2e\smoke.spec.ts:133:7 › public smoke flows › results page share snapshot action copies the results link (4.0s)
  ✓  3 [chromium] › tests\e2e\smoke.spec.ts:209:7 › public smoke flows › report page renders interactive summary from mocked report content (14.6s)

  3 passed (1.2m)
```

Additional targeted Playwright for the new PDF-only fallback:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "PDF download when no web report is available"`

```text
Running 1 test using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:180:7 › public smoke flows › report page falls back to a PDF download when no web report is available (25.7s)

  1 passed (1.2m)
```

---

## 2026-03-28 — BM-039 grounded vs ungrounded comparison view

Implemented the first internal benchmark comparison surface for methodology inspection without adding a new route or broad benchmark rewrite.

Files changed:
- `app/dashboard/benchmarks/domains/[domainId]/page.tsx`
- `lib/server/benchmark-admin-data.ts`
- `lib/server/benchmark-admin-data.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Extended benchmark domain history rows with query-set identity, run mode, and exact-page quality metadata.
- Added a grounded-vs-ungrounded comparison table on the existing benchmark domain history page, pairing the latest runs for the same query set and model.
- Added run-history columns for mode, query set, and exact-page quality so comparisons remain inspectable in the existing admin flow.
- Updated benchmark methodology docs and task registry to mark `BM-039` complete and keep the follow-up sequence explicit.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-admin-data.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  5 passed (5)
  Start at  02:55:51
  Duration  805ms (transform 176ms, setup 0ms, import 228ms, tests 28ms, environment 0ms)
```

## 2026-03-28 — BM-040 recurring internal benchmark scheduling

Implemented the first recurring internal benchmark scheduling slice without creating a second benchmark execution path.

Files changed:
- `lib/server/benchmark-schedule.ts`
- `lib/server/benchmark-schedule.test.ts`
- `lib/server/benchmark-runner-contract.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-repository.ts`
- `workers/cloudflare-entry.ts`
- `types/geo-pulse-env.d.ts`
- `.dev.vars.example`
- `docs/06-environment-and-secrets.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added an env-configured recurring benchmark sweep service that reuses the existing benchmark runner and execution adapter.
- Reused the existing Worker cron entrypoint to launch bounded daily internal benchmark sweeps for customer benchmark domains.
- Added deterministic schedule run keys, run scope, run labels, and schedule metadata so recurring history is comparable and duplicate daily runs are skipped.
- Documented the new schedule env contract and marked `BM-040` complete in the roadmap and task ledger.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-schedule.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  9 passed (9)
  Start at  03:13:58
  Duration  3.31s (transform 2.91s, setup 0ms, import 3.73s, tests 272ms, environment 1ms)
```

## 2026-03-28 — BM-041 competitor/cohort methodology freeze

Added the first explicit competitor/cohort benchmark methodology so comparative benchmark work stays narrow, inspectable, and low-maintenance.

Files changed:
- `PLAYBOOK/benchmark-competitor-cohort-methodology-v1.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Froze the first comparative benchmark frame rules so competitor/cohort comparisons are only valid when query set, model lane, run mode, and benchmark window all match.
- Added narrow v1 cohort guardrails: small cohorts only, one vertical per cohort, explicit domain roles, conservative claim language, and no public ranking posture.
- Made BM-043 lineage inspection a practical prerequisite for trustworthy cohort inspection, so BM-042 builds on inspectable run evidence instead of abstract cohort scoring.

Verification:

```text
Docs-only design slice. No code-path changes or runtime verification required.
```

## 2026-03-28 — BM-043 benchmark query lineage inspection

Implemented the first run-level benchmark lineage view by extending the existing run-detail page instead of adding a new route or persistence layer.

Files changed:
- `components/benchmark-run-detail-view.tsx`
- `lib/server/benchmark-run-detail.ts`
- `lib/server/benchmark-run-detail.test.ts`
- `PLAYBOOK/benchmark-admin-ui-v1.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `docs/01-current-state.md`
- `docs/02-implementation-map.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added helper parsing for citation provenance and claim-overlap metadata already stored in `query_citations.metadata`.
- Extended the existing benchmark run-detail page with a per-query lineage section that shows prompt, response, extracted citations, grounded source resolution, and claim-overlap status as one read-only chain.
- Kept the current route, current tables, and current storage model intact so the change improves inspectability without creating a second benchmark UI subsystem.
- Updated the benchmark UI and roadmap docs so the lineage surface is now part of the declared admin shape and benchmark sequencing.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-run-detail.test.ts lib/server/benchmark-admin-data.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  18 passed (18)
   Start at  16:14:50
   Duration  794ms (transform 488ms, setup 0ms, import 646ms, tests 62ms, environment 2ms)
```

## 2026-03-28 — BM-042 narrow cohort storage and admin slice

Implemented the first stored competitor/cohort benchmark slice without adding a new benchmark subsystem.

Files changed:
- `supabase/migrations/015_benchmark_cohorts.sql`
- `lib/server/benchmark-admin-data.ts`
- `lib/server/benchmark-admin-data.test.ts`
- `app/dashboard/benchmarks/domains/[domainId]/page.tsx`
- `lib/supabase/e2e-auth.ts`
- `tests/e2e/smoke.spec.ts`
- `PLAYBOOK/benchmark-admin-ui-v1.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `docs/01-current-state.md`
- `docs/02-implementation-map.md`
- `docs/03-verification-and-evidence.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added explicit internal cohort storage with `benchmark_cohorts` and `benchmark_cohort_members`, keeping one query-set/model/run-mode frame per cohort and explicit measured-customer vs competitor roles.
- Extended the benchmark admin data layer with one narrow cohort snapshot query that resolves the latest comparable run for each member domain inside the stored frame.
- Added a read-only cohort-frame panel to the existing benchmark domain history page, linking back to domain history and run detail instead of creating a second benchmark surface.
- Extended the E2E admin-data seam and added targeted Playwright smoke coverage for the changed domain-history route.
- Updated the benchmark docs and task ledger so the repo truth now reflects that the first stored cohort frame exists, while broader comparative work remains intentionally narrow and internal.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-admin-data.test.ts lib/server/benchmark-run-detail.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  19 passed (19)
   Start at  16:35:15
   Duration  703ms (transform 720ms, setup 0ms, import 919ms, tests 62ms, environment 1ms)
```

Initial sandbox Playwright attempt:

```text
Error: spawn EPERM
```

Escalated targeted Playwright:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "benchmark cohort frame on domain history"`

```text
Running 1 test using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:252:7 › public smoke flows › authenticated admin session renders benchmark cohort frame on domain history (16.2s)

  1 passed (1.1m)
```

## 2026-03-28 — BM-044 multi-model benchmark lane support

Implemented the first additional live model lane support without widening the benchmark trigger flow or adding a new provider subsystem.

Files changed:
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`
- `lib/server/cf-env.ts`
- `types/geo-pulse-env.d.ts`
- `app/dashboard/benchmarks/page.tsx`
- `.dev.vars.example`
- `docs/06-environment-and-secrets.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `docs/01-current-state.md`
- `docs/02-implementation-map.md`
- `docs/03-verification-and-evidence.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added `BENCHMARK_EXECUTION_ENABLED_MODELS` as a narrow comma-separated allowlist for live benchmark model lanes on the existing execution boundary.
- Kept the current single-provider shape intact: one provider, one API key, one endpoint, and multiple allowed model ids instead of a wider orchestration or provider-routing layer.
- Preserved the current admin trigger form shape; the first enabled model remains the default lane, and unknown model ids are still skipped truthfully.
- Updated the benchmark overview page copy to reflect when more than one model lane is enabled, and documented the new env contract in the shared environment docs.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-execution.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  2 passed (2)
      Tests  28 passed (28)
   Start at  16:45:50
   Duration  2.62s (transform 370ms, setup 0ms, import 517ms, tests 4.08s, environment 0ms)
```

Escalated targeted Playwright:

`npx.cmd playwright test tests/e2e/smoke.spec.ts --grep "authenticated admin session renders benchmark overview"`

```text
Running 1 test using 1 worker

  ✓  1 [chromium] › tests\e2e\smoke.spec.ts:234:7 › public smoke flows › authenticated admin session renders benchmark overview (16.3s)

  1 passed (48.4s)
```

## 2026-03-28 — BM-045 benchmark schedule hardening

Implemented the first operator hardening slice for larger internal benchmark sweeps without splitting the benchmark runtime.

Files changed:
- `lib/server/benchmark-schedule.ts`
- `lib/server/benchmark-schedule.test.ts`
- `docs/06-environment-and-secrets.md`
- `.dev.vars.example`
- `types/geo-pulse-env.d.ts`
- `PLAYBOOK/benchmark-scale-path.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `docs/01-current-state.md`
- `docs/02-implementation-map.md`
- `docs/03-verification-and-evidence.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Added explicit schedule isolation caps: `BENCHMARK_SCHEDULE_MAX_RUNS` now limits total scheduled launches per sweep, and `BENCHMARK_SCHEDULE_MAX_FAILURES` stops the sweep early after repeated failures.
- Changed the scheduled sweep behavior to continue after an individual run failure instead of aborting the whole sweep immediately, while still surfacing each failed run through structured logs.
- Extended the schedule summary to report failed run count and whether the sweep stopped early, and added warning/error completion events on the existing structured-log path.
- Kept the hardening on the current cron/schedule seam rather than introducing a second queue, service, or benchmark UI surface.

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-schedule.test.ts lib/server/benchmark-execution.test.ts`

```text
 RUN  v4.1.2 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  36 passed (36)
   Start at  16:52:56
   Duration  2.90s (transform 1.25s, setup 0ms, import 2.06s, tests 4.12s, environment 1ms)
```

## 2026-03-28 — BM-046 benchmark operations decision freeze

Recorded the post-hardening operations decision for the 500 to 1000-site benchmark path without adding new benchmark runtime code.

Files changed:
- `PLAYBOOK/benchmark-operations-decision-v1.md`
- `PLAYBOOK/benchmark-scale-path.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `docs/01-current-state.md`
- `docs/03-verification-and-evidence.md`
- `docs/04-open-work-and-risks.md`
- `agents/memory/PROJECT_STATE.md`

What changed:
- Froze the current decision that GEO-Pulse should not split benchmark execution into a separate deployable benchmark service yet.
- Made the triggers for a future split explicit: customer-path reliability risk, schedule brittleness, cost-boundary pressure, observability failure, or real 100 to 200-domain operating evidence that the current runtime is no longer sufficient.
- Updated the scale path and roadmap so the 500 to 1000-site benchmark route remains planned, not implemented, and so the current repo/runtime remains the truthful posture for now.

Verification:

```text
Docs-only decision slice. No code-path changes or runtime verification required.
```

## How to write an entry

```markdown
## [TASK-ID] — [Task name]
**Agent:** [Which agent did the work]
**Claimed complete:** [Date]
**Evidence type:** [e.g., "Unit test output + type check + curl response"]

### Evidence

[PASTE ACTUAL OUTPUT HERE — no paraphrasing, no summaries]
[If it's test output: paste the full test runner output]
[If it's a curl response: paste the full response]
[If it's a type check: paste `npx tsc --noEmit` output]
[If it ran zero tests, write "ZERO TESTS RUN" — that is a fail]

### Orchestrator Decision
**Date:** [Date]
**Decision:** ✅ ACCEPTED | ❌ CHALLENGED
**Notes:** [If challenged: what evidence is missing or what the challenge question is]
```

---

## Log

### BM-002 — first benchmark schema set defined (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** schema design document + task-ledger sync

#### Evidence

Added:

- `PLAYBOOK/measurement-schema-v1.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/measurement-schema-v1.md` now defines:

- `benchmark_domains`
- `benchmark_query_sets`
- `benchmark_queries`
- `benchmark_run_groups`
- `query_runs`
- `query_citations`
- `benchmark_domain_metrics`

It also freezes:

- canonical domain identity rules
- service-role-only RLS posture for v1
- first metric semantics:
  - `citation_rate`
  - `query_coverage`
  - `share_of_voice`
  - `inference_probability`
  - `drift_score`
- migration sequencing recommendation
- explicit out-of-scope items so the first migration does not sprawl

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-002 is accepted as a design/spec completion. No migration exists yet; implementation begins with the next benchmark task.

---

### BM-003 — LiteLLM integration plan and provider boundaries (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** integration design document + codebase boundary review

#### Evidence

Reviewed current provider seam:

- `workers/lib/interfaces/providers.ts`
- `workers/providers/gemini.ts`
- `app/api/scan/route.ts`
- `workers/queue/report-queue-consumer.ts`

Added:

- `PLAYBOOK/litellm-integration-plan.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/litellm-integration-plan.md` now defines:

- keep `LLMProvider` as the app-facing abstraction
- add a new `LiteLLMProvider` instead of replacing the current interface
- add a provider factory for runtime selection
- separate future target-model vs auditor-model concepts
- stage rollout so Gemini remains compatible during transition
- new config concepts for provider/model selection and LiteLLM connectivity

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-003 is accepted as a design/spec completion. No LiteLLM code or env changes exist yet; this is the approved boundary plan for later implementation.

---

### BM-004 — Langfuse integration plan for benchmark observability (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** observability design document + codebase review

#### Evidence

Reviewed current observability/eval context:

- `lib/server/structured-log.ts`
- benchmark and eval planning docs
- deterministic retrieval/eval foundation docs

Added:

- `PLAYBOOK/langfuse-integration-plan.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/langfuse-integration-plan.md` now defines:

- Langfuse as an optional benchmark-layer observability tool
- Supabase remains the system of record for benchmark data
- benchmark query runs should map to traces and spans
- rollout should begin with benchmark-only instrumentation
- Langfuse failures must never break primary benchmark persistence
- Promptfoo remains the regression harness and RAGAS remains deferred

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-004 is accepted as a design/spec completion. No Langfuse integration code exists yet; the observability role is now explicitly scoped before implementation.

---

### BM-005 — internal benchmark runner v1 design (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** runner design document + existing eval-path review

#### Evidence

Reviewed current adjacent execution patterns:

- `lib/server/retrieval-eval.ts`
- `lib/server/retrieval-eval-writer.ts`
- `scripts/retrieval-eval-write.ts`
- `lib/server/promptfoo-results.ts`

Added:

- `PLAYBOOK/benchmark-runner-v1.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/benchmark-runner-v1.md` now defines:

- one-domain / one-query-set / one-model-lane scope for v1
- run-group lifecycle
- serial query execution first
- raw response persistence before citation parsing
- conservative citation extraction contract
- first metric computation path
- query-level failure handling and run-group completion rules
- structured logging expectations
- explicit non-goals to avoid premature orchestration complexity

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-005 is accepted as a design/spec completion. This is the approved first operational shape for implementation, pending BM-006 metric/citation contract refinement and any migration work.

---

### BM-006 — citation extraction v1 and metric computation v1 (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** metric/citation design document + repo conflict check

#### Evidence

Conflict review findings:

- no existing shared citation-extraction service exists in the repo
- current citation-related logic is limited to:
  - retrieval-eval `cited_sources`
  - Promptfoo retrieval fixture/provider outputs
  - admin retrieval drilldown display

Added:

- `PLAYBOOK/citation-and-metrics-v1.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/citation-and-metrics-v1.md` now defines:

- accepted v1 citation classes:
  - `explicit_url`
  - `explicit_domain`
  - `brand_mention`
- citation priority order
- dedupe rules
- confidence guidance
- rank-position guidance
- first metric formulas for:
  - `query_coverage`
  - `citation_rate`
  - `share_of_voice`
- explicit v1 exclusions to avoid overstating benchmark rigor too early

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-006 is accepted as a design/spec completion. Citation and metric semantics are now explicit enough to support the first implementation without conflicting with current retrieval-eval helpers.

---

### BM-007 — benchmark admin UI v1 design (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** UI design document + admin-pattern review

#### Evidence

Reviewed current admin UI patterns:

- `app/dashboard/evals/page.tsx`
- `app/dashboard/evals/retrieval/[id]/page.tsx`
- `app/dashboard/attribution/page.tsx`

Added:

- `PLAYBOOK/benchmark-admin-ui-v1.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/benchmark-admin-ui-v1.md` now defines:

- first benchmark admin pages:
  - `/dashboard/benchmarks`
  - `/dashboard/benchmarks/[runGroupId]`
  - `/dashboard/benchmarks/domains/[domainId]`
- first allowed controls
- benchmark-vs-eval admin separation
- explicit non-goals for v1
- alignment with the repo’s existing server-rendered admin style

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-007 is accepted as a design/spec completion. The benchmark admin plan now has a UI shape before implementation work begins.

---

### BM-008 — benchmark scale path to 1000 domains with customer-flow isolation (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** staged ops design document + queue/runtime constraint review

#### Evidence

Reviewed current operational context:

- `wrangler.jsonc`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `PLAYBOOK/stress test.md`
- `PLAYBOOK/geo pulse playbook`
- `agents/ORCHESTRATOR.md`
- `agents/memory/PROJECT_STATE.md`

Added:

- `PLAYBOOK/benchmark-scale-path.md`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`PLAYBOOK/benchmark-scale-path.md` now defines:

- staged cohort growth:
  - 20 to 50 domains
  - 100 to 200 domains
  - 250 to 500 domains
  - 500 to 1000 domains
- non-negotiable isolation rules so benchmark jobs never block customer scan/report flows
- queue and worker isolation path from shared infra to dedicated benchmark lanes
- concurrency, budget, replay, DLQ, and backpressure expectations by phase
- decision rule for when the benchmark layer should become a separate deployable service
- a conservative implementation order that preserves the current audit/report product

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-008 is accepted as a design/spec completion. The benchmark planning set now covers architecture, schema, provider boundaries, observability, runner shape, metrics, admin UI, and staged scale path before any implementation starts.

---

### BM-009 — benchmark foundation migration added (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** SQL migration + task-ledger sync

#### Evidence

Added:

- `supabase/migrations/012_benchmark_foundation.sql`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

`012_benchmark_foundation.sql` adds:

- `benchmark_domains`
- `benchmark_query_sets`
- `benchmark_queries`
- `benchmark_run_groups`
- `query_runs`
- `query_citations`
- `benchmark_domain_metrics`

It also includes:

- uniqueness and status/intention check constraints
- indexes for the first benchmark access paths
- RLS enabled on all benchmark tables with no anon/auth policies
- one `updated_at` trigger for `benchmark_domains`
- comments documenting the service-role-only posture

This is intentionally schema only.
No benchmark runner, citation parser, UI, or public benchmark claims were added in this step.

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-009 is accepted as the first concrete measurement-platform implementation slice. The repo now has a benchmark storage foundation without coupling benchmark execution to customer flows.

---

### BM-010 — benchmark-domain normalization helpers and first typed repository seam (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-domains.ts`
- `lib/server/benchmark-repository.ts`
- `lib/server/benchmark-domains.test.ts`
- `lib/server/benchmark-repository.test.ts`

Updated:

- `lib/server/promptfoo-results.ts`
- `lib/server/promptfoo-results.test.ts`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- centralized benchmark identity derivation:
  - normalized domain
  - canonical domain (`www.` stripped)
  - preserved `siteUrl`
- first typed benchmark repository methods:
  - `deriveDomainIdentity`
  - `getDomainByCanonicalDomain`
  - `upsertDomain`
  - `getActiveQuerySet`
- existing eval grouping now reuses the shared canonical-domain helper to reduce identity drift between eval and benchmark layers

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  14 passed (14)
   Start at  19:27:13
   Duration  542ms (transform 507ms, setup 0ms, import 647ms, tests 42ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-010 is accepted. Benchmark identity logic is now centralized and the first repository seam exists for later runner and seeding work.

---

### BM-011 — first benchmark seeding path and runner input contract (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + fixture + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-runner-contract.ts`
- `lib/server/benchmark-seed.ts`
- `lib/server/benchmark-runner-contract.test.ts`
- `lib/server/benchmark-seed.test.ts`
- `scripts/benchmark-seed.ts`
- `eval/fixtures/benchmark-seed-sample.json`

Updated:

- `lib/server/benchmark-repository.ts`
- `package.json`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- validated runner input contract for:
  - `domainId`
  - `querySetId`
  - `modelId`
  - optional `auditorModelId`
  - optional `runLabel`
  - optional `notes`
- benchmark seed fixture contract for one domain plus one query set and query list
- repository now supports:
  - `upsertQuerySet`
  - `replaceQueries`
  - `getQueriesForQuerySet`
- new internal seed script:
  - `npm run benchmark:seed`
  - defaults to `eval/fixtures/benchmark-seed-sample.json`

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  10 passed (10)
   Start at  19:35:59
   Duration  491ms (transform 293ms, setup 0ms, import 499ms, tests 39ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-011 is accepted. The repo now has a real internal benchmark seed path and a validated runner input contract, which is the correct precursor to the first runner skeleton.

---

### BM-012 — first benchmark runner skeleton for one domain / one query set / one model lane (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `scripts/benchmark-runner.ts`

Updated:

- `lib/server/benchmark-repository.ts`
- `package.json`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- first benchmark runner skeleton:
  - validates runner input
  - resolves benchmark domain
  - resolves benchmark query set
  - loads benchmark queries
  - creates a `benchmark_run_groups` row
  - creates placeholder `query_runs` rows as `skipped`
  - writes starter `benchmark_domain_metrics`
  - closes the run group as completed in `skeleton` mode
- structured lifecycle logs:
  - `benchmark_run_group_started`
  - `benchmark_run_group_completed`
- new internal script:
  - `npm run benchmark:run`

Current limitation is explicit in the code and state:

- query rows are marked `skipped`
- `error_message` is `model_execution_not_implemented`
- no model provider call occurs yet
- no citation parsing occurs yet

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  5 passed (5)
      Tests  11 passed (11)
   Start at  19:44:28
   Duration  961ms (transform 720ms, setup 0ms, import 1.18s, tests 93ms, environment 2ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-012 is accepted. The repo now has the first benchmark run-group write path without overstating execution capability; model execution and citation parsing remain separate next steps.

---

### BM-013 — benchmark execution contract and stub adapter boundary (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`

Updated:

- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- benchmark-specific execution types:
  - `BenchmarkExecutionStatus`
  - `BenchmarkExecutionResult`
  - `BenchmarkExecutionContext`
  - `BenchmarkExecutionAdapter`
- stub adapter and factory:
  - `StubBenchmarkExecutionAdapter`
  - `createBenchmarkExecutionAdapter()`
- runner now depends on the benchmark execution adapter boundary instead of hardcoded placeholder row construction
- current stub behavior is explicit:
  - returns `status: not_implemented`
  - returns normalized metadata for model/query context
  - runner maps `not_implemented` to stored `query_runs.status = skipped`

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  7 passed (7)
   Start at  19:48:51
   Duration  867ms (transform 286ms, setup 0ms, import 477ms, tests 44ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-013 is accepted. The benchmark runner now has a dedicated execution seam that can later be backed by LiteLLM or another provider without changing the run-group orchestration path.

---

### BM-014 — benchmark citation extraction and `query_citations` write path (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Conflict review remained clean before implementation:

- no existing shared citation-extraction service exists in the repo
- existing citation-related logic is still limited to retrieval-eval and local eval helpers

Added:

- `lib/server/benchmark-citations.ts`
- `lib/server/benchmark-citations.test.ts`

Updated:

- `lib/server/benchmark-repository.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- conservative benchmark citation parsing:
  - explicit URL
  - explicit domain
  - brand mention only for the measured domain when mapping is clear
- duplicate handling that keeps stronger URL citations from being duplicated as weaker domain citations
- runner now writes `query_citations` rows for completed responses
- runner now computes first real metrics from stored citation outcomes:
  - `query_coverage`
  - `citation_rate`
  - `share_of_voice`

Current truth remains explicit:

- provider execution is still stubbed
- citation extraction only runs when a completed response exists
- no cohort-wide comparison service exists yet

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  11 passed (11)
   Start at  20:42:04
   Duration  1.02s (transform 827ms, setup 0ms, import 1.13s, tests 87ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-014 is accepted. The benchmark runner can now persist conservative citation outcomes from completed responses without overstating the maturity of the execution layer.

---

### BM-015 — benchmark metric helper extracted from runner orchestration (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-metrics.ts`
- `lib/server/benchmark-metrics.test.ts`

Updated:

- `lib/server/benchmark-runner.ts`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- extracted benchmark metric computation into a reusable helper
- helper now computes:
  - `query_coverage`
  - `citation_rate`
  - `share_of_voice`
  - `inclusion_rate`
  - `scheduled_runs`
  - `completed_runs`
  - `skipped_runs`
  - `failed_runs`
  - citation-class counts for:
    - `explicit_url`
    - `explicit_domain`
    - `brand_mention`
- runner now uses the helper instead of computing benchmark metrics inline

This keeps benchmark metrics reusable for later admin queries, reruns, and domain-history views instead of leaving metric logic buried in runner orchestration.

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  20:54:14
   Duration  909ms (transform 543ms, setup 0ms, import 744ms, tests 69ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-015 is accepted. Benchmark metric semantics are now implemented as a reusable server helper rather than remaining embedded inside the runner.

---

### BM-016 — benchmark admin query layer for run groups, details, citations, and domain history (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:

- `lib/server/benchmark-admin-data.ts`
- `lib/server/benchmark-admin-data.test.ts`

Updated:

- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- server-side benchmark admin data module with:
  - `getRunGroups(filters)`
  - `getRunGroupDetail(runGroupId)`
  - `getDomainHistory(domainId)`
- run-group hydration includes:
  - benchmark run metadata
  - benchmark domain identity
  - query-set name/version
  - core metric columns
- run-group detail hydration includes:
  - query runs
  - query text and keys
  - citation counts per query run
  - full citation rows for drilldown
- domain history output provides the time-series shape needed for future benchmark admin pages

This is intentionally a backend data layer only.
No benchmark UI pages were added in this step.

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  21:07:58
   Duration  653ms (transform 122ms, setup 0ms, import 160ms, tests 15ms, environment 0ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-016 is accepted. The benchmark initiative now has the backend query surface needed for `/dashboard/benchmarks` and later drilldown pages.

---

### BM-017 — benchmark admin overview page with filters and recent run groups (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + build

#### Evidence

Added:

- `app/dashboard/benchmarks/page.tsx`

Updated:

- `app/dashboard/page.tsx`
- `app/dashboard/attribution/page.tsx`
- `components/site-header.tsx`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- first benchmark admin overview page at `/dashboard/benchmarks`
- page uses the benchmark admin query layer instead of issuing ad hoc page-local joins
- overview includes:
  - summary cards
  - filters for domain, query set, model, and status
  - recent run-group table
- admin navigation updated so benchmark UI is reachable from:
  - account dashboard
  - attribution page
  - site header admin links

Current truth remains explicit:

- no run-group detail page yet
- no domain history page yet
- benchmark execution is still backed by the stub adapter unless a later provider implementation is added

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox build attempt:

```text
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

Escalated retry:

```text
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
 ✓ Compiled successfully in 21.8s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/10) ...
   Generating static pages (2/10) 
   Generating static pages (4/10) 
   Generating static pages (7/10) 
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                    1.53 kB         109 kB
├ ƒ /_not-found                            995 B         103 kB
├ ƒ /admin/login                         3.17 kB         109 kB
├ ƒ /api/admin/reconcile-deep-audit        143 B         102 kB
├ ƒ /api/checkout                          143 B         102 kB
├ ƒ /api/internal/marketing/events         143 B         102 kB
├ ƒ /api/leads                             143 B         102 kB
├ ƒ /api/scan                              143 B         102 kB
├ ƒ /api/scans/[id]                        143 B         102 kB
├ ƒ /api/webhooks/stripe                   143 B         102 kB
├ ƒ /auth/callback                         143 B         102 kB
├ ƒ /dashboard                             173 B         106 kB
├ ƒ /dashboard/attribution                 173 B         106 kB
├ ƒ /dashboard/benchmarks                  173 B         106 kB
├ ƒ /dashboard/evals                       173 B         106 kB
├ ƒ /dashboard/evals/retrieval/[id]        173 B         106 kB
├ ƒ /login                               3.02 kB         109 kB
├ ƒ /results/[id]                        6.61 kB         114 kB
├ ƒ /results/[id]/opengraph-image          143 B         102 kB
└ ƒ /results/[id]/report                 49.1 kB         155 kB
+ First Load JS shared by all             102 kB
  ├ chunks/493-e61740f684b4ba13.js         46 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          1.99 kB
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-017 is accepted. The benchmark initiative now has its first admin UI surface and the page builds cleanly.

---

### BM-018 — benchmark run-group detail page and overview drilldown links (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + type check + build

#### Evidence

Added:

- `app/dashboard/benchmarks/[runGroupId]/page.tsx`

Updated:

- `app/dashboard/benchmarks/page.tsx`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- new benchmark run-group detail page at `/dashboard/benchmarks/[runGroupId]`
- detail page shows:
  - run metadata
  - core metric cards
  - query-run table
  - extracted citation table
- overview table now links each benchmark row to its run-group detail page
- detail page includes navigation back to benchmarks and a domain-filtered benchmark history entry point

Current truth remains explicit:

- benchmark execution is still stubbed unless a later adapter is implemented
- no dedicated benchmark domain-history page exists yet

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox build attempt:

```text
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

Escalated retry:

```text
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
 ✓ Compiled successfully in 17.2s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/10) ...
   Generating static pages (2/10) 
   Generating static pages (4/10) 
   Generating static pages (7/10) 
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                 Size  First Load JS
┌ ƒ /                                    1.53 kB         109 kB
├ ƒ /_not-found                            995 B         103 kB
├ ƒ /admin/login                         3.17 kB         109 kB
├ ƒ /api/admin/reconcile-deep-audit        143 B         102 kB
├ ƒ /api/checkout                          143 B         102 kB
├ ƒ /api/internal/marketing/events         143 B         102 kB
├ ƒ /api/leads                             143 B         102 kB
├ ƒ /api/scan                              143 B         102 kB
├ ƒ /api/scans/[id]                        143 B         102 kB
├ ƒ /api/webhooks/stripe                   143 B         102 kB
├ ƒ /auth/callback                         143 B         102 kB
├ ƒ /dashboard                             175 B         106 kB
├ ƒ /dashboard/attribution                 175 B         106 kB
├ ƒ /dashboard/benchmarks                  175 B         106 kB
├ ƒ /dashboard/benchmarks/[runGroupId]     175 B         106 kB
├ ƒ /dashboard/evals                       175 B         106 kB
├ ƒ /dashboard/evals/retrieval/[id]        175 B         106 kB
├ ƒ /login                               3.02 kB         109 kB
├ ƒ /results/[id]                        6.61 kB         114 kB
├ ƒ /results/[id]/opengraph-image          143 B         102 kB
└ ƒ /results/[id]/report                 49.1 kB         155 kB
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-018 is accepted. The benchmark admin flow now supports row-level drilldown for one run group.

---

### BM-019 — benchmark domain history page and cross-page history links (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + build

#### Evidence

Added:

- `app/dashboard/benchmarks/domains/[domainId]/page.tsx`

Updated:

- `app/dashboard/benchmarks/page.tsx`
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- new benchmark domain history page at `/dashboard/benchmarks/domains/[domainId]`
- page shows:
  - summary cards for latest benchmark state
  - coverage trend
  - citation-rate trend
  - share-of-voice trend
  - historical run table with drilldown links
- overview page now links directly to domain history
- run-group detail page now links directly to domain history instead of only applying an overview filter

This closes the first planned benchmark admin flow:

- `/dashboard/benchmarks`
- `/dashboard/benchmarks/[runGroupId]`
- `/dashboard/benchmarks/domains/[domainId]`

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox build attempt:

```text
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

Escalated retry:

```text
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
 ✓ Compiled successfully in 15.0s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/10) ...
   Generating static pages (2/10) 
   Generating static pages (4/10) 
   Generating static pages (7/10) 
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                      Size  First Load JS
┌ ƒ /                                         1.53 kB         109 kB
├ ƒ /_not-found                                 995 B         103 kB
├ ƒ /admin/login                              3.17 kB         109 kB
├ ƒ /api/admin/reconcile-deep-audit             143 B         102 kB
├ ƒ /api/checkout                               143 B         102 kB
├ ƒ /api/internal/marketing/events              143 B         102 kB
├ ƒ /api/leads                                  143 B         102 kB
├ ƒ /api/scan                                   143 B         102 kB
├ ƒ /api/scans/[id]                             143 B         102 kB
├ ƒ /api/webhooks/stripe                        143 B         102 kB
├ ƒ /auth/callback                              143 B         102 kB
├ ƒ /dashboard                                  178 B         106 kB
├ ƒ /dashboard/attribution                      178 B         106 kB
├ ƒ /dashboard/benchmarks                       178 B         106 kB
├ ƒ /dashboard/benchmarks/[runGroupId]          178 B         106 kB
├ ƒ /dashboard/benchmarks/domains/[domainId]    178 B         106 kB
├ ƒ /dashboard/evals                            178 B         106 kB
├ ƒ /dashboard/evals/retrieval/[id]             178 B         106 kB
├ ƒ /login                                    3.02 kB         109 kB
├ ƒ /results/[id]                             6.61 kB         114 kB
├ ƒ /results/[id]/opengraph-image               143 B         102 kB
└ ƒ /results/[id]/report                      49.1 kB         155 kB
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-019 is accepted. The first benchmark admin UI flow is now complete for overview, run-group drilldown, and domain history.

---

### BM-020 — admin benchmark run trigger flow from the benchmark overview UI (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest + build

#### Evidence

Added:

- `app/dashboard/benchmarks/actions.ts`
- `components/benchmark-trigger-form.tsx`

Updated:

- `lib/server/benchmark-admin-data.ts`
- `lib/server/benchmark-admin-data.test.ts`
- `app/dashboard/benchmarks/page.tsx`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- benchmark overview page now includes a validated admin trigger form
- admin can choose:
  - one benchmark domain
  - one query set
  - one model lane
  - optional run label
  - optional notes
- server action validates admin session and form input
- action launches the existing benchmark runner skeleton and redirects to the new run-group detail page
- benchmark admin data layer now exposes:
  - `getDomainOptions()`
  - `getQuerySetOptions()`

Current truth remains explicit:

- this trigger launches the current skeleton runner
- execution is still backed by the stub adapter unless a later provider path is added

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  00:07:24
   Duration  292ms (transform 63ms, setup 0ms, import 84ms, tests 8ms, environment 0ms)
```

Initial sandbox build attempt:

```text
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

Escalated retry:

```text
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
 ✓ Compiled successfully in 13.6s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/10) ...
   Generating static pages (2/10) 
   Generating static pages (4/10) 
   Generating static pages (7/10) 
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                                      Size  First Load JS
┌ ƒ /                                         1.53 kB         109 kB
├ ƒ /_not-found                                 995 B         103 kB
├ ƒ /admin/login                              3.17 kB         109 kB
├ ƒ /api/admin/reconcile-deep-audit             143 B         102 kB
├ ƒ /api/checkout                               143 B         102 kB
├ ƒ /api/internal/marketing/events              143 B         102 kB
├ ƒ /api/leads                                  143 B         102 kB
├ ƒ /api/scan                                   143 B         102 kB
├ ƒ /api/scans/[id]                             143 B         102 kB
├ ƒ /api/webhooks/stripe                        143 B         102 kB
├ ƒ /auth/callback                              143 B         102 kB
├ ƒ /dashboard                                  175 B         106 kB
├ ƒ /dashboard/attribution                      175 B         106 kB
├ ƒ /dashboard/benchmarks                     1.29 kB         107 kB
├ ƒ /dashboard/benchmarks/[runGroupId]          175 B         106 kB
├ ƒ /dashboard/benchmarks/domains/[domainId]    175 B         106 kB
├ ƒ /dashboard/evals                            175 B         106 kB
├ ƒ /dashboard/evals/retrieval/[id]             175 B         106 kB
├ ƒ /login                                    3.02 kB         109 kB
├ ƒ /results/[id]                             6.61 kB         114 kB
├ ƒ /results/[id]/opengraph-image               143 B         102 kB
└ ƒ /results/[id]/report                      49.1 kB         155 kB
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-020 is accepted. The benchmark admin UI now has a real launch path for one run, even though execution still routes through the skeleton adapter boundary.

---

### BM-021 — first non-stub benchmark execution adapter path for a single configured model lane (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added or updated:
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`
- `lib/server/benchmark-runner.ts`
- `app/dashboard/benchmarks/actions.ts`
- `scripts/benchmark-runner.ts`
- `lib/server/cf-env.ts`
- `.dev.vars.example`
- `docs/06-environment-and-secrets.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- benchmark execution factory is now env-driven instead of always returning the stub adapter
- first live execution lane is Gemini only, gated by `BENCHMARK_EXECUTION_PROVIDER=gemini`
- only one configured model lane is considered live at a time via `BENCHMARK_EXECUTION_MODEL`
- if the requested admin/UI model lane does not match the configured benchmark lane, the run is stored as `skipped`
- if Gemini is enabled but misconfigured, the run records `failed` instead of pretending execution happened
- benchmark UI trigger and CLI runner now both use the same env-backed adapter factory
- default behavior is unchanged and remains safe: no benchmark env means stub adapter

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-execution.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1  C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

  ✓ lib/server/benchmark-execution.test.ts
  ✓ lib/server/benchmark-runner.test.ts

Test Files  2 passed
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-021 is accepted. The benchmark platform now has one real, opt-in execution lane without changing the default stub-safe posture for the rest of the product.

---

### BM-022 — benchmark-domain onboarding from the admin UI and live-lane-aligned trigger defaults (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + build

#### Evidence

Added or updated:
- `components/benchmark-domain-form.tsx`
- `app/dashboard/benchmarks/actions.ts`
- `app/dashboard/benchmarks/page.tsx`
- `components/benchmark-trigger-form.tsx`
- `agents/memory/PROJECT_STATE.md`
- `PLAYBOOK/measurement-platform-roadmap.md`

Behavior implemented:

- benchmark domains can now be added directly from `/dashboard/benchmarks`
- new domain creation upserts into `benchmark_domains` with `is_customer=true`
- the benchmark trigger form now shows the currently configured live execution lane
- the default model lane now follows the configured benchmark execution model instead of the old OpenAI placeholder
- this reduces false `skipped` runs when the first live lane is Gemini

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npm.cmd run build`

```text
> geo-pulse@0.1.0 build
> next build

Compiled successfully
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-022 is accepted. Admin benchmark testing can now move from sample-only seeded domains to real manually added domains without direct database edits.

---

### BM-023 — benchmark query-set onboarding from the admin UI for lightweight real-domain testing (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + build

#### Evidence

Added or updated:
- `components/benchmark-query-set-form.tsx`
- `app/dashboard/benchmarks/actions.ts`
- `app/dashboard/benchmarks/page.tsx`
- `agents/memory/PROJECT_STATE.md`
- `PLAYBOOK/measurement-platform-roadmap.md`

Behavior implemented:

- admins can now create a lightweight active benchmark query set directly from `/dashboard/benchmarks`
- query sets are created with name, version, optional metadata, and one query per line
- each line is stored as a v1 direct-intent query with stable generated keys
- this removes the last major sample-fixture bottleneck for first real benchmark verification from the UI

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npm.cmd run build`

```text
> geo-pulse@0.1.0 build
> next build

Compiled successfully
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-023 is accepted. The benchmark admin UI can now onboard both domains and lightweight query sets without relying on seeded sample data alone.

---

### BM-021 follow-up — preserve Gemini error bodies and fail all-failed benchmark run groups truthfully (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added or updated:
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

- Gemini benchmark adapter now stores the raw HTTP error body in `response_metadata.response_body`
- benchmark run groups now resolve to `failed` when all query runs fail and none complete or skip
- failed and completed query counts are now stored in run-group metadata
- this turns benchmark provider debugging into a visible admin signal instead of a generic `benchmark_gemini_http_400`

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-execution.test.ts lib/server/benchmark-runner.test.ts`

```text
Test Files  2 passed
Tests       12 passed
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** The benchmark provider debug path is materially improved. The next rerun should show the exact Gemini 400 body in the run detail metadata and mark all-failed runs accurately.

---

### UX-002 … UX-006 — audit journey clarity + state-driven report status (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code changes + `npm.cmd run type-check` + `npm.cmd run build`

#### Evidence

Updated files:

- `components/results-view.tsx`
- `components/deep-audit-checkout.tsx`
- `components/email-gate.tsx`
- `lib/client/loading-journeys.ts`
- `app/results/[id]/page.tsx`
- `agents/ORCHESTRATOR.md`
- `agents/memory/PROJECT_STATE.md`
- `docs/04-open-work-and-risks.md`

Behavioral changes implemented:

- Results page now shows one explicit audit journey: preview ready → choose next step → full audit in progress → report delivered
- Paid path is primary; preview-save remains available but visually secondary
- Removed page-level query-string success banner from `app/results/[id]/page.tsx`
- Results-page status is now driven by real `hasPaidReport` / `reportStatus` data instead of `?checkout=success` copy alone
- Full-audit generation now uses the centralized long-wait overlay through `useLongWaitEffect(data?.reportStatus === 'generating', reportLoadingJourney)`
- Preliminary and final audit loading copy now share one continuous story in `lib/client/loading-journeys.ts`

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial `npm.cmd run build` inside sandbox:

```text
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

Escalated retry `npm.cmd run build`:

```text
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
Using secrets defined in .dev.vars
 ✓ Compiled successfully in 19.9s
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/10) ...
   Generating static pages (2/10) 
   Generating static pages (4/10) 
   Generating static pages (7/10) 
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** UX-002 through UX-006 are implemented in repo. UX-007 remains pending for manual journey verification.

---

### UX-007 — guest + signed-in journey verification (2026-03-26)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** code-path verification notes + targeted Vitest + `npm.cmd run type-check`

#### Evidence

Verification notes:

- Guest/public results path: `lib/server/get-scan-for-public-share.ts` returns `hasPaidReport`, `reportStatus`, `pdfUrl`, and `markdownUrl`
- Signed-in results path: `app/api/scans/[id]/route.ts` returns the same shape for the owner-view path
- Shared UI consumer: `components/results-view.tsx` uses that common shape for journey steps, status card, report CTA, checkout CTA, and preview-save branch
- Shared state helper: `lib/client/results-journey.ts`

Covered states in `lib/client/results-journey.test.ts`:

- preview ready before payment
- checkout cancelled
- returned from checkout while awaiting payment confirmation
- full audit generating after payment confirmation
- report delivered

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial `npx.cmd vitest run lib/client/results-journey.test.ts` inside sandbox:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated retry `npx.cmd vitest run lib/client/results-journey.test.ts`:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  16:53:05
   Duration  839ms (transform 205ms, setup 0ms, import 263ms, tests 14ms, environment 0ms)
```

#### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** UX-007 is accepted as repo-side journey verification. Live operator smoke is still useful later, but the shared state model is now explicitly tested and logged.

---

### MCP — Cloudflare `set_active_account` (2026-03-24)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-24  
**Evidence type:** MCP tool output (`accounts_list` + `set_active_account`)

#### Evidence

`accounts_list` returned a single account; `set_active_account` succeeded (account id and display name redacted from this log):

```json
{"accounts":[{"id":"<REDACTED_CLOUDFLARE_ACCOUNT_ID>","name":"<REDACTED>","created_on":"2023-08-21T01:23:54.172733Z"}],"count":1}
```

```json
{"activeAccount":"<REDACTED_CLOUDFLARE_ACCOUNT_ID>"}
```

Follow-up: `kv_namespaces_list` returned `{"namespaces":[],"count":0}` — no KV namespaces yet; create `SCAN_CACHE` (prod + preview) and paste IDs into `wrangler.jsonc` for `wrangler dev`.

#### Orchestrator Decision
**Date:** _pending_  
**Decision:** _pending_  
**Notes:** _pending_

---

### MCP — Supabase migration audit `001` / `002` (2026-03-24)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-24  
**Evidence type:** Supabase MCP (`list_migrations`, `list_tables`, `execute_sql`)

#### Evidence

- **Project:** `geo_pulse` — `project_id` / `ref`: `vynrlgtxqnomxenakafn`
- **`list_migrations`:** `{"migrations":[]}` — no rows returned by the Management API migration list for this project (schema was applied outside that history, e.g. SQL Editor / one-off push).
- **`list_tables` (public):** `users`, `scans`, `leads`, `reports`, `agencies`, `payments`, `api_keys`, `api_usage`, `api_webhooks`, `webhook_deliveries` — all with `rls_enabled: true`.
- **Enums present (public):** `api_tier`, `payment_type`, `plan_type`, `scan_status`, `webhook_event` (matches `001` + `002`).
- **`pg_policies` count on `public`:** `10` (matches six policies from `001` + four from `002`).

**`apply_migration` not executed:** Re-running the full DDL from `supabase/migrations/001_initial_schema.sql` and `002_api_keys.sql` would fail with “already exists” errors because every table, enum, and RLS object is already present. No incremental “missing only” migration was defined in-repo.

**Recommended follow-up for CLI/history alignment:** From the repo, run `npx supabase link --project-ref vynrlgtxqnomxenakafn` and repair/baseline migration history per Supabase docs if you need `supabase db push` to stay in sync with remote — or continue treating remote as source of truth and avoid duplicate `apply_migration` calls.

#### Orchestrator Decision
**Date:** _pending_  
**Decision:** _pending_  
**Notes:** Accept as P0-003 evidence only if Orchestrator agrees “remote schema matches migrations + RLS on” satisfies the task without Supabase migration history rows.

---

### MCP — Cloudflare KV namespaces `SCAN_CACHE` (2026-03-24)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-24  
**Evidence type:** MCP `kv_namespace_create` + `wrangler.jsonc` updated  

#### Evidence

`kv_namespace_create` (production):

```json
{"id":"670fa578cf3b430687683445aac48eea","title":"geo-pulse-SCAN_CACHE","supports_url_encoding":true}
```

`kv_namespace_create` (preview — used by `wrangler dev`):

```json
{"id":"f1c7e4c68ddc464ab3bcf0517206611f","title":"geo-pulse-SCAN_CACHE_preview","supports_url_encoding":true}
```

`wrangler.jsonc` → `kv_namespaces[0]`: `binding` `SCAN_CACHE`, `id` `670fa578cf3b430687683445aac48eea`, `preview_id` `f1c7e4c68ddc464ab3bcf0517206611f`.

#### Orchestrator Decision
**Date:** _pending_  
**Decision:** _pending_  
**Notes:** _pending_

---

### Phase 0 — P0-002 / P0-003 / P0-004 / P0-005 / P0-006 evidence bundle (2026-03-24)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-24  
**Evidence type:** terminal output (npm, tsc, OpenNext build, wrangler dev) + anon REST probe + file checks  

#### Evidence

**P0-002 — `npm install`**

```
up to date, audited 709 packages in 2s
found 0 vulnerabilities
```
(exit code 0)

**P0-006 — `npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```
(exit code 0)

**P0-003 — Supabase schema** — Same remote object-level verification as log section “MCP — Supabase migration audit `001` / `002`”: core tables from `001_initial_schema.sql` plus API tables from `002_api_keys.sql` exist; all listed tables `rls_enabled: true`. Supabase Management `list_migrations` may remain empty until CLI link/repair; Postgres is the source of truth for this gate.

**P0-004 — RLS via anon key (PostgREST, not SQL Editor)**  
Request: `GET https://vynrlgtxqnomxenakafn.supabase.co/rest/v1/leads?select=id` with `apikey` + `Authorization: Bearer` set to the project **legacy anon** JWT (from Supabase Dashboard / `get_publishable_keys` MCP — **do not commit the JWT**).  
Response body: `[]`  
HTTP status: **200**  
Interpretation: anon role does not receive `leads` rows (no SELECT policy on `leads` for anon); consistent with ADR-004 / security rules.

**P0-005 — `wrangler dev` starts**  
After `npm run build:worker` (`opennextjs-cloudflare build`, exit 0 — excerpt: `OpenNext build complete.`, `Worker saved in .open-next\worker.js`), `npx wrangler dev` reported:

```
Using secrets defined in .dev.vars
...
⎔ Starting local server...
[wrangler:info] Ready on http://127.0.0.1:8787
```

Bindings included `SCAN_CACHE` (preview KV id), `SCAN_QUEUE (geo-pulse-scan-queue)` in **local** mode, `RATE_LIMITER` remote. Process stopped after verification.

**`.dev.vars`:** file exists at repo root (`Test-Path` True, size 1803 bytes). Contents not pasted (secrets).

**`.cursor/rules/`:** seven rule files present (`agents`, `api-service`, `base`, `frontend`, `security`, `solid`, `workers`).

#### Orchestrator Decision
**Date:** 2026-03-24  
**Decision:** ✅ ACCEPTED (session closure — Orchestrator may re-challenge if evidence insufficient)  
**Notes:** Phase 0 → Phase 1 gate per `ORCHESTRATOR.md` satisfied: type-check clean, Supabase tables + RLS, anon probe on `leads`, `wrangler dev` reached Ready.

---

### Phase 1 — implementation bundle (2026-03-24)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-24  
**Evidence type:** `npm run type-check`, `npm run build`, `npm run test` (vitest), key paths listed  

#### Evidence

**`npm run type-check`** — exit code 0 (re-run after Phase 1 code landed).

**`npm run build`** — Next.js 15 production build succeeded; routes include `/`, `/results/[id]`, `/api/scan`, `/api/scans/[id]`, `/api/leads`.

**`npm run test` (vitest)**

```
 Test Files  2 passed (2)
      Tests  13 passed (13)
```

Files: `workers/lib/ssrf.test.ts`, `workers/scan-engine/scoring.test.ts`.

**Implementation map (concise)**

- UI: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/results/[id]/page.tsx`, `components/scan-form.tsx`, `components/results-view.tsx`, `components/score-display.tsx`, `components/email-gate.tsx`, Tailwind `tailwind.config.ts`, `postcss.config.mjs`.
- APIs: `app/api/scan/route.ts` (Turnstile → rate limit → `runFreeScan` → insert `scans`), `app/api/scans/[id]/route.ts` (service_role read, free scan only, 48h window), `app/api/leads/route.ts` (Turnstile → email day limit → insert `leads`).
- Scan engine: `workers/scan-engine/run-scan.ts`, `fetch-page.ts`, `parse-signals.ts`, `scoring.ts`, `workers/scan-engine/checks/*`, `workers/scan-engine/checks/registry.ts`, `workers/providers/gemini.ts`, interfaces under `workers/lib/interfaces/`.
- Shared: `lib/server/turnstile.ts`, `lib/server/rate-limit-kv.ts`, `lib/server/cf-env.ts`, `lib/supabase/service-role.ts`.
- Next + OpenNext dev: `next.config.ts` calls `initOpenNextCloudflareForDev()`.

**Note (P1-004):** Target HTML is fetched with SSRF validation and a **bounded** body read; signals use **regex / string extraction** for portability (Node + Workers). **HTMLRewriter** streaming is not used in this path yet — follow-up if a standalone scan Worker splits from the Next bundle.

**Phase 1→2 gate (manual):** Run `npm run preview` (or `wrangler dev` after OpenNext build), complete a scan and email gate, confirm `leads` row and KV rate-limit keys — Orchestrator per `ORCHESTRATOR.md`.

#### Orchestrator Decision
**Date:** _pending_  
**Decision:** _pending_  
**Notes:** _pending_

---

### Phase 1→2 manual gate — operator report (2026-03-24)
**Agent:** Operator (Uzziel / team)  
**Claimed complete:** 2026-03-24  
**Evidence type:** End-to-end run in local/preview environment (user report)

#### Evidence

- Target URL: `https://techehealthservices.com/`
- Outcome: Results page showed **AI Search Readiness Score 46 / 100**, letter grade **F**, top issues (LLM Q&A check showed `http_400` finding; JSON-LD missing; title length 85 chars vs 10–70 band).
- Email gate: success message **“You are on the list.”** (lead capture path exercised).

**Follow-up (engineering):** `http_400` on the LLM check indicates **Gemini API HTTP 400** (model name, API version, or key scope) — not a verdict on site Q&A quality. Review `GEMINI_MODEL` / endpoint vs [Google AI Studio](https://ai.google.dev/) when hardening Phase 1 checks.

#### Orchestrator Decision
**Date:** _pending_  
**Decision:** _pending_  
**Notes:** Confirm `leads` + optional KV counters; then ACCEPT Phase 1→2 gate.

---

### Phase 4 — Launch bundle (2026-03-24)
**Agent:** Backend + Frontend + Security (documentation)  
**Claimed complete:** 2026-03-24  
**Evidence type:** `npm run type-check`, `npm run test`, `npm run build` output + file references + operator runbooks

#### Evidence — P4-005 Supabase keep-alive cron

**Implementation:** `wrangler.jsonc` — `triggers.crons`: `["0 12 * * *"]` (daily 12:00 UTC). `workers/cloudflare-entry.ts` — `scheduled` handler calls `pingSupabaseKeepAlive` (GET `${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/` with `apikey` + `Authorization` bearer anon key). `npm run cf-typegen` run (generates gitignored `cloudflare-env.d.ts`).

#### Evidence — P4-002 Share-your-score OG

**Implementation:** `lib/server/get-scan-for-public-share.ts` — shared visibility rules (guest `user_id === null`, 48h window) + `extractTopIssues`. `app/api/scans/[id]/route.ts` refactored to use it. `app/results/[id]/opengraph-image.tsx` — `next/og` `ImageResponse`; branded fallback when scan not shareable (no score leak). `app/results/[id]/page.tsx` — `generateMetadata` for dynamic title/description. Tests: `lib/server/get-scan-for-public-share.test.ts`.

**Note:** `twitter-image.tsx` omitted — platforms use `opengraph-image` / page metadata; avoids re-export `runtime` warning.

#### Evidence — commands (2026-03-24)

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit


```

```
> geo-pulse@0.1.0 test
> vitest run

 RUN  v4.1.1

 Test Files  8 passed (8)
      Tests  24 passed (24)
```

`npm run build` — succeeded (Next.js 15.5.14); routes include `ƒ /results/[id]/opengraph-image`.

#### Phase 4 — operator execution order (close the phase)

Complete **in this order**. Code tasks P4-002 + P4-005 are already done in repo; remaining work is **operator + dashboard**.

| Step | Task | Notes |
|------|------|--------|
| 1 | Pre-flight | `npm run type-check`, `npm run test`, `npm run build` (or CI green). |
| 2 | Lock production hostname | Final `https://<host>` for `NEXT_PUBLIC_APP_URL`, Stripe webhook, Supabase Auth redirects. |
| 3 | **Stripe Live checkpoint** | **Stop here — go to Stripe (see below).** You need live **Price ID**, **secret key**, **webhook signing secret** before production secrets are complete. |
| 4 | Cloudflare vars + secrets | Non-secrets in `wrangler.jsonc` / dashboard; `wrangler secret put` for all keys in P4-001 list (use **live** Stripe values from step 3). |
| 5 | Deploy | `npm run deploy` — paste success output below; evidence for P4-001. |
| 6 | Supabase Auth | Production site URL + redirect URLs for magic link. |
| 7 | P4-003 | SPF + DKIM + DMARC (Resend + DNS); attach evidence. |
| 8 | P4-004 | WAF rule for CVE-2025-29927; attach evidence. |
| 9 | Smoke + paid path | Free scan, login, dashboard, **one live payment** → webhook `checkout.session.completed` + PDF/email path. |
| 10 | P4-006 | Security sign-off on five blockers (table in this bundle) after steps 7–9 + production smoke. |

**Orchestrator:** After steps 5–10 evidence is pasted, update `PROJECT_STATE.md` task registry and Phase 4→Launch gate per `agents/ORCHESTRATOR.md`.

#### Operator evidence — Phase 4 production payment + deploy (2026-03-25)

**Production host:** `https://geo-pulse.uzzielt.workers.dev`  
**P4-001 / step 9 — Live Stripe:** Redirect to `/results/cfca0548-4d5f-4411-823a-2cad4b7b03cc?checkout=success` with UI **“Payment received.”** / Stripe confirmed checkout (screenshot in operator workspace). Confirms **`POST /api/checkout`**, Checkout Session, and success URL.  
**Implementation note:** `lib/server/cf-env.ts` — `pickEnvString` merges Worker `env` + `process.env` for payment-related keys (fixes prod `Stripe is not configured` when secrets were only on `process.env`).  
**P2-008:** Operator-verified **live** paid path on production hostname (not test mode).  
**Remaining for full Phase 4→Launch gate:** P4-003 (DNS), P4-004 (WAF), P4-006 (Security sign-off) — paste `dig`/screenshots + WAF rule + blocker checklist when ready.

---

##### → When to go get Stripe (Live) details

Do this **after step 2** (you know the final production hostname). Use **Live mode** in the Dashboard (not Test).

1. Open [Stripe Dashboard](https://dashboard.stripe.com) → turn **off** “Test mode”.
2. **Product catalog** → confirm the deep-audit product/price in **Live** → copy **Price ID** (`price_...`) → set production `STRIPE_PRICE_ID_DEEP_AUDIT` (same mechanism as `wrangler.jsonc` `[vars]` / Workers env — never commit secrets).
3. **Developers → API keys** → copy **Secret key** (`sk_live_...`) → set only via `wrangler secret put STRIPE_SECRET_KEY` (or dashboard secret).
4. **Developers → Webhooks → Add endpoint** → URL `https://<production-host>/api/webhooks/stripe` → subscribe to **`checkout.session.completed`** only (see `app/api/webhooks/stripe/route.ts`) → copy **Signing secret** (`whsec_...`) → `wrangler secret put STRIPE_WEBHOOK_SECRET`.

Then continue from **step 4** in the table above (remaining Cloudflare secrets, deploy, etc.).

---

#### P4-001 Production deploy — operator runbook

1. Set **vars** in Cloudflare Workers dashboard (or `wrangler vars`) for production: replace placeholders in `wrangler.jsonc` — `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, confirm `NEXT_PUBLIC_APP_URL` matches live hostname.
2. `wrangler secret put` for: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and any others listed in `wrangler.jsonc` comments.
3. Deploy: `npm run deploy` (runs `opennextjs-cloudflare build && wrangler deploy`).
4. Stripe Dashboard → Webhooks → endpoint URL `https://<production-host>/api/webhooks/stripe` (live signing secret in `STRIPE_WEBHOOK_SECRET`).
5. Supabase Dashboard → Authentication → URL configuration → add production site URL and redirect URLs for magic link.
6. Smoke test: home, scan, results, login, dashboard, paid path as applicable.

**Orchestrator:** paste wrangler deploy success + smoke checklist when executed; mark P4-001 ACCEPTED.

#### P4-003 SPF + DKIM + DMARC — operator checklist

- Use sending subdomain (e.g. `mail.geopulse.io`) per `.cursor/rules/security.mdc`.
- **SPF:** TXT on subdomain — `v=spf1 include:_spf.resend.com ~all` (or Resend’s current include).
- **DKIM:** TXT records from Resend dashboard for the domain.
- **DMARC:** TXT `_dmarc.<subdomain>` — start `v=DMARC1; p=none; rua=mailto:...`; escalate after monitoring.

**Evidence:** attach `dig TXT` / DNS provider screenshots + first successful Resend send from production `RESEND_FROM_EMAIL`.

#### P4-004 WAF CVE-2025-29927 — operator checklist

- Cloudflare dashboard → **Security** → **WAF** → **Managed rules** — enable the rule that blocks or mitigates **Next.js** / **`x-middleware-subrequest`** abuse (CVE-2025-29927), per `.cursor/rules/security.mdc`.
- Belt-and-suspenders: `middleware.ts` already rejects `x-middleware-subrequest`; WAF is defense in depth.

**Evidence:** dashboard screenshot or rule ID noted.

**Paid-plan note (2026-03-25):** Enabling the relevant **managed WAF** rules often requires a **paid Cloudflare plan** (Free tier is limited). Until upgraded, **do not block Phase 4 on P4-004 alone**: treat **application-layer mitigation** as sufficient for launch if **Security** documents it in **P4-006** — **`middleware.ts`** blocks `x-middleware-subrequest` (see `middleware.ts`), Next.js stays **patched** (CVE-2025-29927). **When budget allows:** enable the managed rule and paste evidence here.

#### P4-006 Launch security audit — five blockers (`.cursor/rules/security.mdc`)

| # | Blocker | Code / verification reference |
|---|---------|------------------------------|
| 1 | RLS on every table | Migrations `supabase/migrations/` — `001_initial_schema.sql` + follow-ons; spot-check anon PostgREST on `leads` (empty array). |
| 2 | SSRF on user URLs | `workers/lib/ssrf.ts` + `workers/lib/ssrf.test.ts`; scan fetch paths use validator. |
| 3 | Stripe webhook signature | `app/api/webhooks/stripe/route.ts` — `constructEvent`; idempotency `lib/server/stripe/checkout-completed.ts`. |
| 4 | Turnstile server-side | `lib/server/turnstile.ts`; `app/api/scan/route.ts`, `app/api/leads/route.ts`. |
| 5 | SPF + DKIM + DMARC | Satisfied when P4-003 evidence attached (no production marketing email before DNS). |

**Security agent sign-off:** Pending Orchestrator confirmation after P4-003/P4-004 operator evidence and production smoke tests.

#### Orchestrator Decision
**Date:** 2026-03-25 (partial)  
**Decision:** P4-001 + P2-008 **accepted** on operator evidence above (production URL + live payment). P4-003 / P4-004 / P4-006 **pending** evidence.  
**Notes:** P4-002 + P4-005 accepted on prior bundle; full Phase 4→Launch gate per `ORCHESTRATOR.md` when P4-003/004/006 are evidenced.

---

## DA-001 — Deep Audit Phase 0 (schema + crawl + cap)
**Agent:** Backend / implementation  
**Claimed complete:** 2026-03-25  
**Evidence type:** Unit test output + `npm run type-check` + `npm run build`

### Evidence

`npm run type-check`:
```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npm run test`:
```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 ✓  Test Files  9 passed (9)
      Tests  28 passed (28)
```

`npm run build`: completed with exit code 0 (Next.js production build + static generation).

**Migration (new):** `supabase/migrations/005_scan_runs_scan_pages.sql` — `scan_runs` (1:1 `scan_id`), `scan_pages`, RLS for authenticated users via owning `scans.user_id`. **Operator:** apply with `supabase db push` on production Supabase when deploying.

**Paid deep-audit smoke (operator, 2026-03-25):** Domain **`https://techehealthservices.com/`** — PDF email received with **Pages scanned** (10 URLs), site aggregate score (**52/100**), **Highlighted issues**, and **Per-page checklist** per URL (deterministic + homepage LLM checks). Confirms DA-001 multi-page path end-to-end.

### Orchestrator Decision
**Date:** 2026-03-25  
**Decision:** ✅ ACCEPTED  
**Notes:** Code evidence + paid smoke above. **Next:** **DA-002** (central fetch gate, robots/sitemap, section-aware sampling) — Security review required on outbound fetch / SSRF changes per `PROJECT_STATE.md`.

---

## DA-002 — Deep Audit Phase 1 (fetch gate + robots/sitemap + section sampling)
**Agent:** Backend  
**Claimed complete:** 2026-03-25  
**Evidence type:** Unit tests + `npm run type-check`

### Evidence

`npm run test`:
```
 ✓ Test Files  11 passed (11)
      Tests  36 passed (36)
```

`npm run type-check`: `tsc --noEmit` — 0 errors.

**Implementation:** `workers/lib/fetch-gate.ts` (`fetchGateText`, `fetchHtmlPage`) — manual redirects (≤ `ENGINE_FETCH_MAX_REDIRECTS` = 5), stream read byte cap, shared User-Agent. `workers/lib/ssrf.ts`: `validateEngineFetchUrl` (http/https ports 80/443 for **engine** only; user `/api/scan` unchanged HTTPS-only). `workers/scan-engine/robots-and-sitemap.ts` (robots.txt + `<loc>` sitemap parse). `workers/scan-engine/crawl-url-utils.ts` (`prioritizeUrlsBySection`, `pathSectionKey`). `workers/scan-engine/deep-audit-crawl.ts` — discovery order: robots → sitemaps (default `/sitemap.xml` if none) + seed HTML links → filter by `Disallow` → section-prioritized fetch list. `supabase/migrations/006_scan_pages_section.sql` adds `scan_pages.section`.

### Security agent
**Required:** Review `validateEngineFetchUrl`, `fetch-gate.ts`, and crawl URL policy (same-origin + robots). Sign off when satisfied per `agents/SECURITY_AGENT.md`.

### Orchestrator Decision
**Date:** 2026-03-25  
**Decision:** ✅ ACCEPTED (implementation)  
**Notes:** Security formal sign-off tracked above; **next** task **DA-003**.

---

## DA-003 — Deep audit reporting (payload, Markdown, R2, email policy)
**Agent:** Backend  
**Claimed complete:** 2026-03-25  
**Evidence type:** Unit tests + `npm run type-check`

### Evidence

`npm run test`:
```
 ✓ Test Files  12 passed (12)
      Tests  40 passed (40)
```

`npm run type-check`: `tsc --noEmit` — 0 errors.

**Implementation:** `workers/report/deep-audit-report-payload.ts` (`buildDeepAuditReportPayload`), `workers/report/build-deep-audit-markdown.ts`, `workers/report/build-deep-audit-pdf.ts` (`buildDeepAuditPdfFromPayload`), `workers/report/r2-report-storage.ts`, `workers/report/deep-audit-delivery-policy.ts` (`DEEP_AUDIT_ATTACH_MAX_BYTES` = 4 MiB). `workers/queue/report-queue-consumer.ts` — builds payload from `scan_pages` (incl. `section`) + `scan_runs.coverage_summary`, updates `full_results_json` with `reportPayloadVersion`, uploads PDF + Markdown to R2 when `REPORT_FILES` bound, sets `reports.pdf_url` when `DEEP_AUDIT_R2_PUBLIC_BASE` set; PDFs over 4 MiB require public links or job throws `deep_audit_pdf_oversize_configure_r2_public_base`. `workers/report/resend-delivery.ts` — `attachPdf` + optional `downloadLinks`; rejects misconfiguration when no attachment and no PDF URL. `wrangler.jsonc` — `r2_buckets` binding `REPORT_FILES`, var `DEEP_AUDIT_R2_PUBLIC_BASE`. `.github/workflows/ci.yml` — `npm run cf-typegen` before type-check (gitignored `cloudflare-env.d.ts`). Tests: `workers/report/deep-audit-report.test.ts`.

### Operator
Create R2 bucket `geo-pulse-deep-audit-reports` (or change `bucket_name`), enable public access / `r2.dev` subdomain, set **`DEEP_AUDIT_R2_PUBLIC_BASE`** in `[vars]` or dashboard to the public URL prefix (e.g. `https://pub-xxxxx.r2.dev`).

### Orchestrator Decision
_Pending review._

---

## DA-004 (incremental) — Politeness + crawl metrics
**Agent:** Backend  
**Claimed complete:** 2026-03-25  
**Evidence type:** Unit tests + `npm run type-check`

### Evidence

`npm run test`:
```
 ✓ Test Files  12 passed (12)
      Tests  41 passed (41)
```

`npm run type-check`: `tsc --noEmit` — 0 errors.

**Implementation:** `workers/scan-engine/robots-and-sitemap.ts` — `parseRobotsTxt` returns `crawlDelaySeconds` (from `Crawl-delay` under `User-agent: *` or global block; raw capped at 60s); `crawlDelayMsFromRobotsSeconds` caps applied delay at 10s. `workers/scan-engine/deep-audit-crawl.ts` — `await sleep` before each non-seed `fetchHtmlPage`; `pages_errored` counter; `scan_runs.coverage_summary` extended with `wall_time_ms`, `pages_errored`, `crawl_delay_ms`; `structuredLog('deep_audit_crawl_complete', …)`. **Out of scope (still deferred):** Cloudflare Workflows, per-host queue workers, 100+ page caps.

### Orchestrator Decision
_Pending review._

---

## ADM-001 … EVAL-004 — Admin password login + report eval pipeline (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, `npm run test`, `npm run build`, Supabase migration `009_admin_report_eval` applied to project `geo_pulse` (`vynrlgtxqnomxenakafn`)

### Evidence

**Migrations:** `supabase/migrations/009_admin_report_eval.sql` — `reports.markdown_url`, `reports.report_payload_version`, `public.report_eval_runs` with RLS enabled and no policies (service_role writes only).

**App:** `app/admin/login` (password sign-in; non-admin session cleared with generic error), `app/dashboard/evals` (service-role read after `requireAdminOrRedirect`), dashboard link for admin. **Worker:** `workers/queue/report-queue-consumer.ts` persists `markdown_url` + `report_payload_version` on `reports` insert.

**Eval:** `lib/server/report-eval-structural.ts` + tests; `scripts/report-eval-smoke.ts` + `npm run eval:smoke` (requires `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`); fixture `eval/fixtures/sample-deep-audit.md`.

`npm run type-check`:
```
> tsc --noEmit
(0 errors)
```

`npm run test`:
```
 Test Files  18 passed (18)
      Tests  91 passed (91)
```

`npm run build`: completed successfully (exit 0); routes include `/admin/login`, `/dashboard/evals`.

**Operator:** Enable Email **password** in Supabase Auth for the `ADMIN_EMAIL` user; bootstrap password in Dashboard → Users. Run `supabase db push` (or apply `009`) on any environment missing the new columns/table.

### Orchestrator Decision
_Pending review._

---

## P4-004 / P4-006 — CVE-2025-29927 middleware guard unit tests (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** Vitest output + `npm run type-check`

### Evidence

**Implementation:** `lib/server/middleware-cve.ts` (`shouldRejectForMiddlewareSubrequest`), covered by `lib/server/middleware-cve.test.ts`; `middleware.ts` calls the helper (belt-and-suspenders with patched Next.js).

`npm run test`:
```
 Test Files  19 passed (19)
      Tests  93 passed (93)
```

`npm run type-check`: `tsc --noEmit` — 0 errors.

**Purpose:** Automated regression for **P4-004** application-layer mitigation / **P4-006** launch security checklist (forged `x-middleware-subrequest`). Does not replace operator WAF/DNS evidence.

### Orchestrator Decision
_Pending review._

---

## AU-001 … AU-005 / AU-007 — Report integrity + product truth pass (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest output, `npm run build`, file diff summary

### Evidence

**Implementation**

- `workers/report/deep-audit-report-payload.ts`: added `allIssues` alongside `highlightedIssues` so executive-summary highlights and full sitewide breakdown are no longer conflated.
- `workers/queue/report-queue-consumer.ts`: added `buildSitewideIssueSummaryFromPages`; stores `highlightedIssues`, `allIssues`, `categoryScores`, and `coverageSummary` in `full_results_json`.
- `workers/report/build-deep-audit-markdown.ts`: score breakdown now uses `allIssues`; preserves v2 statuses; adds `Coverage Summary` and `Technical Appendix`.
- `workers/report/build-deep-audit-pdf.ts`: score breakdown now uses `allIssues`; preserves v2 statuses; adds `Coverage Summary`.
- `workers/report/deep-audit-report.test.ts`, `workers/report/build-deep-audit-pdf.test.ts`: updated fixtures/assertions for full-check rendering, preserved statuses, and coverage summary.
- `components/deep-audit-checkout.tsx`: removed inaccurate claim `Get all 17 checks across up to 10 pages` and replaced it with implementation-accurate copy.

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  04:23:59
   Duration  876ms (transform 263ms, setup 0ms, import 666ms, tests 89ms, environment 1ms)
```

**`npm run build`**

```
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 10.2s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...
```

### Orchestrator Decision
_Pending review._

---

## AU-009 / AU-010 — Report eval integrity rubric + golden fixtures (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest output, fixture additions

### Evidence

**Implementation**

- `lib/server/report-eval-structural.ts`: replaced the shallow section-presence rubric with a stronger content-integrity rubric covering title, executive summary, coverage summary, action plan, full check breakdown, pages section, technical appendix, status diversity, check row count, and page coverage count.
- `lib/server/report-eval-structural.test.ts`: now validates both the primary sample fixture and a status-diversity fixture with blocked / low-confidence states.
- `eval/fixtures/sample-deep-audit.md`: upgraded to a realistic multi-page report fixture with coverage summary, appendix, and multiple statuses.
- `eval/fixtures/sample-deep-audit-statuses.md`: added golden fixture covering `FAIL`, `BLOCKED`, `LOW_CONFIDENCE`, `NOT_EVALUATED`, `WARNING`, and `PASS`.
- `scripts/report-eval-smoke.ts`: rubric version bumped to `integrity-v2`.

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  04:34:37
   Duration  1.30s (transform 424ms, setup 0ms, import 1.11s, tests 124ms, environment 2ms)
```

### Orchestrator Decision
_Pending review._

---

## RE-001 / RE-002 — Retrieval eval scope + schema foundation (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, scope document, migration scaffold

### Evidence

**Implementation**

- `PLAYBOOK/retrieval-eval-foundation.md`: defines retrieval-eval MVP scope, inputs/outputs, non-goals, rollout, and explicit roles for `promptfoo` vs `ragas`.
- `supabase/migrations/010_retrieval_eval_foundation.sql`: adds service-role-only foundation tables:
  - `retrieval_eval_runs`
  - `retrieval_eval_prompts`
  - `retrieval_eval_passages`
  - `retrieval_eval_answers`

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Scope excerpt**

```
This document defines the first implementation boundary for retrieval evaluation in GEO-Pulse. It exists to keep `promptfoo`, `ragas`, and retrieval simulation work concrete and staged rather than aspirational.
```

**Migration intent excerpt**

```
-- Retrieval evaluation foundation (RE-002)
-- Service-role only tables for offline retrieval / answer-quality evaluation.
```

### Orchestrator Decision
_Pending review._

---

## AU-006 / AU-008 — Technical appendix + SSRF documentation truth pass (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest output, `npm run build`, report/doc updates

### Evidence

**Implementation**

- `workers/report/deep-audit-report-payload.ts`: added `technicalAppendix`.
- `workers/queue/report-queue-consumer.ts`: derives technical appendix summaries for:
  - robots / AI crawler access
  - schema findings
  - security headers
- `workers/report/build-deep-audit-markdown.ts`: `Technical Appendix` now includes technical summaries plus coverage payload.
- `workers/report/build-deep-audit-pdf.ts`: PDF now includes a `Technical Appendix` section in addition to coverage summary.
- `workers/report/deep-audit-report.test.ts`: asserts appendix headings and summary labels.
- `SECURITY.md`: SSRF section now states the actual protection model used in code and the Cloudflare Workers DNS-resolution limitation.
- `PLAYBOOK/prd.md`: SSRF paragraph updated to match implemented protections rather than claiming general-purpose DNS resolution.

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  04:44:20
   Duration  1.56s (transform 442ms, setup 0ms, import 1.18s, tests 205ms, environment 2ms)
```

**`npm run build`**

```
> geo-pulse@0.1.0 build
> next build

Using secrets defined in .dev.vars
   ▲ Next.js 15.5.14
   - Environments: .env.local

   Creating an optimized production build ...
 ✓ Compiled successfully in 15.3s
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (10/10)
   Finalizing page optimization ...
   Collecting build traces ...
```

### Orchestrator Decision
_Pending review._

---

## RE-003 — Deterministic retrieval simulation harness (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest output, retrieval harness module

### Evidence

**Implementation**

- `lib/server/retrieval-eval.ts`: added deterministic retrieval foundation with:
  - `buildPassagesFromPages(...)`
  - `simulateRetrievalForPrompt(...)`
  - lexical overlap scoring
  - top passage ranking
  - prompt-level metrics:
    - `retrievedExpectedPage`
    - `answerHasExpectedSource`
    - `answerMentionsExpectedFact`
    - `citationCount`
    - `unsupportedClaimCount`
- `lib/server/retrieval-eval.test.ts`: covers passage building, expected-page retrieval, expected-fact matching, and unsupported-answer fallback.

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  04:50:23
   Duration  499ms (transform 77ms, setup 0ms, import 111ms, tests 13ms, environment 0ms)
```

### Orchestrator Decision
_Pending review._

---

## RE-004 — Benchmark percentile design + claim removal (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** design note, contract/doc truth pass

### Evidence

**Implementation**

- `PLAYBOOK/benchmark-percentile-design.md`: added the minimum acceptable design for future percentile output:
  - cohort definition
  - eligibility rules
  - computation record
  - confidence guardrails
  - suggested API shape with cohort metadata
  - launch rule forbidding percentile wording until the pipeline exists
- `agents/memory/API_CONTRACTS.md`: removed the unsupported `benchmark_percentile` field from the example scan result and added an explicit note that percentile stays deferred until the benchmark pipeline exists.
- `PLAYBOOK/prd.md`: removed percentile from:
  - deep audit cover promise
  - share-image description
  - competitive percentile marketing claim
- `agents/FRONTEND.md`: OG-image guidance now explicitly forbids percentile until `RE-004` is implemented for real.
- `PLAYBOOK/audit-upgrade.md`: dashboard metric wording no longer assumes site-score percentile exists today.

**Decision**

```
Current product/API expectations do not include percentile output.
Percentile remains deferred until benchmark cohorts, snapshots, and guardrails exist.
```

**Reason**

```
There is no benchmark dataset, no cohorting policy, no recomputation pipeline, and no reproducible metadata trail for a percentile value yet.
```

### Orchestrator Decision
_Pending review._

---

## RE-005 — Promptfoo harness skeleton (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, `npm run eval:promptfoo`, package + harness files

### Evidence

**Implementation**

- `package.json`: added `promptfoo` dev dependency and scripts:
  - `eval:promptfoo`
  - `eval:promptfoo:report`
  - `eval:promptfoo:retrieval`
- `scripts/run-promptfoo.cjs`: wraps the Promptfoo CLI and redirects `HOME` / `USERPROFILE` to the repo root so Promptfoo writes `.promptfoo/` inside the workspace instead of the blocked user profile path.
- `.gitignore`: added `.promptfoo/`.
- `eval/promptfoo/providers/report-provider.cjs`: local deterministic provider for report-section extraction and status-preservation checks.
- `eval/promptfoo/providers/retrieval-provider.cjs`: local deterministic provider for retrieval-style answer/citation regression checks.
- `eval/promptfoo/promptfooconfig.report.yaml`: report regression suite covering:
  - executive summary extraction
  - coverage summary extraction
  - technical appendix extraction
  - non-binary status preservation
- `eval/promptfoo/promptfooconfig.retrieval.yaml`: retrieval regression suite covering:
  - expected-source retrieval with citations
  - no unsupported claims when the corpus is unrelated

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npm run eval:promptfoo`**

```
> geo-pulse@0.1.0 eval:promptfoo
> npm run eval:promptfoo:report && npm run eval:promptfoo:retrieval

> geo-pulse@0.1.0 eval:promptfoo:report
> node ./scripts/run-promptfoo.cjs eval -c eval/promptfoo/promptfooconfig.report.yaml --no-progress-bar

Results:
  ✓ 4 passed (100.00%)
  0 failed (0%)
  0 errors (0%)

> geo-pulse@0.1.0 eval:promptfoo:retrieval
> node ./scripts/run-promptfoo.cjs eval -c eval/promptfoo/promptfooconfig.retrieval.yaml --no-progress-bar

Results:
  ✓ 2 passed (100.00%)
  0 failed (0%)
  0 errors (0%)
```

**Constraint handled**

```
Promptfoo attempted to create C:\Users\Carine Tamon\.promptfoo, which is blocked by the sandbox.
The repo-local runner fixes this by setting HOME and USERPROFILE to the current workspace.
```

### Orchestrator Decision
_Pending review._

---

## RE-006 / RE-007 — Promptfoo suites + Ragas fit note (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run eval:promptfoo`, prompt suite expansion, architecture note

### Evidence

**Implementation**

- `eval/promptfoo/providers/report-provider.cjs`: added `Priority Action Plan` extraction path so prompt regressions can assert concrete fix guidance.
- `eval/promptfoo/promptfooconfig.report.yaml`: expanded report suite to cover:
  - executive summary extraction
  - coverage summary extraction
  - technical appendix extraction
  - priority action plan fix specificity
  - status preservation across non-binary statuses
- `PLAYBOOK/ragas-fit-evaluation.md`: added formal `RE-007` note with:
  - current repo-state review
  - explicit no-go decision for immediate `ragas` adoption
  - reasons for deferral
  - revisit criteria
  - constrained adoption plan if revisited later

**`npm run eval:promptfoo`**

```
> geo-pulse@0.1.0 eval:promptfoo
> npm run eval:promptfoo:report && npm run eval:promptfoo:retrieval

> geo-pulse@0.1.0 eval:promptfoo:report
Results:
  ✓ 5 passed (100.00%)
  0 failed (0%)
  0 errors (0%)

> geo-pulse@0.1.0 eval:promptfoo:retrieval
Results:
  ✓ 2 passed (100.00%)
  0 failed (0%)
  0 errors (0%)
```

**Ragas decision**

```
Decision: No-go for `ragas` implementation right now.
```

**Reason summary**

```
The baseline is still deterministic, the dataset is still synthetic / small, and there is no external benchmark claim that justifies adding semantic-scoring complexity yet.
```

### Orchestrator Decision
_Pending review._

---

## DA-004 (incremental) — Chunk-progress metrics + continuation guardrails (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest output, crawl/report updates

### Evidence

**Implementation**

- `workers/scan-engine/deep-audit-crawl.ts`:
  - extended `crawl_pending` state with:
    - `chunks_processed`
    - `started_at`
  - persists chunk-progress metadata on partial requeue state
  - adds continuation guardrail for invalid/stale chunk progression:
    - rejects and clears `crawl_pending` when `chunks_processed` exceeds the expected bound for the capped run
  - adds chunk metrics to final `coverage_summary`:
    - `chunk_size`
    - `chunks_processed`
    - `urls_remaining`
- `workers/report/build-deep-audit-markdown.ts`:
  - `Coverage Summary` now renders chunk-scale metrics when present
- `workers/report/build-deep-audit-pdf.ts`:
  - PDF `Coverage Summary` now renders chunk-scale metrics when present
- `workers/scan-engine/deep-audit-crawl.test.ts`:
  - covers legacy partial parsing defaults
  - covers parsing of new chunk-progress metadata

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  3 passed (3)
      Tests  11 passed (11)
   Start at  06:17:24
   Duration  1.18s (transform 830ms, setup 0ms, import 1.43s, tests 170ms, environment 1ms)
```

**Scope note**

```
This advances DA-004 observability and queue-continuation safety.
It does not implement the remaining Workflows-scale orchestration for 1000+ page crawls.
```

### Orchestrator Decision
_Pending review._

---

## T3-7 — Dynamic interactive report view (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, `npm run build`, frontend report-view implementation

### Evidence

**Implementation**

- `components/report-viewer.tsx` now owns a hybrid interactive report UI on top of the existing markdown artifact:
  - score + grade summary card
  - category snapshot cards from `categoryScores`
  - top-issue summary from `topIssues`
  - mobile section chips for quick jumps
  - collapsible report sections split from markdown `##` headings
  - existing PDF download and back-to-results navigation preserved
- `app/results/[id]/report/page.tsx` remains a thin route wrapper, consistent with frontend ownership boundaries in `agents/ORCHESTRATOR.md`

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npm run build`**

```
> geo-pulse@0.1.0 build
> next build

Compiled successfully
Route (app)
... /results/[id]/report 47.2 kB 153 kB
```

**Scope note**

```
This completes the frontend interactive report-view layer without introducing a new report API.
The client still consumes the existing scan fields plus markdown/PDF URLs.
Structured page-level deep-audit JSON exposure remains optional future work, not required for this T3-7 slice.
```

### Orchestrator Decision
_Pending review._

---

## DA-005 — Browser Rendering / SPA crawl (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, targeted Vitest, `npm run build`, deep-audit browser-render integration

### Evidence

**Implementation**

- `workers/scan-engine/browser-rendering.ts` provides:
  - env/config parsing for `DEEP_AUDIT_BROWSER_RENDER_MODE`
  - SPA-shell heuristics
  - rendered-vs-static HTML comparison
  - Cloudflare Browser Rendering client for `/browser-rendering/content`
- `workers/scan-engine/deep-audit-crawl.ts` now:
  - tracks browser-render attempt/success/failure metrics in `crawl_pending` and final `coverage_summary`
  - optionally renders SPA-like deep-audit pages after the normal fetch gate succeeds
  - falls back to raw HTML when rendering is unavailable or not materially better
- `workers/queue/report-queue-consumer.ts` now threads browser-render mode from `scan_runs.config.render_mode`
- `lib/server/stripe/ensure-deep-audit-job-queued.ts` stores `render_mode` on new paid `scan_runs`
- operator/env wiring added in:
  - `lib/server/cf-env.ts`
  - `wrangler.jsonc`
  - `.dev.vars.example`
  - `.env.local.example`
- security/docs updated in:
  - `SECURITY.md`
  - `PLAYBOOK/audit-upgrade.md`

**`npm run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Targeted Vitest**

```
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  3 passed (3)
      Tests  20 passed (20)
   Start at  07:01:42
   Duration  611ms
```

**`npm run build`**

```
> geo-pulse@0.1.0 build
> next build

Compiled successfully
Route (app)
... /results/[id]/report 47.2 kB 153 kB
```

**Scope note**

```
This completes DA-005 as an optional Browser Rendering-backed SPA fallback for paid deep audits.
It is not a full Cloudflare /crawl orchestration layer.
Browser Rendering remains disabled by default unless operator config and credentials are provided.
```

### Orchestrator Decision
_Pending review._

---

## RE-011 … RE-015 — Eval analytics metadata + Promptfoo writer + admin site history (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, Promptfoo harness output, file references, sandbox build/test note

### Evidence

**Implementation**

- `supabase/migrations/011_eval_run_metadata.sql`
  - adds `framework`, `domain`, `site_url`, and metadata fields needed for site-level eval history
  - extends both `report_eval_runs` and `retrieval_eval_runs`
- `lib/server/promptfoo-results.ts`
  - normalizes site/domain identity
  - summarizes Promptfoo JSON outputs into admin-friendly metrics
- `lib/server/promptfoo-results.test.ts`
  - covers domain normalization and Promptfoo result summarization
- `scripts/promptfoo-eval-write.ts`
  - runs Promptfoo with repo-local output
  - parses results
  - writes report or retrieval eval runs into Supabase
- `app/dashboard/evals/page.tsx`
  - merges report + retrieval eval tables
  - adds site filter, framework filter, trend chart, metric cards, and run history table
- `app/dashboard/page.tsx`
  - updates the admin entrypoint label to `Eval analytics`

**`npm.cmd run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npm.cmd run eval:promptfoo:report`**

```
> geo-pulse@0.1.0 eval:promptfoo:report
> node ./scripts/run-promptfoo.cjs eval -c eval/promptfoo/promptfooconfig.report.yaml --no-progress-bar

Results:
  ✓ 5 passed (100%)
  0 failed (0%)
  0 errors (0%)
```

**`npm.cmd run eval:promptfoo:retrieval`**

```
> geo-pulse@0.1.0 eval:promptfoo:retrieval
> node ./scripts/run-promptfoo.cjs eval -c eval/promptfoo/promptfooconfig.retrieval.yaml --no-progress-bar

Results:
  ✓ 2 passed (100%)
  0 failed (0%)
  0 errors (0%)
```

**Sandbox note — build/test runner**

```
> geo-pulse@0.1.0 build
> next build

unhandledRejection [Error: spawn EPERM] { errno: -4048, code: 'EPERM', syscall: 'spawn' }
```

`npx.cmd vitest run ...` also failed in this sandbox during Vite/Vitest startup with the same process-spawn restriction:

```
failed to load config ... Startup Error ... Error: spawn EPERM
```

This prevented local execution of the new Vitest file in this environment, but TypeScript passed and both Promptfoo suites executed successfully.

### Orchestrator Decision
_Pending review._

---

## RE-017 — Deterministic retrieval writer persisted into run/prompt/passage/answer tables (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, file references, sandbox execution note

### Evidence

**Implementation**

- `lib/server/retrieval-eval-writer.ts`
  - runs the existing deterministic retrieval harness over a fixture
  - aggregates run-level metrics for `retrieval_eval_runs`
- `lib/server/retrieval-eval-writer.test.ts`
  - covers aggregate scoring and domain normalization for the writer helper
- `scripts/retrieval-eval-write.ts`
  - reads a retrieval fixture
  - inserts one `retrieval_eval_runs` row
  - inserts related `retrieval_eval_prompts`, `retrieval_eval_passages`, and `retrieval_eval_answers` rows
- `eval/fixtures/retrieval-eval-sample.json`
  - sample fixture matching the current GEO-Pulse retrieval-eval use case
- `app/dashboard/evals/page.tsx`
  - adds `Deterministic Retrieval` as an explicit framework filter
- `PLAYBOOK/retrieval-eval-foundation.md`
  - now documents the active fixture shape and writer command

**`npm.cmd run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Sandbox execution note**

Attempted:

```
node --env-file-if-exists=.env.local --env-file-if-exists=.dev.vars .\node_modules\tsx\dist\cli.mjs scripts\retrieval-eval-write.ts --site-url https://example.com --prompt-set-name retrieval-sample
```

Observed:

```
Error: spawn EPERM
...
at ensureServiceIsRunning (...node_modules\esbuild\lib\main.js:2268:29)
```

This sandbox blocks the `tsx` / esbuild subprocess that the script uses for execution. The writer code type-checks, but the actual insert path still needs to be run in a normal local shell or CI runner with process spawning enabled.

### Orchestrator Decision
_Pending review._

---

## RE-018 — Retrieval drilldown page + auth-aware landing header (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, file references

### Evidence

**Implementation**

- `app/dashboard/evals/retrieval/[id]/page.tsx`
  - admin-only retrieval eval detail page
  - loads one `retrieval_eval_runs` row plus related prompt, passage, and answer rows
  - shows run metadata, prompt-level expected evidence, stored answer metrics, and selected passages
- `app/dashboard/evals/page.tsx`
  - adds `View detail` links for retrieval runs
- `components/site-header.tsx`
  - now checks the current Supabase session server-side
  - shows `Dashboard` only when logged in
  - shows `Sign out` for signed-in users
  - keeps `Sign in` / `Admin sign in` for signed-out users

**`npm.cmd run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

### Orchestrator Decision
_Pending review._

---

## DA-004 — Queue-scale deep-audit remainder (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm run type-check`, file references

### Evidence

**Implementation**

- `lib/server/deep-audit-page-limit.ts`
  - raises `MAX_DEEP_AUDIT_PAGE_LIMIT` from `120` to `1000`
- `workers/scan-engine/deep-audit-crawl.ts`
  - threads the configured `chunkSize` through finalization
  - fixes final coverage summary so `chunk_size` reflects the actual configured chunk size
  - keeps the existing queue continuation model and expands the reachable crawl size under that model
- `.dev.vars.example`
- `wrangler.jsonc`
- `lib/server/cf-env.ts`
  - updated comments/docs so env truth matches the new cap

**`npm.cmd run type-check`**

```
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**Scope note**

This closes the remaining code-side cap mismatch in the queue-scale DA-004 path.
It does not provide operator evidence for a real large multi-chunk production run, so `PROJECT_STATE.md` remains conservative and keeps DA-004 open until that proof exists.

### Orchestrator Decision
_Pending review._

---

## DA-004 — Queue-scale deep-audit completion (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm.cmd run type-check`, targeted Vitest output, crawl test implementation

### Evidence

**Implementation**

- `workers/scan-engine/deep-audit-crawl.test.ts`
  - adds a mocked multi-chunk crawl test with an in-memory Supabase stub
  - proves first pass returns `phase: 'partial'`
  - proves `crawl_pending.next_index`, `chunk_size`, and `chunks_processed` persist between queue turns
  - proves second pass completes, clears `crawl_pending`, and writes final `coverage_summary` with the configured chunk size
- `workers/scan-engine/deep-audit-crawl.ts`
  - already carries the queue continuation path, 1000-page cap, and final chunk-size reporting fixed earlier in this slice

**`npm.cmd run type-check`**

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npx.cmd vitest run workers/scan-engine/deep-audit-crawl.test.ts`**

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  14:15:22
   Duration  489ms (transform 163ms, setup 0ms, import 211ms, tests 14ms, environment 0ms)
```

**Scope note**

This closes DA-004 as the shipped queue-scale crawl path:
- politeness via `Crawl-delay`
- chunked queue continuation
- pending-state guardrails
- final chunk metrics
- 1000-page cap

Future Workflows adoption is now optional future scale work, not an unfinished DA-004 requirement.

### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** User explicitly reopened DA-004 despite Phase 4-first sequencing. Repo evidence now covers the multi-chunk continuation path directly, so the task is accepted as implementation-complete.

---

## UX-001 — Centralized delayed long-wait loading overlay (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** `npm.cmd run type-check`, `npm.cmd run build`, frontend implementation

### Evidence

**Implementation**

- `components/long-wait-provider.tsx`
  - added a centralized client-side provider for long waits
  - uses delayed escalation rather than immediate blocking
  - shows animated step progression only after the request passes a threshold
- `lib/client/loading-journeys.ts`
  - defines the step sequences for:
    - scan submit
    - results load
    - save results
    - checkout redirect
    - magic-link sign-in
    - admin sign-in
    - report load
- `app/layout.tsx`
  - mounts the provider once at the app root
- `components/scan-form.tsx`
- `components/deep-audit-checkout.tsx`
- `components/email-gate.tsx`
- `app/login/login-form.tsx`
- `app/admin/login/admin-login-form.tsx`
- `components/results-view.tsx`
- `components/report-viewer.tsx`
  - each flow now keeps its existing inline pending UI for short waits and opts into the centralized overlay for longer waits
- `app/globals.css`
  - adds the overlay animation primitives

**Recommended strategy implemented**

```text
1. Keep local button/inline pending states for the fast path.
2. Show the centralized overlay only after ~1.4s.
3. Use flow-specific step copy so the wait feels explainable rather than generic.
4. Reuse one provider at the app root instead of duplicating custom loaders per screen.
```

**`npm.cmd run type-check`**

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npm.cmd run build`**

```text
> geo-pulse@0.1.0 build
> next build

▲ Next.js 15.5.14
✓ Compiled successfully
✓ Generating static pages (10/10)
✓ Collecting build traces
```

**Note on earlier build failure**

```text
An earlier `next build` failure (`ENOENT ... .next/export/500.html`) coincided with a concurrent local `npm run build:worker`.
After the overlapping local build finished, `npm.cmd run build` passed cleanly.
```

### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED  
**Notes:** This is a bounded UI slice with build + type-check evidence. No deploy performed.

---

## P4-006 — Launch security audit evidence bundle refresh (2026-03-26)
**Agent:** Cursor / implementation assistant  
**Claimed complete:** 2026-03-26  
**Evidence type:** targeted Vitest output + `npm.cmd run type-check` + `npm.cmd run build`

### Evidence

**Implementation**

- `lib/server/turnstile.test.ts`
  - verifies server-side Turnstile handling for:
    - missing token
    - missing secret
    - successful verification
    - returned error codes
    - network failure
- `app/api/webhooks/stripe/route.test.ts`
  - verifies webhook route behavior for:
    - missing `stripe-signature`
    - invalid signature
    - unrelated event types ignored after verification
    - `checkout.session.completed` reaches the payment handler only after verified signature

**Launch-blocker evidence now covered in repo**

```text
1. RLS on every table:
   Existing migration truth + prior Supabase/PostgREST evidence already logged.

2. SSRF on user URLs:
   workers/lib/ssrf.test.ts included in the targeted security run.

3. Stripe webhook signature verification:
   app/api/webhooks/stripe/route.test.ts now covers missing/invalid signature and verified success path.

4. Turnstile server-side validation:
   lib/server/turnstile.test.ts now covers the verification helper directly.

5. SPF + DKIM + DMARC:
   Still operator-side and pending P4-003 evidence.
```

**`npm.cmd run type-check`**

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

**`npx.cmd vitest run lib/server/middleware-cve.test.ts lib/server/turnstile.test.ts workers/lib/ssrf.test.ts lib/server/stripe/checkout-completed.test.ts app/api/webhooks/stripe/route.test.ts`**

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

 Test Files  5 passed (5)
      Tests  25 passed (25)
   Start at  14:47:38
   Duration  1.33s (transform 1.43s, setup 0ms, import 1.75s, tests 606ms, environment 6ms)
```

**`npm.cmd run build`**

```text
> geo-pulse@0.1.0 build
> next build

▲ Next.js 15.5.14
✓ Compiled successfully
✓ Generating static pages (10/10)
✓ Collecting build traces
```

**Scope note**

This strengthens `P4-006` repo evidence and narrows the remaining launch gap to operator evidence:
- `P4-003` DNS / Resend setup
- `P4-004` final WAF policy decision
- final security sign-off referencing those operator facts

### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED as repo-side P4-006 evidence refresh; Phase 4 still not closed  
**Notes:** Launch remains blocked on `P4-003` and final `P4-006` operator/security sign-off.

---

## Phase 4 — operator blocker recorded: domain purchase / DNS paused (2026-03-26)
**Agent:** Founder / Orchestrator record  
**Claimed complete:** 2026-03-26  
**Evidence type:** operator statement

### Evidence

```text
Founder could not complete domain purchase due to a credit-card issue.
As a result, DNS setup for SPF / DKIM / DMARC cannot be completed yet.
```

**Impact**

```text
- P4-003 remains pending and operator-blocked.
- P4-006 final sign-off remains pending because blocker #5 (SPF / DKIM / DMARC) cannot be evidenced yet.
- P4-004 remains a separate launch-policy decision, but Phase 4 is not launch-closed.
```

**Resume condition**

```text
Once the card issue is resolved and the domain can be purchased / configured:
1. add the Resend DNS records
2. capture DNS / Resend verification evidence
3. update P4-003
4. complete final P4-006 sign-off
```

### Orchestrator Decision
**Date:** 2026-03-26  
**Decision:** ✅ ACCEPTED as blocker documentation  
**Notes:** This records the pause truthfully. It does not close Phase 4 and does not mark `P4-003` or `P4-006` done.

---

## Rejection History

_Agents whose claimed completions were challenged will be logged here for pattern tracking._

_No rejections yet._

---

### BM-030 — structured grounding provenance snapshot + benchmark run detail inspection (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `lib/server/benchmark-execution.test.ts`
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- grounded evidence now normalizes both legacy blobs (`sourceLabel` + `text`) and structured provenance records (`page_url`, `page_type`, `excerpt`, optional label) into one internal shape
- grounded prompts now include page provenance in the evidence line when it exists, while staying backward compatible with older evidence records
- benchmark run groups now persist a safe `grounding_evidence` snapshot plus `grounding_evidence_count` in metadata
- benchmark run detail now shows the grounding evidence used for the run, including page URL, page type, label, and excerpt when available
- this is the first inspectable provenance slice only; it does not build site evidence automatically and does not score exact-page citation quality yet
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-runner.test.ts lib/server/benchmark-execution.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  3 passed (3)
     Tests  25 passed (25)
  Start at  16:42:15
  Duration  2.54s (transform 322ms, setup 0ms, import 530ms, tests 2.07s, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-030 is accepted as the first structured provenance implementation slice. Grounded runs are now inspectable at the source-page evidence level without changing the benchmark truth that live grounding-context building and exact-page citation scoring are still future work.

---

### BM-031 — first minimal site-derived grounding-context builder (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- grounded runs now prefer manual `grounding_context.evidence` when present, but can fall back to a first minimal site-derived grounding builder when manual evidence is absent
- the builder uses the existing validated fetch path (`workers/lib/fetch-gate.ts`) rather than introducing a separate benchmark-only fetch path
- it fetches the homepage first, then discovers likely about/services pages from homepage links and derives bounded excerpts from those pages when available
- grounded run metadata now records whether grounding came from `metadata`, `site_builder`, or `none`, plus any grounding builder error string
- benchmark run detail now surfaces the grounding source and grounding error alongside the evidence snapshot
- this is intentionally narrow: it does not claim full crawl coverage, ranked page selection, or exact-page citation-quality scoring
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-runner.test.ts lib/server/benchmark-execution.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  3 passed (3)
     Tests  29 passed (29)
  Start at  16:56:44
  Duration  3.24s (transform 948ms, setup 0ms, import 1.40s, tests 2.25s, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-031 is accepted as the first live grounding-context builder slice. The benchmark can now derive bounded grounded evidence from the site itself when manual evidence is missing, while remaining honest that richer page selection and citation-quality scoring are still future work.

---

### AH-001 / AH-002 / AH-003 / AH-004 — architecture hardening backlog, persistent structured logs, admin logs page, and Playwright readiness (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** docs + migration + code changes + type check + targeted Vitest

#### Evidence

Added:
- `PLAYBOOK/architecture-hardening-backlog.md`
- `supabase/migrations/013_app_logs.sql`
- `lib/server/admin-logs-data.ts`
- `lib/server/admin-logs-data.test.ts`
- `lib/server/structured-log.test.ts`
- `app/dashboard/logs/page.tsx`

Updated:
- `lib/server/structured-log.ts`
- `workers/cloudflare-entry.ts`
- `app/dashboard/page.tsx`
- `agents/ORCHESTRATOR.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- added an explicit architecture hardening backlog covering lean-code discipline, observability, thin-route cleanup, large-module decomposition, admin-auth maturity, and Playwright readiness
- added `app_logs` as a service-role-only internal log table for structured application logs
- `structuredLog` now keeps console output and also persists logs best-effort to `app_logs`
- structured log payloads are sanitized before persistence:
  - sensitive keys are redacted
  - long strings are truncated
  - log persistence failures never break the caller
- added `/dashboard/logs` as an admin-only page for recent structured logs
- added a dashboard link to the new logs page
- Cloudflare scheduled-task failures now use the shared structured logging path instead of raw `console.error(JSON.stringify(...))`
- Playwright readiness is now explicitly tracked in the backlog with first candidate flows and selector/testability rules
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/structured-log.test.ts lib/server/admin-logs-data.test.ts lib/server/benchmark-grounding.test.ts lib/server/benchmark-runner.test.ts lib/server/benchmark-execution.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  5 passed (5)
     Tests  31 passed (31)
  Start at  19:57:52
  Duration  3.47s (transform 1.75s, setup 0ms, import 2.83s, tests 2.29s, environment 2ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-001 through AH-004 are accepted as the first architecture-hardening bundle. This work improves internal observability and future test readiness while keeping launch truth unchanged: Phase 4 is still blocked on `P4-003`, `P4-004`, and `P4-006`.

---

### AH-005 — first thin-route cleanup slice via shared admin runtime helper (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:
- `lib/server/admin-runtime.ts`

Updated:
- `app/dashboard/attribution/page.tsx`
- `app/dashboard/benchmarks/page.tsx`
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `app/dashboard/benchmarks/domains/[domainId]/page.tsx`
- `app/dashboard/evals/page.tsx`
- `app/dashboard/evals/retrieval/[id]/page.tsx`
- `app/dashboard/logs/page.tsx`
- `app/dashboard/benchmarks/actions.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- extracted a small shared admin runtime helper for repeated admin page and admin server-action setup
- the helper now owns:
  - admin session lookup
  - admin authorization check
  - env loading
  - service-role client creation
- updated the main admin pages and benchmark server actions to use that helper instead of repeating the same setup sequence inline
- this is a narrow cleanup only; it does not introduce a broad app-wide request-context abstraction
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/structured-log.test.ts lib/server/admin-logs-data.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  3 passed (3)
     Tests  7 passed (7)
  Start at  20:16:24
  Duration  764ms (transform 463ms, setup 0ms, import 756ms, tests 79ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-005 is accepted as the first thin-route cleanup slice. The admin surfaces now share a narrower setup seam while keeping the codebase honest about future cleanup still needed in larger modules and non-admin routes.

---

### AH-006 — first large-module decomposition slice for benchmark run detail (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:
- `components/benchmark-run-detail-view.tsx`
- `lib/server/benchmark-run-detail.test.ts`

Updated:
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- reduced the benchmark run-detail route to a thin page shell that only:
  - loads admin context
  - fetches the run-group detail
  - renders the shared detail view
- moved the heavy benchmark run-detail rendering into a dedicated component module
- reused the existing `lib/server/benchmark-run-detail.ts` helper seam for:
  - timestamp formatting
  - percent/count formatting
  - response-body extraction
  - grounding-evidence parsing
- added targeted tests for the extracted run-detail helpers so this decomposition is behavior-verified rather than cosmetic
- preserved the current benchmark detail behavior and UI surface; no benchmark methodology or metric semantics changed
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-run-detail.test.ts lib/server/benchmark-runner.test.ts lib/server/structured-log.test.ts lib/server/admin-logs-data.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  4 passed (4)
     Tests  10 passed (10)
  Start at  20:30:55
  Duration  2.32s (transform 1.78s, setup 0ms, import 2.58s, tests 223ms, environment 3ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-006 is accepted as the first large-module decomposition slice. The benchmark run-detail route is now easier to debug and maintain without turning this into a broad benchmark UI rewrite.

---

### AH-008 — first open-source Playwright browser smoke-test foundation (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** dependency + config/spec changes + type check + local Playwright run

#### Evidence

Added:
- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`

Updated:
- `package.json`
- `.gitignore`
- `.github/workflows/ci.yml`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- installed the open-source Playwright runner via `@playwright/test`
- added repo-local Playwright scripts:
  - `npm run test:e2e`
  - `npm run test:e2e:headed`
- added a repo-local Playwright config that starts the Next dev server with placeholder env for browser smoke tests
- added the first Chromium smoke coverage for:
  - landing page render + scan entry points
  - scan form submit blocked when Turnstile verification is missing
  - scan form happy path with mocked scan APIs through submit, redirect, and results render
  - results-page checkout return messaging before payment confirmation
  - customer login page render
  - admin login page render
  - unauthenticated benchmark page redirect to login with preserved `next` path
  - authenticated admin dashboard render after E2E session setup
  - authenticated benchmark overview render after E2E admin-data setup
- added a non-production-only E2E Turnstile bypass env so browser tests can exercise the scan submit path without weakening production behavior
- added a non-production-only E2E auth-session seam so browser tests can exercise the first authenticated admin case without changing production auth behavior
- added a non-production-only E2E admin-data seam for benchmark tables so browser tests can exercise the first authenticated benchmark admin page without changing production service-role behavior
- added Playwright output ignores for `playwright-report/` and `test-results/`
- wired the smoke suite into GitHub Actions CI
- this uses open-source Playwright only; no paid Playwright-hosted product is part of the setup
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Playwright attempt:

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Error: spawn EPERM
```

Escalated local Playwright run after browser install:

`npm.cmd run test:e2e`

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Running 9 tests using 4 workers

  ✓  home page renders the core scan entry points
  ✓  scan form blocks submit until verification is complete
  ✓  scan form submits and renders results with mocked scan APIs
  ✓  results page shows checkout return messaging before payment confirmation
  ✓  customer login page renders the magic-link flow
  ✓  admin login page renders the operator password flow
  ✓  unauthenticated benchmark page redirects to login with next path
  ✓  authenticated admin session renders dashboard admin actions
  ✓  authenticated admin session renders benchmark overview

  9 passed (1.5m)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-008 is accepted as the first real browser-level regression slice. GEO-Pulse now has an open-source Playwright safety net for public entry flows, while launch truth remains unchanged and broader E2E coverage stays as follow-on work.

---

### AH-009 — second large-module decomposition slice for report viewer (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest + Playwright

#### Evidence

Added:
- `lib/client/report-viewer.ts`
- `lib/client/report-viewer.test.ts`
- `components/report-viewer-sections.tsx`

Updated:
- `components/report-viewer.tsx`
- `tests/e2e/smoke.spec.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- reduced `components/report-viewer.tsx` to a state/fetch shell
- moved pure report-viewer helper logic into `lib/client/report-viewer.ts`
  - markdown toc extraction
  - markdown section splitting
  - score clamping
  - category severity/tone helpers
  - issue severity helpers
  - score narrative helper
- moved heavy report-viewer render sections into `components/report-viewer-sections.tsx`
  - toc sidebar
  - report summary
  - section chips
  - collapsible report sections
- added targeted helper tests for the extracted report-viewer logic
- added a Playwright browser proof for the report page using mocked scan + markdown content
- preserved the existing report-viewer UX surface while making the module easier to debug and maintain
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/client/report-viewer.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  4 passed (4)
```

Initial sandbox Playwright attempt:

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Error: spawn EPERM
```

Escalated Playwright:

`npm.cmd run test:e2e`

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Running 10 tests using 4 workers

  10 passed (1.5m)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-009 is accepted as the second large-module decomposition slice. The report viewer now has cleaner boundaries, helper-level tests, and a browser proof on the report route while launch truth remains unchanged.

---

### Benchmark milestone — first live benchmark verified on a real domain (2026-03-27)
**Agent:** Founder + Codex / verification record  
**Claimed complete:** 2026-03-27  
**Evidence type:** operator run evidence + admin UI verification

#### Evidence

Real benchmark run verified in admin against a real customer domain:

```text
Domain: techehealthservices.com
Display name: Teche Consulting
Model lane: gemini-2.5-flash-lite
Completed queries: 6
Failed queries: 2
Citation rows: 4
Query coverage: 75%
Citation rate: 67%
Share of voice: 100%
```

Observed query-level truth:

```text
- completed responses persisted and displayed in benchmark run detail
- citations were extracted from successful responses
- temporary Gemini overload surfaced as `benchmark_gemini_http_503`
- provider error body rendered in the run detail UI for failed queries
```

What this milestone proves:

```text
- benchmark domain onboarding works
- benchmark query-set onboarding works
- live model execution works
- raw responses are persisted
- citations are extracted
- metrics are computed and displayed
- benchmark admin inspection flow is operational
```

What it does not claim yet:

```text
- multi-model benchmark coverage
- competitor cohort benchmarking
- public benchmark methodology maturity
- retry/backoff hardening for transient provider overload
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED milestone  
**Notes:** This closes the “first live benchmark verified” milestone. Next benchmark implementation step is light retry/backoff handling for temporary `503 UNAVAILABLE` provider responses (`BM-024`).

---

### BM-025 — grounded benchmark v2 methodology note (2026-03-27)
**Agent:** Codex / design assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** design doc + sequencing update

#### Evidence

Added:
- `PLAYBOOK/benchmark-grounding-v2.md`

What it defines:

```text
- separate benchmark modes for:
  1. ungrounded brand inference
  2. grounded site-based interpretation
  3. citation/correctness inspection
- business-type misclassification as a real internal benchmark signal
- future protocol evolution without widening scope prematurely
- explicit sequencing: BM-024 retry/backoff first, grounded benchmark mode later
```

Why this was added:

```text
Founder validation showed a meaningful gap between:
- benchmark v1 answers from the raw API path
- Gemini chat’s more grounded business interpretation

The right response is methodology refinement, not benchmark sprawl.
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** This locks the next benchmark-methodology direction without drifting from the immediate implementation priority. `BM-024` remains the next code task.

---

### BM-024 — retry/backoff for transient benchmark-provider overload (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- Gemini benchmark execution now retries only transient provider failures (`429`, `503`)
- retries are bounded to 3 attempts total with small backoff delays
- successful retry attempts are recorded in `response_metadata.attempts`
- exhausted retries still fail truthfully and retain the final provider response body
- non-retryable hard failures (invalid key, unsupported model, 400-class request issues) are not retried
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-execution.test.ts lib/server/benchmark-runner.test.ts`

```text
Test Files  2 passed
Tests       14 passed
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** BM-024 is accepted. The benchmark execution path is now materially more reliable under temporary provider overload without widening the benchmark scope.

---

### BM-026 â€” first grounded benchmark foundation slice (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest + sandbox note

#### Evidence

Added:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`

Updated:
- `lib/server/benchmark-runner-contract.ts`
- `lib/server/benchmark-runner-contract.test.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `lib/server/benchmark-execution.ts`
- `lib/server/benchmark-execution.test.ts`
- `app/dashboard/benchmarks/actions.ts`
- `components/benchmark-trigger-form.tsx`
- `scripts/benchmark-runner.ts`
- `app/dashboard/benchmarks/[runGroupId]/page.tsx`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- benchmark runs now carry an explicit `runMode` contract:
  - `ungrounded_inference`
  - `grounded_site`
- all existing entry points default safely to `ungrounded_inference`
- benchmark-domain metadata can now supply `grounding_context.evidence` for grounded runs
- the execution adapter now builds mode-aware prompts instead of one hardcoded prompt shape
- grounded runs fail truthfully with `benchmark_grounded_context_missing` when evidence is absent
- the current live ungrounded benchmark flow remains the default path and was not replaced
- admin trigger UI, CLI runner, run-group metadata, and detail view now surface run mode
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  4 passed (4)
      Tests  25 passed (25)
   Start at  14:38:17
   Duration  2.89s (transform 621ms, setup 0ms, import 1.31s, tests 2.14s, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-026 is accepted as the smallest safe grounded-mode implementation slice. The repo now has an explicit grounded benchmark seam without changing the default ungrounded live benchmark behavior or implying grounded methodology is fully mature.

---

### BM-027 â€” grounded citation recovery prompt + alias citation coverage (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `lib/server/benchmark-citations.test.ts`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- grounded-site prompts now instruct the model to mention the exact target domain at least once when the evidence supports the target company
- this is intended to preserve the grounded business interpretation improvement while giving the conservative citation extractor an explicit domain mention to recover
- alias-based citation parsing remains supported and now has an explicit test covering configured aliases with spaces
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-citations.test.ts lib/server/benchmark-execution.test.ts`

```text
 RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse


 Test Files  3 passed (3)
      Tests  23 passed (23)
   Start at  15:22:29
   Duration  2.94s (transform 523ms, setup 0ms, import 763ms, tests 2.13s, environment 4ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-027 is accepted as a narrow grounded-mode follow-up. This should improve citation recovery for grounded runs without widening the benchmark surface or changing the ungrounded default path.

---

### BM-028 â€” page-level grounding provenance design note (2026-03-27)
**Agent:** Codex / design assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** playbook update + roadmap/state sync

#### Evidence

Updated:
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

What is now explicit:

```text
- the current grounded route is useful but does not yet prove exact-page sourcing
- the next grounded-methodology step is structured page-level provenance, not a vague future aspiration
- future grounded evidence should carry:
  - `page_url`
  - `page_type`
  - `excerpt`
  - optional `evidence_label`
- future benchmark analysis should separate:
  1. domain attribution
  2. page provenance
  3. page citation quality
```

Why this matters:

```text
Founder review surfaced an important product-truth distinction:
- “the model answered from site evidence”
is not the same as
- “the model cited the exact page that supported the answer”

The roadmap now records that distinction explicitly so future implementation and handoff decisions do not blur it.
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-028 is accepted as a design/roadmap clarification. This keeps benchmark methodology truth aligned across playbooks and the project ledger before the next implementation slice begins.

---

### BM-029 â€” grounded-site production prompt adopted from cross-model prompt research (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- replaced the previous grounded prompt with the synthesized production prompt based on Claude + Perplexity + Gemini review
- grounded prompt now explicitly says:
  - do not use outside knowledge
  - say so explicitly rather than inferring
  - paraphrase instead of copying long phrases
  - avoid marketing adjectives unless clearly supported
  - mention the target domain naturally at least once
- output instruction is now tighter and cleaner:
  - 3 to 5 sentences
  - plain text
  - brief ambiguity/incompleteness flag when needed
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-execution.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  18 passed (18)
  Start at  16:23:20
  Duration  2.92s (transform 230ms, setup 0ms, import 446ms, tests 2.08s, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-029 is accepted. The repo now uses the researched grounded-site prompt as the production benchmark prompt for the next live comparison run.
---

### AH-010 — third large-module decomposition slice for benchmark overview + Playwright smoke-lane stabilization (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest + Playwright

#### Evidence

Added:
- `components/benchmark-overview-view.tsx`
- `lib/server/benchmark-overview.ts`
- `lib/server/benchmark-overview.test.ts`

Updated:
- `app/dashboard/benchmarks/page.tsx`
- `playwright.config.ts`
- `tests/e2e/smoke.spec.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- reduced `app/dashboard/benchmarks/page.tsx` to a thin admin/data-loading shell
- moved benchmark overview rendering into `components/benchmark-overview-view.tsx`
- moved pure overview formatting and href helpers into `lib/server/benchmark-overview.ts`
- preserved the existing benchmark overview behavior and reused the existing authenticated benchmark overview Playwright case as the browser proof for this route
- hardened the Playwright smoke suite so it verifies behavior instead of brittle copy where appropriate:
  - scan-form blocked submit now proves `/api/scan` is not called without verification
  - checkout-return and report-page assertions now wait on stable UI states
- serialized the Playwright lane (`workers: 1`, `fullyParallel: false`) because that is the stable dev-server setting for the current repo and is preferable to a flaky parallel smoke lane
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-overview.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  2 passed (2)
  Start at  22:52:20
  Duration  552ms (transform 96ms, setup 0ms, import 140ms, tests 13ms, environment 0ms)
```

Initial sandbox Playwright attempt:

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Error: spawn EPERM
```

Escalated stabilized Playwright run:

`npm.cmd run test:e2e`

```text
> geo-pulse@0.1.0 test:e2e
> playwright test

Running 10 tests using 1 worker

  ✓  home page renders the core scan entry points
  ✓  scan form blocks submit until verification is complete
  ✓  scan form submits and renders results with mocked scan APIs
  ✓  results page shows checkout return messaging before payment confirmation
  ✓  report page renders interactive summary from mocked report content
  ✓  customer login page renders the magic-link flow
  ✓  admin login page renders the operator password flow
  ✓  unauthenticated benchmark page redirects to login with next path
  ✓  authenticated admin session renders dashboard admin actions
  ✓  authenticated admin session renders benchmark overview

  10 passed (2.1m)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-010 is accepted. The benchmark overview route now has cleaner boundaries without changing behavior, and the Playwright lane is intentionally serialized because that is the stable, maintainable smoke-test setting for the current dev-server path.

---

### AH-011 — fourth large-module decomposition slice for deep-audit report helpers (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:
- `workers/report/deep-audit-report-helpers.ts`
- `workers/report/deep-audit-report-helpers.test.ts`

Updated:
- `workers/report/build-deep-audit-pdf.ts`
- `workers/report/build-deep-audit-markdown.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- extracted shared deep-audit report preparation helpers into `workers/report/deep-audit-report-helpers.ts`
  - issue-row parsing
  - severity labeling
  - status labeling
  - coverage-payload parsing
  - executive-summary narrative generation
- updated the PDF builder to reuse the shared parsing/narrative helpers instead of owning all preparation logic itself
- updated the markdown exporter to reuse the shared executive-summary narrative helper and shared issue type instead of coupling that shape to the PDF module
- kept rendering behavior unchanged; this slice only reduced duplicated worker-side preparation logic
- because no customer/admin route behavior changed, no additional Playwright or manual UI route check was required for this slice
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run workers/report/build-deep-audit-pdf.test.ts workers/report/deep-audit-report-helpers.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  4 passed (4)
  Start at  23:33:45
  Duration  1.76s (transform 297ms, setup 0ms, import 1.17s, tests 194ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-011 is accepted. This keeps the deep-audit report generation path leaner without touching customer routes, so no additional UI testing is needed from the founder for this slice.

---

### AH-012 — fifth large-module decomposition slice for deep-audit crawl state helpers (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:
- `workers/scan-engine/deep-audit-crawl-state.ts`
- `workers/scan-engine/deep-audit-crawl-state.test.ts`

Updated:
- `workers/scan-engine/deep-audit-crawl.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- extracted pure crawl-pending state logic out of `workers/scan-engine/deep-audit-crawl.ts` into `workers/scan-engine/deep-audit-crawl-state.ts`
  - pending-state parsing
  - browser-render stat merging
  - config merging
  - continuation-window planning
- updated `deep-audit-crawl.ts` to reuse the shared state helpers while keeping fetch, audit, and persistence behavior in place
- added targeted state-helper tests for legacy pending-state parsing, continuation planning, and browser-render stat accumulation
- kept this slice worker-only; no customer/admin route behavior changed, so no new Playwright or manual UI route verification was required
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run workers/scan-engine/deep-audit-crawl.test.ts workers/scan-engine/deep-audit-crawl-state.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  10 passed (10)
  Start at  23:45:19
  Duration  1.63s (transform 528ms, setup 0ms, import 839ms, tests 53ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-012 is accepted. The crawl engine now has a cleaner pure-state seam without widening risk into fetch or UI behavior, so no founder-side route test is needed for this slice.

---

### AH-013 — sixth large-module decomposition slice for resend-delivery helpers (2026-03-27)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-27  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Added:
- `workers/report/resend-delivery-helpers.ts`
- `workers/report/resend-delivery-helpers.test.ts`

Updated:
- `workers/report/resend-delivery.ts`
- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- extracted pure resend-delivery composition helpers into `workers/report/resend-delivery-helpers.ts`
  - HTML escaping
  - base64 encoding
  - severity/grade color helpers
  - delivery CTA selection
- updated `workers/report/resend-delivery.ts` to reuse the shared helpers while keeping the actual Resend request path in place
- re-exported the shared download-link and email-issue types from `resend-delivery.ts` so existing callers like the queue consumer did not need broader churn
- kept this slice worker-only; no customer/admin route behavior changed, so no new Playwright or manual UI route verification was required
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: Build failed with 1 error:

[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run workers/report/resend-delivery-helpers.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  3 passed (3)
  Start at  23:55:02
  Duration  915ms (transform 166ms, setup 0ms, import 224ms, tests 17ms, environment 0ms)
```

#### Orchestrator Decision
**Date:** 2026-03-27  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-013 is accepted. The email-delivery path is leaner without touching route behavior, so no founder-side UI testing is needed for this slice.

---

### AH-007 — admin auth maturity plan (2026-03-28)
**Agent:** Codex / design assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code-path review + backlog/state sync

#### Evidence

Reviewed current admin auth implementation:

- `lib/server/require-admin.ts`
- `app/admin/login/actions.ts`

Current repo truth confirmed:

```text
- admin authorization currently depends on exact email match against `ADMIN_EMAIL`
- admin login currently uses Supabase password auth, then signs the user back out if the authenticated email does not match the admin identity
- this is fail-closed and acceptable for the founder-led internal stage, but not the long-term admin model
```

Documented the next-stage maturity plan in:

- `PLAYBOOK/architecture-hardening-backlog.md`
- `agents/memory/PROJECT_STATE.md`

The documented future path now explicitly says:

```text
- move from env-only admin authorization to a table-driven allowlist such as `admin_users`
- keep provisioning operator-controlled; do not add self-service admin grants
- support only a small explicit role set when needed
- preserve generic auth errors and fail-closed behavior
- log admin access denials and admin membership changes through the shared structured log path
- defer full RBAC, customer-facing admin management UI, and multi-tenant org role complexity
```

Runtime scope for AH-007:

```text
- no auth code path changed
- no UI route changed
- no new test run was required because this was a documentation/design completion slice only
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** ✅ ACCEPTED  
**Notes:** AH-007 is accepted as a design completion. The current founder-stage admin model remains truthful in code, and the next-step auth maturity path is now documented clearly enough for future handoff without implying a runtime auth upgrade has already shipped.
### BM-032 — exact-url grounded citation provenance slice (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** migration + code changes + type check + targeted Vitest

#### Evidence

Added:
- `supabase/migrations/014_benchmark_citation_grounding_provenance.sql`

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-citations.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-repository.ts`
- `lib/server/benchmark-admin-data.ts`
- `lib/server/benchmark-run-detail.ts`
- `components/benchmark-run-detail-view.tsx`
- `lib/server/benchmark-grounding.test.ts`
- `lib/server/benchmark-citations.test.ts`
- `lib/server/benchmark-runner.test.ts`
- `lib/server/benchmark-run-detail.test.ts`
- `lib/server/benchmark-admin-data.test.ts`
- `lib/server/benchmark-execution.test.ts`
- `lib/server/benchmark-metrics.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- grounded evidence snapshots now carry a deterministic `evidence_id` so run-time evidence items can be referenced stably
- query_citations now persist grounded provenance fields (`grounding_evidence_id`, `grounding_page_url`, `grounding_page_type`) through a narrow follow-up migration
- citation provenance matching is intentionally conservative: a citation is matched only when the parsed citation URL exactly matches a grounded evidence page URL after normalization
- domain-only mentions and ambiguous references remain unresolved instead of being guessed onto a page
- benchmark run detail now shows whether each citation matched a grounded source page or remained unresolved
- methodology docs now state the new boundary explicitly: first exact-url provenance slice exists, but excerpt-level matching and exact-page citation scoring are still future work
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-citations.test.ts lib/server/benchmark-runner.test.ts lib/server/benchmark-run-detail.test.ts lib/server/benchmark-admin-data.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  5 passed (5)
     Tests  32 passed (32)
  Start at  01:16:12
  Duration  2.24s (transform 2.05s, setup 0ms, import 3.01s, tests 358ms, environment 2ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-032 is accepted as the first citation-to-grounding provenance slice. Grounded benchmark runs can now preserve exact source-page attribution when the model cites the same page URL as the grounded evidence, while staying honest that broader provenance inference and citation-quality scoring are still future work.

---
### BM-033 — grounded-provenance sequence freeze (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** design doc updates + task-ledger sync

#### Evidence

Updated:
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- froze the next grounded-provenance implementation order after BM-032 so follow-up work remains staged rather than collapsing into a broad benchmark rewrite
- made the sequence explicit: bounded page selection and metadata first, then richer provenance matching, then excerpt-level evidence checks, then exact-page citation-quality metrics, then comparison UI
- recorded explicit non-goals: no guessed provenance on weak evidence, no customer-facing score claims from this sequence, and no replacement of the existing benchmark seams
- left BM-034 and later tasks pending so the design decision does not overstate implementation progress
```

Verification:

```text
Docs-only design slice. No code-path changes or runtime verification required.
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-033 is accepted as the sequencing/design checkpoint for the next benchmark-methodology work. The benchmark backlog is now explicit about what should happen next and what should not happen yet.

---
### BM-034 — bounded ranked grounding candidate selector (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- replaced the earlier homepage/about/services-only grounding page picker with a bounded ranked same-origin candidate selector
- the builder still fetches only a small number of pages, but now prefers stronger paths like about, services, and product/platform pages over lower-signal sections like blog, legal, or contact when stronger options exist
- the selector remains heuristic and bounded; it does not claim site-wide crawling or semantic best-page selection
- added tests proving the builder prefers stronger candidates and can fall back to other higher-signal pages when about/services links are absent
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  13 passed (13)
  Start at  02:00:04
  Duration  1.22s (transform 396ms, setup 0ms, import 519ms, tests 54ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-034 is accepted as the first grounding-page selection improvement slice. The builder now chooses a stronger bounded page set without widening into a broad crawl or changing the benchmark’s current architecture.

---
### BM-035 — richer grounding-page metadata in evidence snapshots (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-grounding.ts`
- `lib/server/benchmark-grounding.test.ts`
- `lib/server/benchmark-run-detail.ts`
- `lib/server/benchmark-run-detail.test.ts`
- `components/benchmark-run-detail-view.tsx`
- `lib/server/benchmark-citations.test.ts`
- `lib/server/benchmark-execution.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- grounded evidence items now preserve richer page metadata: `page_title`, `fetch_status`, `fetch_order`, and `selection_reason`
- site-builder evidence now records homepage seed vs ranked path-selection reasons while keeping the current bounded grounding flow intact
- grounding snapshots serialize this metadata into run-group metadata and the run-detail helper parses it back safely
- benchmark run detail now exposes the extra metadata in the existing grounding evidence cards without changing the route shape or introducing a new benchmark surface
- this remains internal inspection metadata only and does not add a customer-facing score or new schema table
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-grounding.test.ts lib/server/benchmark-run-detail.test.ts lib/server/benchmark-citations.test.ts lib/server/benchmark-execution.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  4 passed (4)
     Tests  36 passed (36)
  Start at  02:13:16
  Duration  3.18s (transform 1.19s, setup 0ms, import 1.54s, tests 2.16s, environment 3ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-035 is accepted as the metadata-enrichment slice for grounded evidence. Later provenance work now has better inspectable inputs without widening the benchmark architecture or changing the current admin-flow shape.

---
### BM-036 — normalized page-equivalence provenance matcher (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-citations.ts`
- `lib/server/benchmark-citations.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- added a second conservative citation-to-grounding matcher beyond exact URL string equality
- page URLs can now match by normalized page equivalence when weak URL-shape differences are the only difference: `www`, trailing slash, fragment, default port, and tracking params are ignored
- the matcher still refuses to guess across different paths, different pages on the same domain, or domain-only mentions
- matched provenance now records either `exact_url` or `normalized_page`, keeping the benchmark methodology explicit rather than collapsing all matches into one bucket
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-citations.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  15 passed (15)
  Start at  02:26:38
  Duration  2.70s (transform 1.29s, setup 0ms, import 1.70s, tests 245ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-036 is accepted as the second conservative provenance matcher. The benchmark can now preserve more real page-equivalent citations without widening into semantic or guessed provenance.

---
### BM-037 — internal claim-to-evidence overlap metadata (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-citations.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-citations.test.ts`
- `lib/server/benchmark-runner.test.ts`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- matched grounded citations now carry a lightweight claim-to-evidence overlap signal in metadata
- the runner selects a best claim sentence from the response, compares token overlap against the matched evidence excerpt, and stores a conservative status such as `supported_overlap`, `weak_overlap`, `no_overlap`, or `unavailable`
- this layer is metadata only: it does not create a new benchmark score, does not claim semantic fact checking, and does not widen the schema
- sentence selection now prefers substantive claim sentences over boilerplate `Source:` lines so the overlap signal is more useful for internal inspection
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-citations.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  17 passed (17)
  Start at  02:40:32
  Duration  1.57s (transform 733ms, setup 0ms, import 1.15s, tests 188ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-037 is accepted as the first claim-to-evidence metadata slice. Grounded benchmark runs now preserve a conservative overlap signal for internal inspection without overstating it as a benchmark score or semantic verifier.

---
### BM-038 — first exact-page citation-quality metric slice (2026-03-28)
**Agent:** Codex / implementation assistant  
**Claimed complete:** 2026-03-28  
**Evidence type:** code changes + type check + targeted Vitest

#### Evidence

Updated:
- `lib/server/benchmark-metrics.ts`
- `lib/server/benchmark-metrics.test.ts`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-runner.test.ts`
- `components/benchmark-run-detail-view.tsx`
- `PLAYBOOK/benchmark-grounding-v2.md`
- `PLAYBOOK/measurement-platform-roadmap.md`
- `agents/memory/PROJECT_STATE.md`

Behavior implemented:

```text
- added the first exact-page citation-quality metric as an internal benchmark signal: `exact_page_quality_rate`
- the metric counts completed runs where the measured-domain citation both matches a grounded page and has a `supported_overlap` claim/evidence signal
- this metric is explicitly separate from citation presence and share-of-voice
- the runner now stores the quality rate and supporting matched/supported run counts in run metadata so the existing run-detail view can inspect them without widening the benchmark UI surface
- this remains an internal benchmark-quality metric only, not a customer-facing score
```

Verification:

`npm.cmd run type-check`

```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

Initial sandbox Vitest attempt:

```text
failed to load config from C:\Users\Carine Tamon\Desktop\CLAUDE WORKSPACE\projects\geopulse\geo-pulse\vitest.config.ts

Startup Error
Error: Build failed with 1 error:
[plugin externalize-deps]
Error: spawn EPERM
```

Escalated targeted Vitest:

`npx.cmd vitest run lib/server/benchmark-metrics.test.ts lib/server/benchmark-runner.test.ts`

```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  2 passed (2)
     Tests  8 passed (8)
  Start at  02:48:14
  Duration  1.45s (transform 710ms, setup 0ms, import 1.00s, tests 160ms, environment 1ms)
```

#### Orchestrator Decision
**Date:** 2026-03-28  
**Decision:** âœ… ACCEPTED  
**Notes:** BM-038 is accepted as the first exact-page citation-quality metric slice. The benchmark now has a narrow internal quality metric that is clearly separated from citation presence and share-of-voice.

---
