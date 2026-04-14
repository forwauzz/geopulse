# Law Firms P1 Fit Analysis v1

Last updated: 2026-03-29

## Purpose

Freeze the first manual fit analysis for the current `law_firms` priority-1 recurring lane before any query-set or cohort redesign happens.

This is an analysis artifact only.
It does not change the live lane yet.

## Current lane under review

- schedule version: `law-firms-p1-v1`
- query set: `law-firms-p1-core v1`
- model: `gemini-2.5-flash-lite`
- run modes:
  - `ungrounded_inference`
  - `grounded_site`
- domains: 21

## Main finding

The current lane is not one coherent law-firm cohort.

It is a mixed set of law-firm archetypes:
- enterprise / biglaw / business counsel firms
- one immigration specialist
- one family-law / divorce specialist
- one personal-injury / consumer-litigation brand
- one labor / employment specialist

At the same time, the frozen query set mixes legal-service intents:
- personal injury
- family law
- immigration
- corporate law
- estate planning
- workers comp
- criminal defense
- employment law

That means many current domain/query pairs are low-fit by design.

## Likely sub-cohort read for the current 21 domains

### Business counsel / biglaw / enterprise

- `lw.com`
- `kirkland.com`
- `sidley.com`
- `winston.com`
- `perkinscoie.com`
- `goodwinlaw.com`
- `millerchevalier.com`
- `gibsondunn.com`
- `quinnemanuel.com`
- `crowell.com`
- `duanemorris.com`
- `cozen.com`
- `fr.com`
- `gtlaw.com`
- `btlaw.com`
- `stinson.com`
- `huschblackwell.com`

### Employment / labor leaning

- `seyfarth.com`

### Immigration specialist

- `fragomen.com`

### Family law / divorce

- `cordellcordell.com`

### Personal injury / consumer litigation

- `forthepeople.com`

## Fit read against the current 8 queries

### High-fit queries for the business-counsel cluster

- `business-law-firm-comparison`
- sometimes `employment-law-firm`
- sometimes `criminal-defense-selection` when the firm has white-collar / investigations strength

### Mostly low-fit queries for the business-counsel cluster

- `best-law-firm-for-injury`
- `find-divorce-lawyer`
- `immigration-law-help`
- `estate-planning-lawyers`
- `workers-comp-lawyers`

### High-fit query for `fragomen.com`

- `immigration-law-help`

### High-fit query for `cordellcordell.com`

- `find-divorce-lawyer`

### High-fit queries for `forthepeople.com`

- `best-law-firm-for-injury`
- sometimes `workers-comp-lawyers`

### High-fit query for `seyfarth.com`

- `employment-law-firm`

## Interpretation

The current broad `law_firms` lane is useful as:
- a broad internal directional lane
- a domain-level grounded attribution lane

The current broad `law_firms` lane is not yet a precision benchmark frame.

The current noise floor likely comes from all of these at once:
- mixed cohort archetypes
- mixed legal-intent queries
- shallow grounded evidence snapshots for large firm sites
- a grounded prompt that asks for natural answers and domain mention, not URL-level citation output

## What this does and does not imply

This analysis does imply:
- cohort redesign and query redesign should be treated as coupled work
- the current live lane should not be interpreted as one clean law-firm methodology frame
- future narrow-lane work should start from one sub-cohort, not "all law firms"

This analysis does not imply:
- the provenance matcher is broken
- the current lane should be widened
- the model should be changed now
- the current lane should be rewritten immediately

## Operator rule after this analysis

Before building a narrower replacement lane:
1. keep the current broad lane collecting unchanged for comparability
2. use this taxonomy as the starting point for any redesign discussion
3. do not write a new law-firms query set until the redesign explicitly chooses one target sub-cohort first

## First replacement target

The first narrow replacement lane should target:
- `business_counsel / biglaw / enterprise`

Why this first:
- it is the largest coherent subgroup inside the current 21-domain lane
- it is large enough to validate a narrower methodology without new seed expansion
- it removes the biggest current fit problem: mixing consumer legal services and specialist firms into the same frame
- it is the cleanest next comparison against the current broad lane

### Proposed first target domains

- `lw.com`
- `kirkland.com`
- `sidley.com`
- `winston.com`
- `perkinscoie.com`
- `goodwinlaw.com`
- `millerchevalier.com`
- `gibsondunn.com`
- `quinnemanuel.com`
- `crowell.com`
- `duanemorris.com`
- `cozen.com`
- `fr.com`
- `gtlaw.com`
- `btlaw.com`
- `stinson.com`
- `huschblackwell.com`

## Frozen target-domain list v1

The first narrow replacement lane now has an explicit frozen target-domain list:

- `lw.com`
- `kirkland.com`
- `sidley.com`
- `winston.com`
- `perkinscoie.com`
- `goodwinlaw.com`
- `millerchevalier.com`
- `gibsondunn.com`
- `quinnemanuel.com`
- `crowell.com`
- `duanemorris.com`
- `cozen.com`
- `fr.com`
- `gtlaw.com`
- `btlaw.com`
- `stinson.com`
- `huschblackwell.com`

Frozen cohort identity:
- label: `law_firms_business_counsel_v1`
- size: `17`
- source: current `law_firms` priority-1 live lane

Selection rule:
- include firms that plausibly fit enterprise/business-law buying intent across the draft query set
- exclude specialist domains whose current fit depends on consumer or specialist legal-service prompts

Explicit exclusions from the current 21-domain lane:
- `forthepeople.com`
- `cordellcordell.com`
- `fragomen.com`
- `seyfarth.com`

Reason for exclusions:
- they may be strong firms, but they are not a clean fit for the first `business_counsel / biglaw / enterprise` replacement lane
- they should be candidates for later specialist sub-cohorts instead of being forced into this first narrow frame

### Rule for the next slice

The next query-set rewrite should serve this target group only.

That means:
- no PI
- no divorce / family-law
- no immigration-specialist prompts
- no workers-comp prompts
- no estate-planning prompts unless the target cohort is intentionally widened later

## First narrow query-set draft

The first narrow replacement query-set draft is now frozen in:

`eval/fixtures/benchmark-law-firms-business-counsel-v1-query-set.json`

Draft identity:
- name: `law-firms-business-counsel-core`
- version: `v1`
- status: `draft`
- query count: `6`

Draft design goals:
- business-buyer intent only
- enterprise/legal-department framing
- no consumer legal-service prompts
- no specialist prompts that only fit one small sub-cohort

This fixture is intentionally not seeded or scheduled yet.
It exists to freeze the next candidate frame before implementation starts.

## Next implementation rule

Before this narrow lane becomes live:
1. keep the broad `law_firms-p1-v1` lane collecting unchanged
2. seed the draft query set only after confirming the frozen 17-domain cohort is the intended first experiment
3. launch the narrow lane as a separate comparable frame, not as a rewrite of the broad lane

## First seed command

When the team is ready to create the query-set record without scheduling it yet:

```bash
npm run benchmark:seed:query-set:business-counsel
```

This should only create the draft query-set record.
It should not change the current live schedule env or the current broad lane.

Seed result:
- `query_set_id: 9910b5ac-ade6-42be-9dca-9b85c04e4469`
- `query_count: 6`

## First preview config rule

When previewing the first narrow lane:
- keep `BENCHMARK_SCHEDULE_VERTICAL=law_firms`
- keep `BENCHMARK_SCHEDULE_SEED_PRIORITIES=1`
- set `BENCHMARK_SCHEDULE_DOMAINS` to the frozen 17-domain cohort
- set `BENCHMARK_SCHEDULE_QUERY_SET_ID=9910b5ac-ade6-42be-9dca-9b85c04e4469`

This keeps the narrow preview explicit and prevents accidental fallback to the broader 21-domain lane.

## First narrow-lane result

The first live narrow window for:
- `schedule_version: law-firms-business-counsel-v1`
- `query_set_id: 9910b5ac-ade6-42be-9dca-9b85c04e4469`
- `domain_count: 17`
- `window_date: 2026-03-30T00`

completed cleanly with:
- `34` launched runs
- `0` failures
- `17/17` paired domains

Observed outcome:
- grounded-vs-ungrounded deltas remain meaningful
- the narrower frame is visibly cleaner than the broad mixed lane
- several business-law domains show stronger grounded citation-rate lifts under the narrower query set
- `exact-page quality` still remained `0%` across the lane

Current interpretation:
- this validates the methodology decision to narrow the frame
- the `business_counsel / biglaw / enterprise` lane is now the cleaner internal signal lane
- page-level provenance is still not the next immediate bottleneck for this lane

Operator rule after the first narrow window:
1. keep collecting more comparable windows on this narrow lane
2. keep exact-page visible but non-gating
3. do not change model, prompt, or evidence depth yet
4. do not widen to another narrow law-firm sub-cohort until this first narrow lane has more repeated windows

## Three-window decision freeze

After three comparable narrow windows:
- `2026-03-30T00`
- `2026-03-30T12`
- `2026-03-31T00`

the `business_counsel / biglaw / enterprise` lane is now the primary internal law-firms benchmark lens.

Why:
- the lane is operationally stable across repeated windows
- the narrower frame consistently produces cleaner grounded-vs-ungrounded signal than the broad mixed lane
- recurring winners and laggards are now visible across repeated windows
- `exact-page quality` still remains `0%`, so the main gain came from methodology fit rather than provenance-depth changes

Primary recurring winners now include:
- `lw.com`
- `perkinscoie.com`
- `fr.com`
- `kirkland.com`
- `sidley.com`

Recurring weaker grounded performers include:
- `gibsondunn.com`
- `btlaw.com`
- `cozen.com`
- `duanemorris.com`
- `goodwinlaw.com`

Operator rule after this freeze:
1. treat `law-firms-business-counsel-v1` as the main internal law-firms benchmark frame
2. keep the original broad `law-firms-p1-v1` lane only as a legacy comparison frame
3. keep the narrow lane unchanged for continued comparable collection
4. do not open a second narrow law-firms sub-cohort yet
5. do not change prompt/model/evidence-depth yet
