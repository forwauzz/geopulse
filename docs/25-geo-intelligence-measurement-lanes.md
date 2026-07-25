# GEO Intelligence Measurement Lanes

Status: implementation contract for `INT-003` / GitHub issue `#214`.

A lane is the immutable experimental protocol for a measurement. A window is
one occurrence of that lane and records expected versus observed coverage.
Comparisons use `evaluateMeasurementLaneCompatibility`; matching a date, domain,
or query set alone is never sufficient.

## Fingerprint inputs

`measurement-lane-v1` freezes frame, vertical/subvertical, cohort definition,
query-set ID/version, provider, model/snapshot, run mode, grounding method,
scanner/check catalog, prompt, citation parser, schedule/cadence, and metric
definition. Values are normalized before a SHA-256 fingerprint is produced.

The supported frames are:

- broad vertical (including the current broad law-firm lane);
- business counsel;
- startup pilot;
- domain-specific;
- user-prompt;
- explicit legacy/unknown.

Gemini and GPT always produce distinct lanes. An analysis may opt into
`explicit_cross_model`, but the result is labeled as cross-model rather than
same-lane.

Any `unknown` protocol dimension makes a historical comparison incompatible,
even when both sides contain the same unknown value. `not_applicable` is a
known value and is therefore distinct from missing history.

## Compatibility reason codes

The evaluator returns machine-readable field reasons such as
`query_set_version_mismatch`, `provider_mismatch`, `run_mode_mismatch`,
`citation_parser_version_mismatch`, and `unknown_protocol_value`, plus the exact
differing fields.

## Backfill

Preview is read-only:

```bash
npm run intelligence:lanes:backfill
```

Apply is restartable and requires:

```bash
npm run intelligence:lanes:backfill -- --apply --confirm=INT-003
```

It indexes benchmark run groups and cohort definitions without changing the
benchmark scheduler or its metadata. Windows use the existing schedule window
where present and record expected query rows versus observed query runs.

The 2026-07-25 preview found 1,938 run groups across 53 distinct protocol
fingerprints: 899 complete, 810 failed, and 229 still running. All 53 contain at
least one historical version gap, so zero old runs are automatically approved
for same-lane comparison. This conservative result is intentional: future
producers can write fully versioned protocols, while old records remain usable
for explicitly labeled exploratory analysis.
