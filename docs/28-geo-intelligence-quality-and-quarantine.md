# Geo Intelligence Quality, Eligibility, and Quarantine

Issue: INT-006 / GitHub #217
Policy: `quality-policy-v1`

## Decision

Quality is a derived, replayable layer. The system never rewrites a scan, benchmark run, model response, citation, or historical status to make the data appear healthy. Every classification stores the original status, source snapshot, reason codes, age, and evidence pointers.

The policy states are `valid`, `valid_partial`, `incomplete`, `provider_failure`, `orphaned`, `parser_suspect`, `configuration_mismatch`, `duplicate`, and `quarantined`.

Key distinctions:

- A completed response with zero citations is `valid` with reason `completed_zero_citations`.
- A provider error is `provider_failure`; it is not scored as a zero-citation result.
- Running work older than six hours is `incomplete` with reason `stale_running`.
- Missing protocol dimensions, parent runs, responses, or valid citation shapes are explicit failure reasons.
- Duplicate execution records remain preserved; later occurrences are classified `duplicate`.

## Window eligibility

Benchmark measurement windows combine run groups by scheduled window, canonical source domain, query set, and model. They are eligible only when every query/model cell contains both `grounded_site` and `ungrounded_inference` modes and each cell has a valid or valid-partial quality state. Missing pairs are recorded in `missing_cells`.

Windows with at least three valid runs and an all-zero citation rate, or a citation-rate discontinuity of at least 0.75 versus the preceding comparable window, require validation or quarantine. They cannot silently enter eligible analytical marts.

Legacy runs without a first-class run mode are classified `configuration_mismatch` and their windows remain ineligible. This is conservative by design.

## Append-only quarantine

`intelligence_quarantine_events` records `quarantine`, `release`, and `validate` actions with actor and evidence. The current quarantine state must be derived from the latest event; releasing evidence does not erase the quarantine history.

Apply mode reads the latest event per source before classification. A latest `quarantine` event forces the derived state to `quarantined`; a later `release` or `validate` event returns the source to normal policy evaluation.

## Preview and apply

Preview is read-only:

```text
npm run intelligence:quality:classify
```

Apply only after migrations 059–063 and the preceding backfills:

```text
npm run intelligence:quality:classify -- --apply --confirm=INT-006
```

Apply writes derived classification rows, window assessments, and alerts. It does not modify source statuses.

The production preview on 2026-07-25 classified 11,531 source runs: 5,373 valid outcomes, 5,923 provider failures, six configuration mismatches, and 229 incomplete stale groups. All 229 stale groups were created April-to-present. Across 862 comparable measurement windows, 268 passed the paired-mode eligibility gate, 586 were incomplete, and seven required anomaly review.

## Operator runbook

1. Run preview and inspect stale, provider-failure, parser-suspect, configuration-mismatch, and anomalous-window counts.
2. For stale rows, follow each `evidenceRefs` pointer to the source group/run and correlate with Cloudflare scheduled-handler and queue logs.
3. Treat issue #104 as the cron-tail starvation repair. This policy only detects and gates its effects; it must not mark a source job complete.
4. For provider failures, confirm provider/model/error evidence. Reruns create new run evidence rather than replacing the failed response.
5. For all-zero or discontinuous cohorts, validate source responses and citation parsing. Record a `validate` event when genuine or a `quarantine` event when unsafe.
6. Release quarantine only with an operator reason and evidence reference.
7. Re-run the same policy after source recovery. A changed source snapshot produces a new classification while retaining history.

## Alerts

The classifier emits warning alerts for stale running work and critical alerts for whole-cohort anomalies. Alerts are service-role/operator only. Notification delivery is intentionally adapter-ready; the control-room issue will expose and acknowledge them.
