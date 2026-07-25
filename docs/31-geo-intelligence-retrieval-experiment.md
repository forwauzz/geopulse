# Geo Intelligence Retrieval Experiment

Issue: INT-009 / GitHub #220
Experiment: `retrieval-experiment-v1`
Decision: **No-go for production vector storage or RAG**

## Question

Do semantic embeddings add enough measurable value over structured and keyword retrieval to justify a production vector layer now?

This experiment does not replace Postgres, evidence lineage, SQL metrics, or authorization. No production reasoning feature imports the experiment runner.

## Evaluation set

The labeled fixture was committed before indexing. It covers:

- evidence discovery
- competitor visibility
- stale-run analogous cases
- recommendation similarity
- provider failure versus true zero-citation outcomes
- tenant isolation

Candidate documents carry stable evidence/source IDs plus domain, lane, model, time, quality, visibility, and tenant metadata. Structured filters execute before keyword scoring or cosine similarity.

The provider interface is replaceable. The OpenAI adapter uses the documented `/v1/embeddings` endpoint with `text-embedding-3-small`, 512 dimensions, ordered batch responses, usage tokens, and version metadata. An SDK is not required for this bounded adapter.

Official references:

- https://developers.openai.com/api/reference/resources/embeddings/methods/create
- https://developers.openai.com/api/docs/models/text-embedding-3-small

## Privacy boundary

The first provider run was refused because the full test fixture included tenant-isolation records. The completed provider run used a materially safer external-safe slice:

- generic synthetic examples only
- no production text
- no tenant-private records
- no internal visibility labels
- no raw PII

Tenant-private filtering is still covered locally. Private evidence is excluded by default; an exact tenant filter and explicit `allowTenantPrivate` scope are both required before it can become a candidate. The live provider script sets that scope to false.

## Results

Five external-safe tasks and ten documents were evaluated at top 3.

| Measure | Keyword + filters | Semantic + filters |
|---|---:|---:|
| Precision@3 | 0.2667 | 0.3333 |
| Recall@3 | 0.8000 | 1.0000 |
| Mean reciprocal rank | 0.8000 | 0.9000 |
| Access-control accuracy | 1.0000 | 1.0000 |
| Measured latency | 6.1 ms | 518.5 ms |

Semantic precision improved by 0.0667, below the predeclared 0.10 acceptance threshold. The run used 262 tokens with an estimated embedding cost of $0.00000524.

## Decision

Do not add production vector storage and do not make any reasoning or recommendation feature depend on semantic retrieval yet.

The semantic lane improved recall and ranking, but the labeled set is small and precision improvement did not meet the gate. The correct near-term architecture remains:

1. canonical Postgres identity, runs, evidence, quality, and marts
2. structured authorization and compatibility filters
3. keyword/structured retrieval as the baseline
4. semantic retrieval only as an offline, versioned challenger

## Revisit criteria

Run a second experiment only after:

- at least 30 labeled tasks across each target object type
- adjudicated relevance labels from real, privacy-approved evidence
- separate precision targets for evidence discovery, recommendation similarity, and analogous cases
- latency measured with cached document embeddings and per-query calls
- another provider/model challenger
- 100% tenant isolation and recoverable evidence/source IDs

Production go requires all access checks to pass, recall of at least 0.90, and semantic precision improvement of at least 0.10 over the same filtered keyword baseline.

## Persistence contract

Migration 065 stores experiment summaries, stable embedding manifests, and task results. It intentionally stores no vectors and no raw text. Stable embedding identity includes evidence ID, source ID, source-text hash, provider, model, and provider version, making re-embedding versioned and idempotent.
