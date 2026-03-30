# Open Work And Risks

## Launch Blockers

### P4-003
SPF / DKIM / DMARC still needs operator completion and evidence.
Current blocker: domain purchase / DNS setup is paused due to a credit-card issue.

### P4-006
Launch security sign-off is still pending.
It cannot be fully closed until `P4-003` DNS evidence exists.

### P4-004
Managed Cloudflare WAF remains unresolved as an operational decision.
Current repo mitigation exists, but the operational closure is not done.

## Engineering Work Still Open

### MA-005
Deferred:
- queue-backed marketing ingestion hardening
- replay / DLQ path for analytics events

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

### Product truth risk in the audit journey
The repo now uses state-driven report status on the results page, a real share-snapshot action, a PDF-only report fallback, and explicit paid-report recovery guidance. It should still be manually tested against real checkout return, webhook timing, and delivered-report states before broader onboarding.

### Eval identity drift risk
The new admin eval history depends on stable site identity.
If operators vary `--site-url`, `--domain`, prompt-set names, or rubric versions across runs for the same target, trend charts will become misleading or fragmented.

### Benchmark-methodology risk
The v3 direction depends on credible methodology, not just more infrastructure. If the team scales query-running before freezing query taxonomy, citation parsing, and cohort rules, GEO-Pulse could create noisy benchmark claims that are hard to defend later.

### Benchmark metric interpretation risk
The first live `law_firms` window shows meaningful grounded-vs-ungrounded citation deltas alongside `0%` exact-page quality. If operators interpret that as a simple matcher bug without evidence, the team could waste time on provenance rewrites instead of collecting disciplined comparable windows and documenting the real current behavior: domain-level grounded attribution.

### Benchmark premature-optimization risk
After two clean windows, the riskiest move would be reacting to the `0%` exact-page metric with heavier provenance engineering before the lane shows page-level citation behavior at all. That would add maintenance cost without clear evidence that the current bottleneck is in matching rather than in model output shape.

## Recommended Next Order

1. Close `P4-003`
2. Close `P4-006`
3. Make the final `P4-004` call
4. Observe the updated audit journey in real usage and polish only if new edge cases appear
5. Keep the measurement-platform work in planning / internal-foundation mode (`BM-001` ... `BM-008`) without disrupting launch truth
6. Revisit extreme-scale crawl benchmarking only if real usage pushes past the shipped queue path
7. Only then consider API layer or deeper retrieval backlog
