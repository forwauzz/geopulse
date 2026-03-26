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

### Retrieval eval detail UX
Still open:
- latest-vs-previous comparison at the prompt level

### API-002 to API-007
Still deferred until launch closure.

### Measurement platform initiative
Planned, not implemented:
- internal benchmark domain/query/citation graph
- multi-model query measurement pipeline
- competitor and cohort benchmark layers
- 1000-site benchmark operations

Current guidance:
- keep the current audit/report product intact
- add the benchmark layer as a staged internal platform
- do not market benchmark capabilities as shipped before the underlying pipeline exists

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
The repo now uses state-driven report status on the results page, but this should still be manually tested against real checkout return, webhook timing, and delivered-report states before broader onboarding.

### Eval identity drift risk
The new admin eval history depends on stable site identity.
If operators vary `--site-url`, `--domain`, prompt-set names, or rubric versions across runs for the same target, trend charts will become misleading or fragmented.

### Benchmark-methodology risk
The v3 direction depends on credible methodology, not just more infrastructure. If the team scales query-running before freezing query taxonomy, citation parsing, and cohort rules, GEO-Pulse could create noisy benchmark claims that are hard to defend later.

## Recommended Next Order

1. Close `P4-003`
2. Close `P4-006`
3. Make the final `P4-004` call
4. Observe the updated audit journey in real usage and polish only if new edge cases appear
5. Keep the measurement-platform work in planning / internal-foundation mode (`BM-001` ... `BM-008`) without disrupting launch truth
6. Revisit extreme-scale crawl benchmarking only if real usage pushes past the shipped queue path
7. Only then consider API layer or deeper retrieval backlog
