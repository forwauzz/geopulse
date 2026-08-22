# Evidence mining and claim discipline

Use this reference for every statistic, audit, benchmark, buyer-intelligence, ranking, percentage,
count, trend, or comparison.

## Source priority

1. **Quality-eligible first-party evidence**
   - canonical buyer-intelligence snapshot and its evidence IDs
   - quality-eligible benchmark runs inside one frozen frame
   - deep-audit payloads and report artifacts that passed the report QA gate
   - production metrics with an exact source, collection time, and definition
2. **Current primary external sources**
   - provider/company disclosures, official research, regulator/government data, or original paper
3. **Current product and methodology truth**
   - shipped code, contracts, approved methodology, and current product pages
4. **Secondary reporting**
   - discovery only; follow it to the primary source before public use
5. **Social chatter or LLM research packets**
   - vocabulary and hypotheses only; never public proof

## GEO-Pulse source map

Mine read-only sources before asking the founder to restate data:

- Buyer intelligence contract: lib/intelligence/buyer-intelligence-contract.ts
- Intelligence evidence and quality: docs/27-geo-intelligence-evidence-catalog.md,
  lib/intelligence/evidence.ts, and lib/intelligence/quality-policy.ts
- Benchmark methodology: PLAYBOOK/benchmark-competitor-cohort-methodology-v1.md and the compatible
  run/query-set records referenced by the benchmark scripts
- Deep audit truth: workers/report/deep-audit-report-payload.ts, report QA output, and the exact
  eligible report artifact
- Audit check definitions: workers/lib/interfaces/audit.ts and the shipped check implementations
- Product truth: shipped app routes, current contracts, and .agents/product-marketing-context.md
- Public market statistics: browse the current primary publisher and save the direct URL/date

GitHub comments, run logs, synthetic fixtures, campaign dry runs, and social-research packets may help
discover an idea. They are not automatically public proof. Refresh the underlying production or primary
source and apply its privacy/quality gate first.

## Mandatory evidence fields

Every public claim needs:

- stable claim_id
- claim_type
- exact public claim
- source title and URL or repository path
- source publisher/owner
- publication or observation date
- access date
- metric name, value, and unit when quantitative
- population/cohort and denominator
- sample size, or not_applicable
- time window
- method
- scope and limitations
- privacy classification and treatment
- allowed public wording
- prohibited inference

Validate the JSON with scripts/validate-evidence-brief.mjs.

## External market statistics

- Browse for the current primary source; statistics are time-sensitive.
- Prefer the source that owns the number. Do not cite a roundup that cites a news story that cites the
  original disclosure.
- Preserve qualifiers such as “more than,” geography, age group, weekly/monthly, survey wording, and
  date.
- Never change users into buyers, active users into searches, or global use into local demand.
- A large audience statistic establishes relevance, not that a specific customer will choose a
  business.

Example structure, only after the number is verified:

> More than [verified value] people use [platform] [time unit]. When one of them asks for [service],
> is your business part of the answer? Run a free GEO-Pulse audit to see what the measured answers
> currently surface.

Do not append “show up first.” That is a ranking promise unsupported by an audience statistic.

## Audit findings

### One audit

Use language such as:

- “In this audit…”
- “This site had…”
- “The scan observed…”

Do not generalize one site into an industry percentage.

### Aggregate audit data

Require:

- explicit inclusion/exclusion rule
- deduplicated site or page denominator
- audit version/check definition
- collection window
- pass/fail/blocked treatment
- missing-data treatment
- cohort/vertical
- privacy review

For private or tenant evidence, aggregate and redact domains by default. A named customer result
requires explicit permission and approved outcome language.

Never treat BLOCKED, NOT_EVALUATED, LOW_CONFIDENCE, or missing evidence as a clean fail unless the
metric definition explicitly says so.

## Benchmark signals

A comparison is public-claim eligible only when every compared domain shares:

- query-set ID and version
- model/provider lane
- run mode and scope
- benchmark window
- metric definition
- completed, quality-eligible run status

Disclose the denominator and frame. Safe framing:

- “In this benchmark frame…”
- “Across this query set and model lane…”
- “In the latest comparable run window…”

Unsafe framing:

- “best in AI search”
- “industry rank #1”
- “category leader”
- “objective market position”

Keep query coverage, citation rate, share of voice, and grounded exact-page quality separate. Never
blend grounded and ungrounded runs into one score.

## Buyer intelligence

Use only a canonical, report-eligible snapshot or clearly label the result unavailable. The snapshot
must carry:

- organization context version/hash
- run and evidence lineage
- quality policy
- provider availability
- buyer-question observations and collection time
- an eligible benchmark with a positive disclosed denominator, or explicit not_available
- limitations

Recommendations must map to observations and a versioned verification rule. Raw provider text remains
in the evidence catalog; do not expose private payloads in social content.

## Evidence grades

- A: quality-eligible first-party evidence or current primary external source with complete scope
- B: approved methodology/product truth, or a narrow first-party observation with explicit limits
- C: secondary source, anecdote, social research, hypothesis, or incomplete lineage

Only grades A and B are publishable. Grade C can inspire a non-statistical idea but cannot appear as
proof.

## Stop conditions

Stop the statistical route and either research again or remove the number when:

- the primary source cannot be found
- date, denominator, method, or scope is unknown
- a benchmark frame is mixed or incomplete
- evidence is quarantined, private without approval, missing, or low confidence
- the copy requires a causal or ranking inference the data does not support
