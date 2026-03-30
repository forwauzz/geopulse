# Benchmark Collection Operations v1

Last updated: 2026-03-29

## Purpose

This document freezes the first slow-roll operating plan for recurring grounded vs ungrounded benchmark collection.

It is intentionally narrow.
The goal is to start collecting stable internal data without creating a high-maintenance benchmark program.

## First operating lane

Start with one lane only:
- vertical: `law_firms`
- seed priorities: `1`
- run modes:
  - `ungrounded_inference`
  - `grounded_site`
- cadence: twice daily
- window: every 12 hours
- model lane: one fixed model only
- query set: one fixed query set version only

Current seed truth from `benchmark_seed.csv`:
- `law_firms` total rows: 147
- `law_firms` priority-1 rows: 21

This is the best first slice because it is large enough to compare but still small enough to inspect manually.

## Why not start broader

Do not start with:
- multiple verticals at once
- multiple query sets at once
- multiple primary model lanes at once
- the full 445-domain seed list
- notification emails for every run

That would create noisy data and higher operator burden before the benchmark frame is trustworthy.

## Entry rules

Only schedule domains that are explicitly opted in for benchmark collection.

For the seed CSV path, that means imported benchmark domains must carry:
- `vertical`
- `metadata.seed_priority`
- `metadata.schedule_enabled=true`

This keeps recurring benchmark collection separate from the broader benchmark-domain table and avoids treating every benchmark domain as a scheduled target.

## Scheduler rules

For v1 recurring collection:
- keep one query set id frozen
- keep one model id frozen
- keep one vertical frozen
- keep one seed-priority slice frozen
- run on a 12-hour schedule window
- use `BENCHMARK_SCHEDULE_MAX_RUNS` and `BENCHMARK_SCHEDULE_MAX_FAILURES` conservatively

Recommended starting values:
- `BENCHMARK_SCHEDULE_VERTICAL=law_firms`
- `BENCHMARK_SCHEDULE_SEED_PRIORITIES=1`
- `BENCHMARK_SCHEDULE_DOMAIN_LIMIT=21`
- `BENCHMARK_SCHEDULE_MAX_RUNS=42`
- `BENCHMARK_SCHEDULE_MAX_FAILURES=5`
- `BENCHMARK_SCHEDULE_WINDOW_HOURS=12`

`42` max runs is intentional:
- 21 domains
- 2 run modes
- one complete sweep if every selected domain launches in both modes

## First setup steps

1. Seed the frozen `law_firms` query set fixture.
2. Import the first law-firm seed slice into `benchmark_domains`.
3. Preview the recurring schedule selection.
4. Run one immediate scheduled sweep through the same scheduler path.
5. Leave the recurring benchmark schedule enabled for the next cron windows.
6. Watch the benchmark admin pages and structured logs for one week before widening scope.

## Query-set seed command

Seed the first frozen query set:

```bash
npm run benchmark:seed:query-set
```

Default fixture:

```text
eval/fixtures/benchmark-law-firms-p1-query-set.json
```

Seeded query-set identity:
- name: `law-firms-p1-core`
- version: `v1`
- vertical: `law_firms`
- query count: `8`

After seeding, copy the returned `query_set_id` into `BENCHMARK_SCHEDULE_QUERY_SET_ID`.

## Import command

Dry run:

```bash
npm run benchmark:seed:domains -- --industry law_firms --priorities 1 --dry-run
```

Import:

```bash
npm run benchmark:seed:domains -- --industry law_firms --priorities 1
```

## Schedule preview command

After the schedule env is filled, preview the exact recurring lane before waiting for cron:

```bash
npm run benchmark:schedule:preview
```

The preview prints:
- query set name and id
- model id
- run modes
- schedule window
- selected domain count
- the exact selected domains

## Immediate run command

After the preview looks correct, run one scheduled sweep immediately:

```bash
npm run benchmark:schedule:run-now
```

This uses the same `BENCHMARK_SCHEDULE_*` config and scheduler path as cron.

## Window summary command

After the immediate run or a cron window finishes, print the paired domain summary for the current scheduled frame:

```bash
npm run benchmark:schedule:summary
```

Or review one specific completed window explicitly:

```bash
npm run benchmark:schedule:summary -- --window-date 2026-03-29T12
```

The summary prints, per domain:
- ungrounded citation rate
- grounded citation rate
- grounded exact-page quality rate
- ungrounded run-group id
- grounded run-group id

## Outlier review command

Before manual lineage inspection, rank the strongest grounded winners and losers for the current window:

```bash
npm run benchmark:schedule:outliers
```

Or target a specific completed window:

```bash
npm run benchmark:schedule:outliers -- --window-date 2026-03-29T12
```

Use that list to choose the first inspection set in the existing run-detail lineage view.

## Run diagnostic command

For a small selected outlier set, summarize whether the grounded run is mostly page-URL citations, domain-only citations, unresolved matches, or weak overlap:

```bash
npm run benchmark:run:diagnostic -- --run-group-ids run-1,run-2,run-3
```

Use this before opening manual lineage pages.

## Recommended env for the first lane

```env
BENCHMARK_SCHEDULE_ENABLED=true
BENCHMARK_SCHEDULE_QUERY_SET_ID=<law-firms-query-set-id>
BENCHMARK_SCHEDULE_MODEL_ID=<one-fixed-model-id>
BENCHMARK_SCHEDULE_RUN_MODES=ungrounded_inference,grounded_site
BENCHMARK_SCHEDULE_VERTICAL=law_firms
BENCHMARK_SCHEDULE_SEED_PRIORITIES=1
BENCHMARK_SCHEDULE_DOMAIN_LIMIT=21
BENCHMARK_SCHEDULE_MAX_RUNS=42
BENCHMARK_SCHEDULE_MAX_FAILURES=5
BENCHMARK_SCHEDULE_WINDOW_HOURS=12
BENCHMARK_SCHEDULE_VERSION=law-firms-p1-v1
```

## Review loop

For the first week:
- review benchmark overview after each schedule window
- inspect lineage on outliers before trusting trends
- do not widen to priority `2` until the first lane looks stable

## First-window interpretation

First live-window truth for `law-firms-p1-v1` on `gemini-2.5-flash-lite`:
- the recurring lane ran cleanly across all 21 paired domains
- grounded vs ungrounded citation-rate deltas are real and usable as internal directional signal
- exact-page quality stayed at `0%` across the window
- outlier diagnostics showed the current grounded runs were mostly returning domain-level citations, not page URLs

Current interpretation rule:
- treat citation-rate deltas as the main internal signal for this lane
- do not treat exact-page quality as a gating metric for this lane yet
- do not assume a provenance matcher bug unless future diagnostics show page URLs that should have matched

What not to do next:
- do not rewrite provenance matching just because exact-page quality is `0%`
- do not widen the cohort yet
- do not change query set or model before at least one more comparable window unless a clear measurement bug is found

What to do next:
- keep collecting comparable windows
- use outlier diagnostics plus lineage review to watch for any shift from domain-level to page-level grounded attribution
- only revisit metric design if the same pattern holds across additional windows

## Two-window decision freeze

After two comparable windows (`2026-03-29T12` and `2026-03-30T00`) for `law-firms-p1-v1` on `gemini-2.5-flash-lite`, the interpretation is now stronger:
- the lane is operationally stable across repeated windows
- grounded vs ungrounded citation-rate deltas remain meaningful
- exact-page quality remained `0%` across both windows
- diagnostics on both winners and losers continued to show mostly domain-level grounded citations rather than page URLs

Decision:
- treat this as a `domain-level grounded attribution` lane for now
- keep `exact_page_quality_rate` visible, but non-gating for this lane
- do not prioritize a provenance matcher rewrite for this lane without new evidence

What this means operationally:
- continue collecting comparable windows unchanged
- continue using outlier review and targeted diagnostics to detect any later shift toward page-level citations
- do not widen to priority `2` yet
- do not change query set or model yet

What would reopen this decision:
- repeated diagnostics showing page URLs that should match grounded evidence but remain unresolved
- a new model lane that begins returning page-level grounded citations
- a later query-set revision that changes citation depth behavior materially

## Next slices after this one

Only after the first lane stabilizes:
1. widen `law_firms` to priority `2`
2. start `real_estate` priority `1`
3. decide whether `dental` should wait for more curated seed selection because its priority-1 slice is too small

## Non-goals

This operating plan does not add:
- customer-facing benchmark reports
- automatic benchmark emails
- broad cohort ranking claims
- 500 to 1000-site operations
