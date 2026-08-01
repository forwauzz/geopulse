# Epic: Report contents settings

## Revenue outcome

An agency owner decides once what a client-facing AI visibility report contains, and every report
their clients receive follows that decision. Where a single client needs something different, they
change it for that client alone without detaching from the default. The report that results is one
document per client per period rather than one per answer engine, and it explains a low visibility
result rather than only stating it.

Named user: Jack Roberts (Lifter, `agency_accounts.name = 'Lifter'`), whose stated need is a report
he can send when a client asks "what are you doing for GEO?".

## Guardrails

- Reuse the existing scoped-metadata pattern in `lib/server/report-branding-settings.ts`. Report
  settings live at `metadata.report`, a sibling of `metadata.brand`, resolved over the same
  `BrandScope` union (`startup_workspaces | agency_accounts | agency_clients`).
- Store only explicit choices. A level records what it changes and nothing else, so improving the
  shipped default still reaches every scope that has not overridden that field.
- The scope statement and the methodology block are not configurable. They are what let a reader
  see the boundary of what was measured.
- A section that is enabled but has no data for the period renders as an explicit empty state, not
  as a missing section.
- No answer engine is ever rendered at 0% when it was not measured. Unmeasured engines are omitted.
- **No report is generated, emailed, or scheduled as part of this epic.** All three Lifter configs
  carry `report_email = 'jack@lifter.ca'`. Settings work must not call the generator, the sender,
  or the cron path.

## Issues

### RCS-1 — Settings contract

Define the report settings shape, the shipped default, and pure resolution over three levels.

Acceptance:

- A `ReportSettings` type covers layout, engine inclusion, and section inclusion.
- A `PartialReportSettings` type expresses a sparse override.
- `resolveReportSettings(system, agency, client)` merges per field, with the narrowest scope
  winning only for fields it sets.
- Locked sections cannot be disabled by any level; a stored `false` for a locked section is ignored.
- Resolution is a pure function with no I/O, unit tested against the three-level cases.

### RCS-2 — Persistence

Read and write `metadata.report` for a given scope.

Acceptance:

- Reading a scope with no stored settings returns an empty override, not a defaulted object.
- Writing stores only keys the caller set; unset keys are removed rather than written as null.
- Writing is scoped by the same `BrandScope` guard used for brand fields.
- A malformed stored value degrades to an empty override instead of throwing.

### RCS-3 — Settings surface

An agency-level screen where the choices are made, with a live preview.

Acceptance:

- The checklist groups sections as site health, answer visibility, competitive, framing, and locked.
- Each row states the underlying data source.
- The preview reflects unsaved edits, distinguishes off from empty, and never triggers generation.
- The preview panel collapses to a rail and restores.
- Unsaved changes are indicated, with discard and save.

### RCS-4 — Per-client override

The same surface scoped to one client, showing inheritance.

Acceptance:

- Every row shows whether it follows the agency default or is set for this client.
- The count of overridden fields is visible.
- A client can be reset to the agency default in one action.
- Resetting removes the stored keys rather than writing the agency values.

### RCS-5 — Combined report assembly

One report per client per period instead of one per engine.

Acceptance:

- The payload carries a combined figure and a per-engine breakdown.
- Only engines with a measurement for the period appear.
- Site audit category scores are included in the payload.
- `layout = 'per_engine'` reproduces today's behaviour.

## Definition of done

For Jack's Lifter account: open report settings, uncheck a section, see the preview change without
saving, save, open a client, see every row marked as following the Lifter default, override one,
see the count update, reset it. No report is generated and no email is sent at any point.

RCS-5 is sequenced last and is not required for the settings surface to be usable.
