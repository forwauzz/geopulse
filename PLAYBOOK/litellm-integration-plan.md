# LiteLLM Integration Plan

Last updated: 2026-03-26

## Purpose

This document defines how GEO-Pulse should introduce LiteLLM without destabilizing the current product.

It is a design plan, not yet an implementation.

## Why LiteLLM

GEO-Pulse needs two things at once:
- keep the current audit/report product provider-swappable
- prepare for a multi-model benchmark layer

LiteLLM is a good fit because it gives GEO-Pulse:
- one request surface across multiple model vendors
- model routing without rewriting business logic
- cleaner future support for OpenAI / Anthropic / Gemini / others
- a path to cost and usage tracking later

## Current repo state

Current LLM path:
- `workers/lib/interfaces/providers.ts` defines `LLMProvider`
- `workers/providers/gemini.ts` implements that interface
- `app/api/scan/route.ts` and `workers/queue/report-queue-consumer.ts` construct `GeminiProvider` directly

This is already a useful seam.

## Integration principle

Do not replace the `LLMProvider` abstraction.

Instead:
- keep `LLMProvider` as the app-facing contract for audit/report code
- add a new provider implementation backed by LiteLLM
- keep Gemini as a direct fallback or compatibility lane during rollout

That lets the current product continue to work while the benchmark layer gains multi-model flexibility.

## Recommended boundary design

### App-facing contract stays stable

Keep:
- `LLMProvider`
- `LLMResult`

Why:
- current scan and deep-audit code already depend on that interface
- changing all call sites now would create avoidable risk

### Add a LiteLLM-backed provider

Add a new provider such as:
- `workers/providers/litellm.ts`

Responsibilities:
- translate `analyze(prompt, context)` into a LiteLLM request
- enforce JSON-only output expectations for current audit checks
- normalize LiteLLM responses into `LLMResult`
- map provider/model errors into stable internal reasons

### Add a model-lane config layer

Do not hardcode target model names in business logic.

Introduce config concepts like:
- `AUDIT_LLM_PROVIDER`
- `AUDIT_LLM_MODEL`
- `BENCHMARK_TARGET_MODEL`
- `BENCHMARK_AUDITOR_MODEL`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`

The app should choose provider/model from config, not from direct imports.

## Proposed implementation shape

### 1. New provider module

Add:
- `workers/providers/litellm.ts`

This provider should:
- call LiteLLM chat/completions endpoint
- send a tightly constrained JSON-response instruction
- parse response text safely
- return `LLMResult`

### 2. Provider factory

Add a small factory such as:
- `workers/providers/create-llm-provider.ts`

Purpose:
- centralize provider selection
- choose between:
  - `GeminiProvider`
  - `LiteLLMProvider`
  - `UnconfiguredLlm`

Call sites that currently instantiate Gemini directly should switch to the factory.

### 3. Separate target-model vs auditor-model concepts

For benchmark work, GEO-Pulse will eventually use:
- target models: the models being measured
- auditor models: optional models used to parse/classify outputs

Do not force the current audit flow into that complexity yet.

But the config and naming should leave room for it now.

## Non-goals for first LiteLLM rollout

Do not do all of this in the first pass:
- full prompt/version management in LiteLLM
- benchmark orchestration
- cost dashboards
- vendor failover logic
- customer-visible model switching
- replacing every Gemini path immediately

The first rollout should be narrow:
- prove the provider boundary
- prove one LiteLLM-backed audit lane
- keep the rest unchanged

## Rollout plan

### Step 1
- add LiteLLM config to env docs
- add `LiteLLMProvider`
- add provider factory
- preserve existing GeminiProvider

### Step 2
- switch one internal path to factory-based provider selection
- keep Gemini as default if LiteLLM is not configured

### Step 3
- verify current audit checks still work against the LiteLLM path
- verify JSON parsing remains strict and deterministic enough

### Step 4
- reuse the same LiteLLM wrapper in the benchmark runner later

## Error-handling rules

The provider must normalize these classes of failure:
- missing configuration
- upstream non-200
- timeout
- invalid / non-JSON model output
- empty output

It should not leak vendor-specific response formats into the scan engine.

## Observability expectations

LiteLLM integration should prepare for, but not require, later tracing.

At minimum, preserve structured metadata fields such as:
- provider name
- model id
- latency if available
- token usage if available
- request outcome

These can later flow into Langfuse or benchmark logs.

## Security and operational notes

- no provider secret belongs in client-side code
- the provider factory must remain server/worker only
- benchmark and audit traffic should remain logically distinct even if they share LiteLLM
- do not let benchmark experimentation break the audit/report path

## Acceptance bar for BM-003

This plan should be considered complete when:
- the repo has an explicit LiteLLM boundary strategy
- current `LLMProvider` continuity is preserved
- new env/config concepts are identified
- rollout is staged and low-risk
- benchmark work can reuse the same provider abstraction later
