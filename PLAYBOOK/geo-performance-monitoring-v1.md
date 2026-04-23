# GEO Performance Monitoring v1

Last updated: 2026-04-22

## Intent

Add a recurring AI visibility measurement service to GEO-Pulse so clients receive a monthly (or more frequent) GEO Performance Report showing:
- Brand visibility % across ChatGPT, Gemini, and Perplexity
- Average rank position per prompt and per platform
- Industry rank vs tracked competitors
- Prompt-level breakdown (which queries they win, which they lose)
- Competitor co-citation landscape

This is a new billable service registered in the existing service entitlement system. It is not a microservice. It is built on top of the existing benchmark runner, citation extraction, metrics, scheduling, workspace, PDF, and delivery infrastructure.

---

## Architecture Rule

This stream does not introduce a parallel backend. Every component reuses the existing spine:

- `benchmark_domains` / `benchmark_query_sets` / `benchmark_queries`
- `benchmark_run_groups` / `query_runs` / `query_citations` / `benchmark_domain_metrics`
- `lib/server/benchmark-runner.ts`
- `lib/server/benchmark-execution.ts` (provider adapters live here)
- `lib/server/benchmark-metrics.ts`
- `lib/server/benchmark-schedule.ts`
- `lib/server/service-entitlements.ts`
- `startup_workspaces` / `agency_accounts` (client containers)
- `workers/report/` (PDF + delivery)
- Resend + Slack delivery paths

New tables stay narrow. New routes are additive only.

---

## Platform Coverage

All paid tiers: **ChatGPT + Gemini + Perplexity**

- Gemini — already in `benchmark-execution.ts`
- ChatGPT (OpenAI) — new adapter, GPM-002
- Perplexity — new adapter, GPM-003 (OpenAI-compatible API, low lift after GPM-002)

`startup_lite` (free) — no GEO Performance Monitoring access.

---

## Package Entitlements

| Bundle | Platforms | Prompts per run | Cadence | Report delivery |
|---|---|---|---|---|
| `startup_dev` | ChatGPT + Gemini + Perplexity | 10 | Monthly | Email PDF |
| `agency_core` | ChatGPT + Gemini + Perplexity | 15 | Bi-weekly | Email + Slack |
| `agency_pro` | ChatGPT + Gemini + Perplexity | Custom | Weekly | Email + Slack + client portal view |

Prompt count, cadence, and delivery surface are entitlement-controlled from admin. No hardcoding in product logic.

---

## Metrics Definition

### New metrics added on top of existing v1 contract (`citation-and-metrics-v1.md`)

**`visibility_pct` per platform**
- % of completed query runs for a given platform where client was cited at least once
- Computed separately for each provider: `chatgpt_visibility_pct`, `gemini_visibility_pct`, `perplexity_visibility_pct`
- Aggregate `visibility_pct` = average across platforms with completed runs

**`industry_rank`**
- Average rank position (`rankPosition`) across all completed query runs where client was cited
- Only queries with a non-null rank position contribute
- Lower is better (rank 1 = first mention in response)
- Stored in `benchmark_domain_metrics.metrics JSONB` initially

**`avg_rank_per_prompt`**
- Per `benchmark_query`: average rank position across all platforms and all run windows where client appeared
- Surfaces in the prompts table of the client report

### `rankPosition` hardening
- Already defined in `ParsedCitationV1` but inconsistently populated
- Must be extracted reliably from: numbered lists, "1. X, 2. Y" patterns, ordered bullet lists, explicit "first" / "second" / "third" language
- If order is genuinely ambiguous, keep `null` — do not guess

### Competitor co-citation
- For each `query_run`, extract ALL brand/domain mentions in the response, not only the measured client domain
- Store competitor citations in `query_citations` with a `is_competitor: true` flag or a separate `run_competitor_citations` table (decided at GPM-006 design time)
- Competitor roster comes from the client's `client_benchmark_configs.competitor_list`

---

## Report Structure (mirrors Stability Lab reference)

1. **Summary paragraph** — Claude-generated narrative: brand, topic, location, period, headline visibility number, top win, top opportunity
2. **AI Search Visibility card** — aggregate visibility %, per-platform breakdown (ChatGPT / Gemini / Perplexity), industry rank, analyzed responses count
3. **Brands Visibility by Topic** — ranked competitor bar chart for the client's topic(s)
4. **Top Prompts table** — prompt / avg rank / ChatGPT rank / Gemini rank / Perplexity rank / visibility %
5. **Opportunities section** — prompts where client ranked low or did not appear

---

## Client Configuration Shape

Each client workspace that subscribes to GEO Performance Monitoring needs:

```
client_benchmark_configs
  workspace_id          → FK to startup_workspace or agency_account
  benchmark_domain_id   → FK to benchmark_domains (client's own domain)
  topic                 → e.g. "Vestibular Rehabilitation"
  location              → e.g. "Vancouver"
  query_set_id          → FK to benchmark_query_sets (generated from topic + location)
  competitor_list       → string[] of competitor brand names / domains
  cadence               → "monthly" | "biweekly" | "weekly"
  platforms_enabled     → string[] e.g. ["chatgpt", "gemini", "perplexity"]
  report_email          → delivery address (defaults to workspace owner)
  created_at / updated_at
```

---

## Sequencing

Build in strict layer order. Do not start Layer 2 until Layer 1 data is verified on real responses.

```
Layer 1 (provider adapters + metric hardening)
  → Layer 2 (client config schema + admin onboarding)
  → Layer 3 (scheduled client runs + entitlement gating)
  → Layer 4 (report PDF + delivery)
  → Layer 5 (admin control UI + manual trigger)
```

---

## Non-Goals for v1

- Client self-serve prompt builder (admin configures prompts, not the client)
- Client-facing portal for live report data (agency_pro portal is Phase 2)
- Sentiment-weighted share of voice
- Cross-client anonymized benchmarking / percentile ranking (deferred — methodology not frozen)
- Historical trend charts in report (single-period first)
- Perplexity citation-source deep linking (Perplexity cites URLs explicitly; surfacing those is Phase 2)
- White-label report branding per agency client (Phase 2)

---

## Task Registry

See `agents/memory/PROJECT_STATE.md` → **GEO Performance Monitoring (GPM-001 … GPM-022)**
