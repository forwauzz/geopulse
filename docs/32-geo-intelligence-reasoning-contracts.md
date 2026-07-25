# GEO intelligence reasoning contracts

Issue: INT-010
Contract: `intelligence-reasoning-v1`

## Decision

The reasoning layer stays in the existing backend under `lib/intelligence`. It is an
application service, not a new brain deployment or standalone microservice. SQL marts and
quality policy select canonical facts first. An optional model adapter may summarize only
those facts; it cannot write facts, quality states, policies, or recommendations.

The retrieval experiment in INT-009 returned a no-go for production vector storage, so this
layer does not add RAG. It can accept a future retrieval adapter if a later measured use case
passes its evaluation threshold.

## Shared contract

All consumers—admin UI, reports, Slack, future agents, and a future `/api/v1`—can wrap the
same request and insight contracts without exposing Supabase rows. Every ready insight has:

- a bounded finding and confidence;
- evidence IDs and compatible run IDs;
- policy, prompt, provider, and model versions;
- explicit limitations and one approved read-only next action.

The eight initial capabilities are registered as read-only tools. Zod validates runtime
inputs and outputs; a portable JSON Schema describes the request boundary.

## Evidence gate

The service fails closed when facts are missing, evidence IDs or run IDs are absent,
comparison samples are too small, measurement labels are incompatible, or tenant scope does
not match. Model-provided IDs must be a subset of SQL-selected fact lineage. Causal language
is rejected for observational intervention evidence.

## Internal endpoint

`POST /api/internal/intelligence` is available only to authenticated platform admins. It is
bounded to 30 requests per authenticated actor per minute through the existing Cloudflare KV
binding and returns `private, no-store`. It is read-only and uses the service-role database
client only after the session and database-backed platform-admin check succeed.

The endpoint returns a stable error envelope for invalid input, insufficient evidence,
unsupported claims, tenant violations, rate limits, missing migrations, and internal errors.

## Evaluation

`eval/fixtures/intelligence-reasoning-golden-v1.json` declares one golden and four
adversarial cases:

1. supported timeline synthesis;
2. hallucinated lineage;
3. incompatible comparisons;
4. tenant leakage;
5. misleading causal language.

These are enforced by unit tests without calling a model provider.

## Rollout

This code is safe to deploy before migrations 059–065 are applied: the endpoint reports
`migration_pending` rather than fabricating an insight. No Agents SDK, OpenAI SDK, new
frontend, vector database, or standalone service is required.
