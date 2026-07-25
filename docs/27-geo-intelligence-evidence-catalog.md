# Geo Intelligence Evidence Catalog

Issue: INT-005 / GitHub #216
Contract: `evidence-catalog-v1`

## Decision

Postgres stores evidence identity, provenance, access metadata, hashes, and lineage. Existing operational tables and R2 objects remain authoritative. The catalog does not move, rewrite, or delete source data.

An evidence object is one of:

- `original`: raw model or source output
- `extracted`: page text or scan signals extracted from a source
- `parsed`: citations and other structured facts parsed from original evidence
- `computed`: metrics and evaluation results
- `generated`: reports, recommendations, implementation, and verification artifacts

Missing artifacts are indexed explicitly as `storage_kind=missing` and `artifact_status=missing`; absence is never treated as a successful empty result.

## Identity and deduplication

`stable_evidence_id` is derived from source kind, source ID, and evidence kind. It is independent of `content_hash`. Multiple source records may therefore share one content hash without collapsing their timestamps, tenants, runs, or lineage.

The source record or R2 object remains recoverable through `source_table`, `source_id`, `artifact_ref`, and the linked canonical run. Large payloads are not copied into the catalog. `inline_excerpt` is diagnostic only.

## Lineage and retrieval

`intelligence_evidence_edges` is a many-to-many graph. Relations such as `parsed_from`, `supports`, `generated_from`, and `verifies` allow a citation or recommendation to resolve back to original evidence.

R2 references are initially `unverified`. Verification can be added later without changing the underlying object key. The backfill never issues R2 write, move, or delete operations.

## Access and retention

Evidence privacy is one of `private_tenant`, `internal`, `shared`, or `public`. Private evidence must carry both tenant type and tenant ID. The application access helper requires an exact tenant match; platform-admin access is explicit. Both catalog tables have RLS enabled with no broad client policy, keeping ingestion and cross-tenant operations service-role only.

Retention is metadata, not an automated deletion instruction. Any future retention worker must separately honor product, legal, and tenant requirements.

## Backfill

Preview:

```text
npm run intelligence:evidence:backfill
```

Apply, only after migrations 059–062 are deployed:

```text
npm run intelligence:evidence:backfill -- --apply --confirm=INT-005
```

The backfill is idempotent on `(source_kind, source_id, evidence_kind)`. It indexes query responses, parsed citations, scan-page signals, report PDF/Markdown pointers, report and retrieval eval outputs, recommendation evidence, and implementation/verification evidence.

Production preview on 2026-07-25 found 18,335 evidence candidates, no duplicate source keys, and no invalid access/storage shapes. It identified 6,073 explicit missing artifacts and 130 existing but unverified report artifacts. The missing count includes failed model runs with no raw response and is an input to quality gating, not a backfill error.

## Deployment gate

The migration is additive, but the apply step depends on the canonical identity, lane, and run-index migrations. Do not apply 062 independently. Until the migration chain is deployed, operational tables remain unchanged and authoritative.
