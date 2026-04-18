# Benchmark Tech Startups Collection Pilot v1

Last updated: 2026-04-17

## Purpose

This document freezes the first recurring-pilot operating plan for the `tech_startups` benchmark lane.

It exists to turn the successful `v2` startup proof frame into a very small recurring collection pilot without widening the mature `law_firms` lane or adding a second scheduler implementation path.

## Current truth before pilot

The startup lane now has:
- a frozen `tech_startups` `b2b_software` methodology note
- a seeded 18-domain startup cohort kept out of recurring collection by default
- a tightened `v2` startup query set
- cleaner grounding evidence extraction that strips script/style noise
- four representative startup proof pairs on `linear.app`, `supabase.com`, `vercel.com`, and `replicate.com`

Observed proof-window truth:
- all four `v2` startup domains completed grounded and ungrounded runs cleanly
- measured-domain citation rate stayed at `1.0` across the four-domain `v2` proof set
- citations still remained domain-level rather than page-URL citations

First scheduled pilot-window truth for `2026-04-17T00`:
- the existing scheduler path selected exactly the four intended startup domains when the startup pilot allowlist was set explicitly
- all `8` launched runs completed cleanly with `0` failures and `0` skips
- all four domains showed `100%` ungrounded citation rate and `100%` grounded citation rate
- exact-page quality remained `0%` across the whole startup pilot window

Three-window pilot truth after `2026-04-17T00`, `2026-04-17T12`, and `2026-04-18T00`:
- all three startup pilot windows launched and completed cleanly through the existing scheduler path
- `linear.app`, `supabase.com`, and `vercel.com` stayed at `100%` ungrounded and `100%` grounded citation rate across all three windows
- `replicate.com` dropped once to `83%` grounded citation rate on `2026-04-17T12`, then returned to `100%` on `2026-04-18T00`
- recurrence review produced no recurring winners or recurring laggards across the three comparable windows

Outlier inspection truth after `BM-055`:
- the `replicate.com` dip was isolated to one grounded query, `product-differentiators`, on run `bb5a1e80-a5d5-4f33-a9ed-bfe275811325`
- the affected answer still returned normal grounded company-specific text, but it omitted the measured-domain citation entirely for that one query
- the adjacent grounded pilot runs `32f9c258-ec67-448d-9aac-e5aae3f65c31` and `2b4457b9-48a3-4695-a229-615c5acaabbd` cited `replicate.com` on all six queries
- all three inspected `replicate.com` grounded runs remained domain-only citation runs with `0` page-URL citations and `0` provenance matches
- current interpretation: this looks like one-off model citation omission inside the existing domain-level startup lane, not a scheduler failure, grounding extraction failure, or provenance matcher regression

Interpretation:
- the startup pilot is operationally stable
- the startup pilot is not yet showing a stable grounded advantage over ungrounded results
- widening the startup cohort now would be premature

Interpretation:
- the startup frame now looks stable enough for a tiny recurring pilot
- the startup frame is still not ready for broader provenance claims
- the startup frame should stay intentionally smaller than the mature `law_firms` lane

## Pilot lane

Start with one startup pilot lane only:
- vertical: `tech_startups`
- subcohort: `b2b_software`
- selected domains:
  - `linear.app`
  - `supabase.com`
  - `vercel.com`
  - `replicate.com`
- query set: startup `v2` only
- run modes:
  - `ungrounded_inference`
  - `grounded_site`
- cadence: twice daily only if the tiny pilot remains clean
- window: every 12 hours
- model lane: one fixed model only

This keeps the startup pilot bounded at:
- `4` domains
- `2` run modes
- `8` total runs per window

## Why this pilot is small

Do not immediately schedule the full 18-domain startup cohort.

The current goal is to prove:
- the startup `v2` frame remains stable across recurring windows
- schedule selection and review stay low-maintenance
- grounded startup runs remain operationally clean on the existing worker cron path

The current goal is not:
- startup scale
- startup leaderboard claims
- provenance-quality claims
- a multi-model startup benchmark program

## Pilot entry rules

Only the four proofed startup domains should carry:
- `vertical=tech_startups`
- `metadata.seed_priority=1`
- `metadata.schedule_enabled=true`
- `metadata.seed_cohort_name=tech-startups-b2b-software-v2-pilot`

All other startup domains should remain outside recurring collection until the pilot proves stable.

## Pilot fixture

Use the dedicated pilot fixture:

```text
eval/fixtures/benchmark-tech-startups-b2b-software-v2-pilot-domains.json
```

Seed it with the existing generic cohort-seed command:

```bash
npm run benchmark:seed:domain-cohort -- --fixture eval/fixtures/benchmark-tech-startups-b2b-software-v2-pilot-domains.json
```

This intentionally reuses the current `benchmark_domains` upsert path instead of introducing a startup-specific scheduling table.

## Recommended env for the startup pilot

```env
BENCHMARK_SCHEDULE_ENABLED=true
BENCHMARK_SCHEDULE_QUERY_SET_ID=<startup-v2-query-set-id>
BENCHMARK_SCHEDULE_MODEL_ID=<one-fixed-model-id>
BENCHMARK_SCHEDULE_RUN_MODES=ungrounded_inference,grounded_site
BENCHMARK_SCHEDULE_VERTICAL=tech_startups
BENCHMARK_SCHEDULE_SEED_PRIORITIES=1
BENCHMARK_SCHEDULE_DOMAIN_LIMIT=4
BENCHMARK_SCHEDULE_MAX_RUNS=8
BENCHMARK_SCHEDULE_MAX_FAILURES=3
BENCHMARK_SCHEDULE_WINDOW_HOURS=12
BENCHMARK_SCHEDULE_VERSION=tech-startups-b2b-software-v2-pilot
```

Do not combine the startup pilot env with the mature `law_firms` lane in one recurring frame.

Use the explicit startup allowlist during the pilot:

```env
BENCHMARK_SCHEDULE_DOMAINS=linear.app,supabase.com,vercel.com,replicate.com
```

This keeps the startup pilot insulated from any leftover schedule filters already present in `.env.local`.

## Preview and run order

1. Seed the pilot fixture.
2. Fill the schedule env with the startup `v2` frame only.
3. Preview the selected startup pilot domains:

```bash
npm run benchmark:schedule:preview
```

4. Run one explicit pilot window through the same schedule path:

```bash
npm run benchmark:schedule:run-now -- --window-date 2026-04-16T12
```

5. Review the startup pilot window:

```bash
npm run benchmark:schedule:summary -- --window-date 2026-04-16T12
```

6. If needed, inspect outliers:

```bash
npm run benchmark:schedule:outliers -- --window-date 2026-04-16T12
```

## Pilot interpretation rules

For this startup pilot:
- treat measured-domain citation presence as the main signal
- treat exact-page quality as non-gating until page-URL behavior materially changes
- treat recurring cleanliness and low failure rate as mandatory before widening

Do not widen the startup lane if:
- repeated windows start failing operationally
- startup prompts drift back into category-wide claims
- the pilot starts requiring manual repair after most windows

## Exit criteria before widening beyond four domains

Only widen after:
- at least three comparable startup pilot windows exist
- all selected domains complete cleanly across those windows
- startup review remains low-touch through the existing summary/outlier flow
- the team still agrees the startup lane is useful even with domain-level attribution
- one-off grounded regressions, like the `replicate.com` `83%` dip, have been inspected before widening

Current status against those exit criteria:
- the three-window requirement is met
- the one-off `replicate.com` regression review is now complete
- the widening decision is now frozen as hold at the current four-domain pilot, not widen

## Current decision after `BM-056`

Decision:
- keep the startup recurring lane at the current four-domain pilot

Why:
- the pilot is operationally clean
- the inspected `replicate.com` dip does not look like a scheduler, grounding, or provenance-system regression
- the lane still behaves as a domain-level citation lane, not a page-level evidence lane
- the recurrence view is neutral rather than clearly showing grounded advantage over the same startup frame

What this does not block:
- continued low-touch recurring collection on the current four-domain startup pilot
- future reopening of startup widening if new evidence shows stronger, repeatable value

What this does block for now:
- seeding the next startup cohort
- widening beyond the four-domain allowlist
- treating the startup lane as a clearly validated grounded-wins frame

## Non-goals

This pilot does not approve:
- enabling recurring collection for the full 18-domain startup cohort
- mixing startup and law-firm lanes in one schedule frame
- changing the scheduler contract
- adding startup-specific benchmark UI
- claiming page-level startup provenance quality
