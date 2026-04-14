# Citation And Metrics v1

Last updated: 2026-03-26

## Purpose

This document defines:
- citation extraction v1 for the benchmark runner
- first metric computation semantics for the benchmark layer

It exists to prevent the first implementation from inventing citation logic ad hoc.

## Conflict check

Current repo review found no existing general citation-extraction service.

What exists today:
- retrieval-eval writes `cited_sources` for deterministic local fixtures
- Promptfoo retrieval fixtures emit citation arrays in local harness code
- admin retrieval drilldown displays those stored arrays

What does **not** exist:
- a shared citation-extraction service for benchmarked LLM responses
- a benchmark-wide share-of-voice metric service

So this v1 contract does not collide with an existing citation platform inside the repo.

## Design principles

1. Prefer precision over recall in v1.
2. Preserve raw response text before interpretation.
3. Separate observed citations from computed metrics.
4. Keep outcome metrics internal and conservative until methodology matures.
5. Do not let benchmark terminology leak into the customer-facing audit score.

## Citation extraction v1

### What counts as a citation in v1

Accepted citation classes:
- explicit URL present in the model response
- explicit domain mention that clearly refers to a source site
- explicit brand mention only when:
  - it maps confidently to a measured domain
  - it is not ambiguous

V1 should not try to infer:
- paraphrased source attribution without a clear URL/domain/brand anchor
- latent “influence” from tone alone
- ranking weight from answer wording alone

### Citation priority order

When parsing a response, prefer this order:
1. explicit URL
2. explicit domain
3. explicit brand mention

If a stronger class exists, do not downgrade to a weaker duplicate row for the same source.

Example:
- if `https://example.com/pricing` appears, do not also store `example.com` and `Example` as separate primary citations unless there is a real reason to preserve multiple mentions in metadata

### Parsed citation shape

V1 shared parsed citation shape:

```ts
type ParsedCitationV1 = {
  citedDomain: string | null;
  citedUrl: string | null;
  citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention';
  rankPosition: number | null;
  confidence: number | null;
  metadata?: Record<string, unknown>;
};
```

### Confidence guidance

Use conservative confidence values:
- `1.0` for explicit URL directly present
- `0.8` for explicit domain directly present
- `0.6` for explicit brand mention with unambiguous domain mapping
- null or omit if confidence cannot be defended

### Duplicate handling

Within one `query_run`:
- deduplicate by strongest available source identity
- preferred dedupe key:
  - normalized URL if present
  - else normalized domain

### Rank position

Use `rankPosition` only if the response format makes order obvious.

Examples:
- numbered list output
- ordered source list
- clear first/second/third mention sequence

If order is unclear, keep `rankPosition = null`.

### Brand mention rules

Brand mention extraction should remain narrow in v1.

Only count a brand mention when:
- the measured domain’s display name or known brand alias appears clearly
- the name is not a common generic word
- the mapping to one domain is unambiguous

If ambiguity exists, do not count it as a citation row.

## Query-run outcome states

For metric purposes, a `query_run` is:
- `completed_with_citation`
- `completed_without_citation`
- `failed`
- `skipped`

This is derived, not stored as a separate table.

## Metric definitions v1

### 1. `query_coverage`

Definition:
- completed query runs / total scheduled queries in the query set for that run group and model

Why:
- measures runner completeness
- not visibility success

### 2. `citation_rate`

Definition:
- completed query runs with at least one qualifying citation / completed query runs

Qualifying citation:
- at least one stored `query_citations` row that passes the v1 rules above

Why:
- simplest first visibility outcome

### 3. `share_of_voice`

Definition:
- citations for the measured domain / total qualifying citations in the comparison pool

Important v1 rule:
- for a single-domain run group, this metric is allowed but weak
- it becomes methodologically meaningful only once cohort runs exist

So in v1:
- compute it
- store it
- treat it as internal/provisional

### 4. `inclusion_rate`

Recommended additional v1 metric:
- completed query runs where the domain was cited at least once / completed query runs

Note:
- this is numerically similar to `citation_rate` in early versions
- keep it inside `metrics JSONB` first if useful, rather than adding a dedicated column immediately

### 5. `mention_rate`

Do **not** make this a first-class v1 metric yet.

Reason:
- brand mention parsing is more ambiguous than URL/domain citation parsing
- premature mention-rate claims risk noisy methodology

### 6. `inference_probability`

Allowed only as:
- internal-only
- experimental
- clearly derived from weighted citation outcomes, not marketed as a prediction guarantee

If implemented at all in v1:
- store in `metrics JSONB`
- keep methodology documented separately before exposing it

### 7. `drift_score`

Do not compute in v1 unless:
- same domain
- same query set version
- compatible model lane comparison exists

Otherwise store null.

## First computation formulas

Assume:
- `completed_runs` = number of query runs with status `completed`
- `scheduled_runs` = total query count for the run group/domain/model
- `cited_runs` = completed runs with >= 1 qualifying citation
- `domain_citation_count` = citations matching the measured domain
- `pool_citation_count` = all qualifying citations in scope

Then:

```text
query_coverage = completed_runs / scheduled_runs
citation_rate = cited_runs / completed_runs
share_of_voice = domain_citation_count / pool_citation_count
```

Guardrails:
- if denominator is zero, metric should be null or zero by explicit rule
- prefer explicit zero only when “no citations observed” is the truthful interpretation

## Scope of the comparison pool

For v1:
- comparison pool = all qualifying citations in the same run group and same model lane

Do not mix:
- different query set versions
- different model IDs
- different run groups

## Recommended storage shape

In `benchmark_domain_metrics`:
- keep core stable metrics in columns:
  - `citation_rate`
  - `share_of_voice`
  - `query_coverage`
  - `inference_probability`
  - `drift_score`

- keep extensible metrics in `metrics JSONB`, for example:
  - `completed_runs`
  - `scheduled_runs`
  - `cited_runs`
  - `domain_citation_count`
  - `pool_citation_count`
  - `explicit_url_citation_count`
  - `explicit_domain_citation_count`
  - `brand_mention_citation_count`

## What v1 explicitly avoids

Do not include yet:
- sentiment-weighted share of voice
- paraphrase scoring as a core metric
- answer prominence score
- model-normalized citation probability claims
- customer-facing benchmark percentiles
- co-citation graph analysis

Those are later layers, not v1.

## Validation guidance

The first implementation should be validated with:
- known explicit URL responses
- known explicit domain responses
- ambiguous brand-name responses
- zero-citation responses
- duplicated URL/domain responses

The benchmark runner should store raw response text so extraction logic can improve later without destroying provenance.

## Acceptance bar for BM-006

This contract is complete when:
- citation classes are explicitly defined
- dedupe and confidence rules are explicit
- first metric formulas are explicit
- v1 exclusions are explicit
- no conflict exists with current retrieval-eval citation helpers
