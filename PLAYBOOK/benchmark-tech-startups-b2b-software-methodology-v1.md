# Benchmark Tech Startups B2B Software Methodology v1

Last updated: 2026-04-16

## Purpose

This document freezes the first benchmark methodology for `tech_startups` as a narrow internal cohort.

It exists so GEO-Pulse can expand beyond the current `law_firms` lane without turning "tech startups" into an overly broad or noisy benchmark bucket.

This is a planning and methodology document first.
It is not permission to widen recurring collection immediately.

## Why this exists now

The repo already has:
- one benchmark lane with real recurring collection discipline
- grounded and ungrounded run modes
- run-detail lineage inspection
- narrow cohort framing rules
- a 500 to 1000-site scale decision that remains planned, not implemented

The next benchmark expansion must therefore stay narrow, comparable, and low-maintenance.

## Core truth

`tech_startups` is too broad to benchmark honestly as one mixed internet cohort.

For v1, GEO-Pulse should treat the first startup benchmark frame as:
- `tech_startups`
- subcohort: `b2b_software`
- emphasis:
  - SaaS products
  - developer tools
  - AI software platforms
  - workflow / infrastructure software

This keeps the first startup benchmark frame close to software-buying and software-evaluation prompts rather than generic startup brand chatter.

## What is explicitly in scope

Include domains that are primarily:
- software product companies
- startup or scale-up companies with a product-led or software-led website
- discoverable through category, evaluation, trust, or comparison prompts

Examples of acceptable shapes:
- B2B SaaS
- developer tools
- AI application platforms
- workflow automation software
- data / infrastructure software

## What is explicitly out of scope

Do not include these in the first startup cohort:
- agencies
- consultancies
- VC firms
- incubators / accelerators
- job boards
- newsletters / media brands
- marketplaces
- consumer apps
- services-led companies whose site is not primarily a software product surface

Those can become separate domains later if GEO-Pulse wants them.

## First benchmark frame rules

The first valid startup comparison frame must keep the same:
- query set id and version
- model lane
- run mode
- schedule version
- benchmark window
- metric definitions

If any of those change, the result is exploratory only.

## First cohort size

Start with one narrow proof slice:
- 15 to 25 domains
- one frozen query set
- one primary model lane
- grounded and ungrounded comparison only if the current startup prompts remain interpretable in both modes

Only widen after repeated narrow-window evidence exists.

## Query-set design rules

For `tech_startups_b2b_software_v1`, queries should stay in these demand frames:
- category discovery
- evaluation criteria
- buyer trust / enterprise readiness
- comparison / alternative-seeking

Do not mix in:
- generic "best startup" prompts
- founder-story prompts
- fundraising prompts
- hiring prompts
- startup-advice prompts
- news or trend prompts

Those create citation noise and do not measure the same thing.

## First query-set posture

The first startup query set should prefer:
- software-buying prompts
- trust and readiness prompts
- bounded comparison prompts
- language that can plausibly cite one software company site

It should avoid:
- highly technical prompts that require deep product docs
- ultra-generic "best AI startup" prompts
- prompts that implicitly ask for venture-backed reputation rather than product relevance

## First interpretation rules

For this first startup lane:
- measured-domain citation presence matters more than broad descriptive relevance
- grounded answers that stay relevant but do not explicitly name the measured domain should be treated as a real benchmark failure mode
- exact-page quality remains secondary until repeated startup windows show enough page-level citation behavior to make that metric informative

This mirrors the current collection discipline:
- keep the main signal simple
- inspect outliers before changing methodology
- avoid lane-wide rewrites based on one noisy window

## Relationship to the 1000-site / 10-domain target

GEO-Pulse wants to reach:
- roughly 1000 benchmarked sites
- roughly 10 coherent domains

`tech_startups` should be one of the first expansion domains.

But the correct sequence is still:
1. freeze the startup cohort definition
2. freeze one startup query set
3. prove a narrow startup lane
4. then widen the startup cohort toward recurring collection

The first startup slice should therefore optimize for benchmark truth, not breadth.

## First implementation guidance

Keep the first startup slice lean:
- add one methodology note
- add one frozen query-set fixture
- seed one small startup cohort
- run one narrow proof lane
- inspect lineage before adding broader recurring startup collection

Do not in the same slice:
- widen the scheduler to multiple new domains
- add startup-specific benchmark UI
- add more models
- create a new benchmark service
- claim startup benchmark maturity

## Recommended next execution order

1. Freeze `tech_startups_b2b_software_v1` methodology.
2. Freeze the first startup query-set fixture.
3. Seed a 15 to 25-domain startup target cohort.
4. Run one narrow proof window.
5. Inspect grounded and ungrounded outliers.
6. Decide whether startup recurring collection is trustworthy enough to widen.

## First repo artifacts

The first startup planning slice now uses:
- query-set fixture:
  - `eval/fixtures/benchmark-tech-startups-b2b-software-v1-query-set.json`
- tightened follow-up query-set fixture after the first proof-window refusal analysis:
  - `eval/fixtures/benchmark-tech-startups-b2b-software-v2-query-set.json`
- domain-cohort fixture:
  - `eval/fixtures/benchmark-tech-startups-b2b-software-v1-domains.json`

Use the existing benchmark query-set seed path plus the dedicated cohort seed path:

```bash
npm run benchmark:seed:query-set -- --fixture eval/fixtures/benchmark-tech-startups-b2b-software-v1-query-set.json
npm run benchmark:seed:domain-cohort -- --fixture eval/fixtures/benchmark-tech-startups-b2b-software-v1-domains.json
```

The startup cohort fixture is intentionally seeded with `schedule_enabled=false` so it does not join the mature recurring schedule by accident before proof-window review.

## First proof-window lesson

The first startup proof showed that the original `v1` startup query family mixed in prompts that were too category-wide for grounded site evidence.

Observed failure mode:
- `grounded_site` can only rely on the measured company's own pages
- prompts like "Which startup companies are known for..." or "What should a buyer compare when looking at AI software startups..." invite category-wide claims
- for domains like `linear.app`, grounded mode correctly refused or narrowed the answer because the site evidence did not support those broader market claims

That means the next startup query family should prefer company-evaluable prompts such as:
- what the company helps teams do
- who the likely buyer is
- what trust or maturity signals the site shows
- what differentiators the company emphasizes
- how clearly the site explains the product

The `v2` startup query set exists for that exact reason. It is a narrow prompt-family correction, not a benchmark-platform rewrite.

## First recurring-pilot decision

After the four-domain `v2` proof set, the next narrow startup step is no longer another prompt rewrite.

The next correct step is a tiny recurring pilot using only the four startup domains that already proved stable under the `v2` frame:
- `linear.app`
- `supabase.com`
- `vercel.com`
- `replicate.com`

That pilot is intentionally separate from the broader 18-domain startup cohort and is documented in:
- `PLAYBOOK/benchmark-tech-startups-collection-pilot-v1.md`

Current startup-lane truth remains:
- measured-domain inclusion looks stable enough for a tiny recurring pilot
- citations still remain domain-level rather than page-level
- broader startup recurring collection is still not approved yet

## Non-goals

This methodology does not approve:
- a public startup leaderboard
- mixed startup + services cohorts
- broad internet "best startup" rankings
- a benchmark rewrite for startup-specific logic
- widening the current recurring schedule beyond what operator evidence can support
