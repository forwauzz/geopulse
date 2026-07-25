# GEO intelligence governed learning

Issue: INT-011

## Operating rule

The data bank may surface recurring patterns, but it cannot silently change scoring,
recommendations, prompts, parsers, metrics, or customer claims. The governed lifecycle is:

`candidate pattern -> compatible evidence -> hypothesis -> holdout -> human review -> shadow policy -> promotion or rejection -> monitored outcome -> rollback if needed`

This is methodology governance, not online self-modification or model fine-tuning.

## Required proposal record

Every candidate records effect size, sample size, cohort definition, lane IDs, confidence,
limitations, evidence IDs, and compatible run IDs. Only `valid` or `valid_partial` runs with
an exact compatibility label are accepted. Intervention evidence defaults to
`observational_association_not_causation`; causal wording requires explicit randomized
holdout lineage.

Regression and rollback criteria are mandatory before evaluation begins. Report and
retrieval evals are linked by immutable IDs plus their rubric, generator, and source-snapshot
versions. Their original records are not rewritten.

## Promotion gates

1. A predeclared holdout must pass.
2. A named human must approve the methodology.
3. The new policy version runs in non-customer-visible shadow mode.
4. Shadow and regression criteria must pass.
5. A human performs the promotion.

Customer-affecting policy states are also protected by database constraints. All transition
events are append-only, and the new tables are service-role only.

## Versioning and rollback

Scoring, recommendation, prompt, parser, and metric versions share one policy registry.
Measurements continue to retain the version used when they were produced. Rollback creates
an audited transition that restores `previous_version`; it does not edit the candidate
version or rewrite historical results. The database rollback function performs the active
version swap and audit-event insert in one transaction.

## Rollout

Migration `066_intelligence_governed_learning.sql` creates the registries and database gates.
Until migrations 059–066 are applied, the code and documentation are deployable but the
database-backed learning loop remains intentionally unavailable.
