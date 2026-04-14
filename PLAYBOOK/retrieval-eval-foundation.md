# Retrieval Eval Foundation

## Purpose

This document defines the first implementation boundary for retrieval evaluation in GEO-Pulse. It exists to keep `promptfoo`, `ragas`, and retrieval simulation work concrete and staged rather than aspirational.

## Scope for RE-001

### MVP retrieval-eval goal

Evaluate whether GEO-Pulse can:

1. derive passages from already scanned pages
2. run a small prompt set against those passages
3. record which passages were selected
4. compare the answer against expected evidence
5. score the run deterministically before introducing external benchmark claims

### Inputs

- One completed deep audit (`scan_run`)
- A bounded prompt set (`3–10` prompts per domain)
- Page passages extracted from fetched HTML / markdown-safe text
- Optional expected evidence strings or expected source URLs

### Outputs

- Retrieval eval run record
- Prompt-level result rows
- Chosen passage rows
- Answer rows
- Deterministic metrics:
  - answer_has_expected_source
  - answer_mentions_expected_fact
  - retrieved_expected_page
  - citation_count
  - unsupported_claim_count

## Non-goals for MVP

- No live querying of ChatGPT, Gemini, Perplexity, or Copilot
- No public “benchmark percentile” claims from retrieval eval yet
- No competitive share-of-voice engine
- No prompt mining from Reddit/Quora in this phase
- No `ragas` dependency until the offline data model and baseline harness exist
- No `promptfoo` production gate until prompt fixtures and expected outputs are stable

## Tooling roles

### `promptfoo`

Use later for prompt-regression testing of:

- executive summary quality
- fix specificity
- status preservation
- retrieval answer formatting consistency

`promptfoo` is not the retrieval engine. It is a regression harness around prompts and outputs.

### `ragas`

Evaluate only after a stable retrieval dataset exists. Candidate uses:

- faithfulness
- answer relevance
- context precision
- context recall

Do not adopt `ragas` before the deterministic baseline is in place, or scores will be difficult to trust.

## Suggested rollout

### Phase A

- Add storage schema
- Store prompt sets, passages, answers, and metrics
- Build deterministic scoring helpers

### Phase B

- Build local retrieval simulation harness over scanned pages
- Run against static fixtures first

### Phase C

- Add `promptfoo` suites for regression
- Decide whether `ragas` adds signal beyond deterministic checks

## Acceptance criteria for the foundation

- Schema exists for runs, prompts, passages, and answers
- At least one documented prompt-set shape exists
- Non-goals are explicit so the product does not overclaim retrieval capability

## Fixture shape used now

The current deterministic writer expects a fixture JSON with:

```json
{
  "siteUrl": "https://example.com/",
  "pages": [
    { "url": "https://example.com/docs", "section": "docs", "content": "..." }
  ],
  "prompts": [
    {
      "promptKey": "schema_coverage",
      "promptText": "How do I improve schema coverage for FAQ answers?",
      "expectedSources": ["https://example.com/docs"],
      "expectedFacts": ["FAQPage schema"]
    }
  ]
}
```

Current repo examples:
- `eval/fixtures/retrieval-eval-sample.json`

Current writer:
- `npm run eval:retrieval:write -- --site-url https://example.com`
