# GEO Intelligence Canonical Run Index

Status: implementation contract for `INT-004` / GitHub issue `#215`.

`intelligence_runs` is an additive execution envelope. Operational tables stay
authoritative; the index keeps `(source_kind, source_table, source_id)` and a
snapshot hash so every row can be traced and reconciled.

The envelope carries canonical domain/page, lane/window, parent, verbatim source
status and timestamps, provider/model/mode, version fields, artifact reference,
quality state, and tenant visibility. A unique source key makes ingestion
idempotent.

## Adapters and hierarchy

The v1 backfill includes:

- free, agency, startup, recurring, and competitor scans;
- scan → deep-audit run → page scan;
- benchmark run group → query run → citation parse;
- report delivery and report/retrieval evals;
- implementation plans, tasks, and explicit verification tasks when present.

Unknown scan sources become `scan_unknown`; unsupported and ambiguous rows are
reported rather than dropped.

## Backfill and reconciliation

Preview is read-only:

```bash
npm run intelligence:runs:backfill
```

Apply requires `--apply --confirm=INT-004`. It writes in restartable batches,
resolves parent IDs in a second idempotent pass, then rereads the operational
sources and verifies the aggregate source-envelope hash did not change.
`intelligence_backfill_checkpoints` stores counts, last source key, duplicates,
orphans, status, and the reconciliation hash.

The 2026-07-25 preview produced 20,760 source envelopes across 13 populated
source kinds with zero duplicate keys, zero orphaned parents, and zero
unsupported rows.
