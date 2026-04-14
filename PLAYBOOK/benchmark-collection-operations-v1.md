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

To force one future or specific window explicitly:

```bash
npm run benchmark:schedule:run-now -- --window-date 2026-03-30T12
```

Use this only for controlled internal collection when you want the next comparable window immediately without waiting for the UTC slot to arrive.

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

## Multi-window recurrence command

After a few comparable windows exist, summarize which domains keep winning or lagging across the same frame:

```bash
npm run benchmark:schedule:recurrence -- --window-dates 2026-03-30T00,2026-03-30T12,2026-03-31T00
```

Use this as a small evidence helper only:
- explicit chosen windows
- same query set
- same model lane
- same schedule version
- no new benchmark UI or persistent aggregation layer

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

## Next replacement candidate

The next narrow replacement candidate for `law_firms` is now frozen as a draft only:
- sub-cohort: `business_counsel / biglaw / enterprise`
- draft fixture: `eval/fixtures/benchmark-law-firms-business-counsel-v1-query-set.json`

Current rule:
- keep the live broad lane unchanged for comparability
- do not seed or schedule the narrow draft until the target cohort list is frozen operationally
- treat the draft as a methodology artifact, not a live lane

The first narrow target-domain list is now also frozen:
- cohort label: `law_firms_business_counsel_v1`
- domain count: `17`
- source: current `law_firms` priority-1 live lane

Excluded from this first narrow lane on purpose:
- `forthepeople.com`
- `cordellcordell.com`
- `fragomen.com`
- `seyfarth.com`

The first narrow query-set seed command is now explicit too:

```bash
npm run benchmark:seed:query-set:business-counsel
```

This command is allowed before scheduling because it only creates the query-set record.
It does not change the live recurring lane on its own.

Current seeded draft record:
- `query_set_id: 9910b5ac-ade6-42be-9dca-9b85c04e4469`
- `query_count: 6`

The scheduler now supports an explicit domain allowlist for narrow preview and later narrow-lane launch:
- env key: `BENCHMARK_SCHEDULE_DOMAINS`
- value shape: comma-separated canonical domains

For the first narrow preview, use the frozen 17-domain cohort rather than the full broad `law_firms` priority-1 slice.

## First narrow-lane outcome

The first live narrow replacement frame is now real:
- schedule version: `law-firms-business-counsel-v1`
- query set id: `9910b5ac-ade6-42be-9dca-9b85c04e4469`
- domain count: `17`
- first window: `2026-03-30T00`

Current truth after the first window:
- the narrow lane ran cleanly
- grounded-vs-ungrounded signal remains meaningful
- the narrower cohort/query frame is cleaner than the broad mixed lane
- `exact_page_quality_rate` still remains non-gating

Current operator rule:
- keep collecting this narrow lane unchanged for comparable windows
- do not change prompt/model/evidence-depth yet
- do not launch a second narrow law-firm sub-cohort yet

## Primary law-firms lens

After three comparable windows, the primary internal law-firms benchmark lens is now:
- `law-firms-business-counsel-v1`

The original broad lane:
- `law-firms-p1-v1`

should now be treated as:
- a legacy broad comparison frame
- useful for historical contrast
- not the main law-firms methodology lane going forward

For this stage, use the recurrence helper when freezing recurring winners and laggards from a small explicit window set rather than hand-comparing one-window outputs repeatedly.

## Three-window truth freeze

Current evidence set for the narrow law-firms lane:
- `2026-03-30T00`
- `2026-03-30T12`
- `2026-03-31T00`

Current frozen truths from that three-window set:
- the narrow lane is producing repeatable relative differences, not just one-window noise
- recurring grounded winners are:
  - `perkinscoie.com`
  - `sidley.com`
  - `kirkland.com`
  - `winston.com`
  - `fr.com`
- the clearest recurring grounded laggard is:
  - `gibsondunn.com`
- `exact_page_quality_rate` remained `0%` across the comparable window set
- the current benchmark interpretation remains:
  - useful for `domain-level grounded attribution`
  - not yet credible as `exact-page provenance`

Operator implication:
- keep the narrow lane unchanged for the next comparable windows
- use targeted run diagnostics on the stable winners and laggard before changing prompt/model/evidence-depth
- do not treat the current recurring signal as proof that provenance matching is the next bottleneck

## Winner-laggard diagnostic freeze

Targeted grounded-run diagnostics on the latest stable winners plus `gibsondunn.com` now make one additional truth explicit:
- the current winner/laggard split is not driven by exact-page URL matching
- the current winner/laggard split is not driven by one domain returning many page URLs while another does not

Observed pattern on the latest grounded runs:
- recurring winners such as `perkinscoie.com`, `sidley.com`, `kirkland.com`, `winston.com`, and `fr.com` are still producing `domain-only` citations rather than page URLs
- `gibsondunn.com` shows the same citation shape, but with materially fewer total citations
- matched provenance remains `0`
- page-URL citation count remains `0`

Interpretation:
- the current narrow lane is measuring repeatable `domain-level citation lift under grounding`
- the current bottleneck is more likely `whether the model chooses to mention the domain at all`
- the current bottleneck is not yet `URL matcher quality`

Operator rule:
- do not prioritize provenance rewrites from this evidence alone
- the next diagnostic step should inspect response text plus grounded evidence shape for one stable winner and `gibsondunn.com`

## Response-shape diagnostic freeze

The first response-level comparison between one stable winner (`perkinscoie.com`) and the recurring laggard (`gibsondunn.com`) adds another important constraint:
- the current winner/laggard split is not a simple proxy for `answer usefulness`
- the current winner/laggard split may partly reflect `extractor-friendly domain mention patterns`

Observed pattern:
- `perkinscoie.com` often returns refusal-shaped grounded answers such as "the provided evidence does not contain information...", but still earns one extracted domain citation on each query
- `gibsondunn.com` often returns richer grounded answers with concrete descriptive claims, but earns few or no extracted citations on most queries
- both runs still use the same `site_builder` grounding path
- both runs still rely on `4` grounded evidence pages
- both runs still remain `domain-only` with `0` page URLs and `0` matched provenance

Interpretation:
- the current lane is measuring `domain mention / citation extraction lift under grounding` more directly than it measures overall answer quality
- a domain can currently overperform on `citation_rate` while underperforming on substantive answer usefulness
- a domain can currently underperform on `citation_rate` even when the grounded answer text is more informative

Operator rule:
- do not interpret `citation_rate` alone as a full quality metric for this lane
- before changing prompt/model/evidence-depth, review whether the current extraction contract is overweighting conservative domain-mention responses

## Extraction-contract freeze

The current extraction and metric contract adds one more important limit to interpretation:
- citation extraction v1 counts:
  - explicit URLs
  - explicit domains
  - brand mentions
- it does not evaluate whether the answer is substantively useful
- it does not evaluate whether the citation is framed as a refusal, a weak inference, or a strong comparative recommendation

The current `citation_rate` contract is also broader than "measured domain cited":
- `citation_rate` = completed runs with at least one qualifying citation / completed runs
- in other words, it measures `citation presence`
- it does not require that the qualifying citation belong to the measured domain

The current `share_of_voice` contract is the narrower domain-specific signal:
- `share_of_voice` = citations for the measured domain / total qualifying citations in scope

Interpretation rule for the current narrow lane:
- treat `citation_rate` as a coarse answer-contains-citation signal
- treat measured-domain citation behavior as a separate question, read through:
  - `share_of_voice`
  - outlier review
  - run diagnostics
  - response-text inspection

Operator implication:
- do not read current winners and laggards as pure domain-quality rankings
- current differences may still partly reflect extraction-friendly citation wording
- if future benchmark work needs a stronger "did the model cite this measured domain?" signal, add it as a separate metric slice rather than silently redefining `citation_rate`

## Measured-domain rerun freeze

The recent narrow-lane comparison has now been rerun against a measured-domain-specific citation lens across the same three completed windows:
- `2026-03-30T00`
- `2026-03-30T12`
- `2026-03-31T00`

Current truth from that rerun:
- the winner/laggard ordering remains materially the same under the measured-domain lens
- the strongest recurring grounded winners remain:
  - `perkinscoie.com`
  - `lw.com`
  - `sidley.com`
  - `kirkland.com`
  - `fr.com`
- the clearest recurring grounded laggards remain:
  - `gibsondunn.com`
  - `goodwinlaw.com`
  - `btlaw.com`
  - `huschblackwell.com`
  - `millerchevalier.com`

Interpretation:
- the current narrow lane is not mostly being distorted by citations to unrelated domains
- the current grounded-vs-ungrounded differences still largely reflect `measured-domain citation lift`
- the main remaining interpretation risk is still:
  - `citation shape vs answer usefulness`
  - not `wrong-domain citation contamination`

Operator rule:
- keep using the new measured-domain metric for future windows
- treat the next debugging question as "why do some domains get cited more often under grounding?" rather than "are we mostly counting the wrong domain?"

## Query-level lift freeze

The next narrow diagnostic compared one stable winner (`perkinscoie.com`) and the recurring measured-domain laggard (`gibsondunn.com`) query by query across the same recent completed windows.

Current prompt-level truth:
- `perkinscoie.com` is not winning uniformly on every query because of grounding
- `perkinscoie.com` shows the clearest grounding lift on a narrow business/regulatory subset:
  - `Which law firms are known for high-stakes business litigation?`
  - `Which law firms are recommended for complex tax, trade, or sanctions matters?`
  - `Which law firms are recommended for immigration help?`
  - `Which law firms are strong at cross-border regulatory and compliance matters?`
  - `Which law firms help businesses with employment disputes or workplace compliance?`
- on several other prompts, `perkinscoie.com` is cited in both grounded and ungrounded modes, so grounding is not the differentiator there

The laggard pattern is also more specific now:
- `gibsondunn.com` is not broadly uncited on every prompt
- it remains stable on:
  - `Which law firms are recommended for complex tax, trade, or sanctions matters?`
- it materially loses measured-domain citation presence under grounding on:
  - `What makes a law firm credible for government investigations or white-collar matters?`
  - `Which law firms help businesses with employment disputes or workplace compliance?`
  - `Which law firms help with workplace discrimination or employment disputes?`
  - `Which law firms are recommended for immigration help?`
- it also shows a smaller negative shift on:
  - `What should a business look for when choosing a corporate law firm?`

Interpretation:
- the current narrow lane is not just telling us "some domains win and some domains lose"
- it is telling us that grounding changes citation behavior unevenly by prompt family
- the strongest lift currently appears on `business/regulatory fit` prompts for some domains
- the clearest losses currently appear where grounded evidence seems to suppress otherwise free-form brand mention for `gibsondunn.com`

Operator rule:
- do not change the full lane yet
- use prompt family, not only domain average, as the next debugging lens
- the next useful slice is evidence/response inspection on one positive-lift prompt and one negative-lift prompt for `gibsondunn.com`

## Gibson Dunn prompt-pair freeze

The next diagnostic inspected `gibsondunn.com` directly on one negative-lift prompt and one stable prompt in the latest comparable completed window (`2026-03-31T00`), comparing `grounded_site` against `ungrounded_inference`.

Negative-lift prompt:
- `What makes a law firm credible for government investigations or white-collar matters?`

Observed pattern:
- `ungrounded_inference` explicitly names `gibsondunn.com` and therefore gets a measured-domain citation
- `grounded_site` returns a more descriptive answer about government experience, global scale, disputes, and high-stakes work
- but the grounded answer does not explicitly name `gibsondunn.com`
- result: the measured-domain citation disappears even though the grounded answer still sounds relevant to the domain

Stable prompt:
- `Which law firms are recommended for complex tax, trade, or sanctions matters?`

Observed pattern:
- both `ungrounded_inference` and `grounded_site` explicitly name `gibsondunn.com`
- the grounded answer is refusal-shaped and says the evidence does not specifically recommend firms, but still names the domain
- result: the measured-domain citation survives in both modes

Interpretation:
- for this lane, the practical extraction threshold is still very close to:
  - `does the answer explicitly name the measured domain?`
- grounded evidence can suppress measured-domain citation if it nudges the model into descriptive paraphrase without explicit domain naming
- grounded evidence can preserve measured-domain citation even in low-value refusal-style answers if the model still names the domain

Operator rule:
- the next benchmark improvement should focus on explicit measured-domain naming behavior under grounding on business-fit prompts
- do not treat this as evidence that the evidence set is entirely wrong
- do not treat this as evidence that exact-page provenance is the next bottleneck

## Deferred next slice

This is the next benchmark task to resume after higher-priority work:
- improve explicit measured-domain naming under grounding on business-fit prompts

Why this is the next slice:
- the current narrow lane is already producing stable signal
- the clearest remaining failure mode is not provenance
- the clearest remaining failure mode is not wrong-domain contamination
- the clearest remaining failure mode is grounded answers that stay relevant but do not explicitly name the measured domain

When resuming, do the work in this order:
1. locate the grounded benchmark answer-generation prompt/template
2. make one minimal prompt change that encourages explicit naming of the evaluated domain when the grounded evidence supports describing that firm
3. test only the current failing `gibsondunn.com` business-fit prompts first:
   - `What makes a law firm credible for government investigations or white-collar matters?`
   - `Which law firms help businesses with employment disputes or workplace compliance?`
   - `Which law firms are recommended for immigration help?`
   - `Which law firms help with workplace discrimination or employment disputes?`
4. rerun grounded vs ungrounded on that narrow prompt set
5. compare:
   - `measured_domain_citation_rate`
   - response usefulness / specificity
   - whether answers degrade into low-value refusal-style domain mentions

Success criteria for the slice:
- measured-domain citation presence improves on the failing prompt family
- grounded answers still contain useful descriptive content
- no lane-wide methodology changes are made in the same slice

Do not do these in the same return session unless the small prompt experiment clearly succeeds:
- widen the cohort
- add more models
- redesign provenance scoring
- change the full benchmark lane methodology

## Next slices after this one

Only after the first lane stabilizes:
1. widen `law_firms` to priority `2`
2. start `real_estate` priority `1`
3. decide whether `dental` should wait for more curated seed selection because its priority-1 slice is too small

Near-term methodology slices now come first:
1. freeze the first narrow replacement target subgroup
2. freeze the first narrow query-set draft for that subgroup
3. freeze the exact target-domain list for that subgroup
4. only then seed and test a narrow replacement lane

## Non-goals

This operating plan does not add:
- customer-facing benchmark reports
- automatic benchmark emails
- broad cohort ranking claims
- 500 to 1000-site operations
