# Open Work And Risks

## Launch Blockers

### P4-003
SPF / DKIM / DMARC still needs operator completion and evidence.
Current blocker: domain is now purchased, but DNS / Resend setup and evidence are still pending.

### P4-006
Launch security sign-off is still pending.
It cannot be fully closed until `P4-003` DNS evidence exists.

### P4-004
Managed Cloudflare WAF remains unresolved as an operational decision.
Current repo mitigation exists, but the operational closure is not done.

### Production domain cutover
Still open:
- route `getgeopulse.com` to the live app in Cloudflare
- update Turnstile, Supabase Auth, and Stripe webhook/return assumptions to the custom domain
- collect operator evidence for the custom-domain cutover before final `P4-006`

## Engineering Work Still Open

### MA-005
Deferred:
- queue-backed marketing ingestion hardening
- replay / DLQ path for analytics events

### Content machine planning -> implementation gap
Still open:
- wire the new canonical content tables into real create/edit flows instead of PLAYBOOK-only drafts
- decide the canonical on-site publishing surface for GEO-Pulse articles
- add the first editor/admin workflow for importing or creating content items
- add adapter-based newsletter API integration on top of `content_distribution_deliveries`
- connect provider credentials / env checks to `content_distribution_destinations.availability_status`
- add an explicit pre-publish LLM-readiness check before on-site publish

### RE-008 to RE-010
Still pending:
- ragas pipeline if explicitly approved later
- prompt-cluster / demand-layer analysis
- citation / share-of-voice benchmarking methodology

### RE-016
Still pending:
- actual offline `ragas` writer / persistence path
- metric ingestion into the admin eval analytics page

### Audit journey UX clarity
Still open:
- adjust any copy or edge-case states found during future live-user observation
- keep validating the top-of-page results action band against real founder/customer usage so the primary next step stays obvious

### Retrieval eval detail UX
Still open:
- latest-vs-previous comparison at the prompt level

### Layer One report rewriter hardening
Still open:
- reduce unsupported claims and false certainty in rewritten reports
- apply the new local rewrite-prompt seam in the actual report-review workflow
- decide later whether the constrained rewrite prompt should stay operator-only or become part of a broader product/report pipeline
- keep optional GEO strategy clearly separated from audit-backed remediation
- review real internal rewritten artifacts against deterministic reports before deciding whether any paid default should change
- add a tighter aggregate review loop for rewritten-report quality over time, now that per-report operator judgments can be recorded

### Report Design — implementation still open
Design contracts frozen; RD-007 (team-owner map) shipped. See `docs/01-current-state.md` for what is done.
Still open (Phase B — no start date yet):
- use the now-rendered `Immediate Wins` markdown section as the validation point before exposing more owner-aware sections
- decide whether the current deterministic `Immediate Wins` wording is good enough for paid reports, or whether one more shaping pass is needed before adding Team Action Map
- continue trimming noisy report copy that weakens trust, especially repetitive per-page guidance and raw low-confidence evidence leakage
- continue reducing customer-facing ambiguity around low-confidence LLM checks so bounded wording does not read like confirmed diagnosis
- continue cleaning obviously broken or machine-looking guidance strings at the check source before broader report redesign
- decide later whether the per-page section should stay as non-passing rows only or be compressed further into page-level summaries
- update markdown builder to output new section order (RD-011)
- build Team Action Map section grouped by owner (RD-010 contract not yet written)
- PDF redesign to match new structure (RD-014 through RD-018)
- web report viewer reorder (RD-019 through RD-021)
- update structural eval assertions for new sections (RD-022)
- wire Layer One rewriter as paid default only after validation on real reports (no start date)

### API-002 to API-007
Still deferred until launch closure.

### Measurement platform initiative
Planned, not implemented:
- 1000-site benchmark operations

Current guidance:
- keep the current audit/report product intact
- add the benchmark layer as a staged internal platform
- do not market benchmark capabilities as shipped before the underlying pipeline exists
- start recurring benchmark collection slowly:
  - one vertical at a time
  - one frozen query set version
  - one frozen model lane
  - twice-daily windows only after explicit schedule opt-in on imported seed domains
- use the current run-detail lineage view for inspection before widening cohort claims
- keep competitor/cohort work narrow and internal even though the first stored cohort frame now exists
- keep multi-model support narrow too: multiple enabled lanes on the current execution seam, not a new orchestration surface
- keep benchmark scale hardening on the current cron/log path until real workload pressure justifies queue or service splits
- the current decision is still "do not split yet"; 500 to 1000-site ops remain downstream of real operator evidence
- for the first live `law_firms` lane on `gemini-2.5-flash-lite`, treat grounded citation-rate deltas as the current internal signal and do not over-read `exact_page_quality_rate` yet:
  - the first window completed cleanly
  - diagnostic outliers showed mostly domain-level grounded citations rather than page URLs
  - that means `0%` exact-page quality is currently a lane-behavior truth, not enough evidence by itself to justify a provenance-matcher rewrite
- after two comparable windows on the same frame, keep the decision conservative:
  - continue collecting this lane as a domain-level grounded attribution lane
  - do not widen scale or change methodology yet
  - do not prioritize provenance-matcher work for this lane unless new evidence shows page URLs that should have matched
- the next methodology risk is now clearer:
  - the current `law_firms` lane is a mixed cohort with many low-fit domain/query pairs
  - a future redesign should split cohort and query-set work together instead of treating "law firms" as one clean frame
  - the first redesign target is now intentionally narrow: `business_counsel / biglaw / enterprise`
  - future work should not reopen the target subgroup until the first narrow replacement lane is tested
  - the new business-counsel query-set fixture is only a draft; it should not be seeded or scheduled until the exact target-domain list is frozen too
  - the first narrow target-domain list is now frozen at 17 domains, so the next risk is execution discipline: the narrow lane should be launched as a separate experiment, not by silently mutating the broad current lane
  - after the first narrow window, the next discipline risk is premature optimization: the narrow lane already improved signal quality, so the team should collect repeated comparable windows before changing prompt/model/evidence-depth
  - after three narrow windows, the next discipline risk is scope creep: the team should not open a second law-firms sub-cohort or infrastructure experiment until the primary business-counsel lane has enough history to be trusted as the main frame
  - repeated-window evidence review should stay lean too: prefer the new explicit recurrence helper before building any broader trend or aggregation surface

## Risks

### Operational truth gap risk
The biggest remaining risk is not basic code absence, but operators assuming the repo is fully launch-closed when the security gate is not.

### Browser Rendering scope confusion
DA-005 is done only as a Browser Rendering fallback for paid deep audits.
It is not a general crawler platform or full `/crawl` implementation.

### Deep-audit extreme-scale risk
The shipped queue-scale path is implemented and unit-verified, but truly extreme production crawls may still justify future Workflows adoption or operator benchmarking.

### Documentation drift risk
The new `docs/` set should be kept aligned with:
- `agents/memory/PROJECT_STATE.md`
- `agents/memory/COMPLETION_LOG.md`
- `SECURITY.md`
- `PLAYBOOK/`

This now also includes the content-machine planning set:
- `.agents/product-marketing-context.md`
- `PLAYBOOK/content-machine-v1-blueprint.md`
- `PLAYBOOK/blog-llm-readiness-spec.md`
- `PLAYBOOK/content-writing-skill-spec.md`
- `PLAYBOOK/content-machine-inputs/*`

And the new implementation seam:
- `supabase/migrations/016_content_machine_foundation.sql`
- `supabase/migrations/017_content_distribution_destinations.sql`
- `lib/server/content-admin-data.ts`
- `lib/server/content-destination-admin-data.ts`
- `app/dashboard/content/page.tsx`

### Provider lock-in risk
If GEO-Pulse jumps straight to one newsletter API without keeping the admin-controlled destination layer as the source of truth, the content machine can silently become vendor-shaped. The new destination registry reduces that risk, but only if future integration work continues to target adapters and feature flags instead of hard-coding one provider path.

### GEO credibility risk
If GEO-Pulse publishes blog and newsletter content that is not itself structured for LLM extractability, the company creates a product-truth gap: selling AI-search readiness while failing to model it on its own domain.

### Product truth risk in the audit journey
The repo now uses state-driven report status on the results page, a real share-snapshot action, a PDF-only report fallback, and explicit paid-report recovery guidance. It should still be manually tested against real checkout return, webhook timing, and delivered-report states before broader onboarding.

### Layer One report trust drift risk
If rewritten Layer One reports blend audit facts with speculative GEO strategy, the product can produce polished but weakly supported recommendations. That creates customer-trust risk even if the underlying audit signals are directionally useful.

### Layer One false-certainty risk
If the rewrite layer turns weak signals like `402/403`, partial structure detection, or stale pages into hard diagnosis, GEO-Pulse can overstate what its audit actually proved. That is a report-quality problem even when the underlying findings are directionally correct.

### Layer One inflated-tone risk
If rewritten reports sound like trend essays or consultancy whitepapers, customers may distrust even the accurate parts. The report should sound like a careful operator assessment, not like a manifesto about the future of AI search.

### Layer One actionability drift risk
If recommendations vary between vague strategy language and concrete fixes, customers will get inconsistent report quality even when the findings are correct. The action section needs a stable, compact format so operators can see what to do next without reinterpretation.

### Layer One ambiguous-signal overreach risk
If the rewrite layer treats non-binary signals like `402/403`, low-confidence extraction, or partial schema as if they were fully diagnosed causes, the report will become less trustworthy precisely on the issues where careful wording matters most.

### Eval identity drift risk
The new admin eval history depends on stable site identity.
If operators vary `--site-url`, `--domain`, prompt-set names, or rubric versions across runs for the same target, trend charts will become misleading or fragmented.

### Benchmark-methodology risk
The v3 direction depends on credible methodology, not just more infrastructure. If the team scales query-running before freezing query taxonomy, citation parsing, and cohort rules, GEO-Pulse could create noisy benchmark claims that are hard to defend later.

### Benchmark metric interpretation risk
The first live `law_firms` window shows meaningful grounded-vs-ungrounded citation deltas alongside `0%` exact-page quality. If operators interpret that as a simple matcher bug without evidence, the team could waste time on provenance rewrites instead of collecting disciplined comparable windows and documenting the real current behavior: domain-level grounded attribution.

### Benchmark premature-optimization risk
After two clean windows, the riskiest move would be reacting to the `0%` exact-page metric with heavier provenance engineering before the lane shows page-level citation behavior at all. That would add maintenance cost without clear evidence that the current bottleneck is in matching rather than in model output shape.

### Benchmark cohort-fit risk
The current broad `law_firms` lane mixes business-counsel firms, immigration, divorce, PI, and employment specialists under one query set. If operators redesign queries without first narrowing the cohort, GEO-Pulse may improve wording while leaving the main signal-quality problem in place.

## Recommended Next Order

1. Close `P4-003`
2. Close `P4-006`
3. Make the final `P4-004` call
4. Observe the updated audit journey in real usage and polish only if new edge cases appear
5. Keep the measurement-platform work in planning / internal-foundation mode (`BM-001` ... `BM-008`) without disrupting launch truth
6. Revisit extreme-scale crawl benchmarking only if real usage pushes past the shipped queue path
7. Only then consider API layer or deeper retrieval backlog
