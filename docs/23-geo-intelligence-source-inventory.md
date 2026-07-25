# GEO Intelligence Source Inventory

Status: implementation contract for `INT-001` / GitHub issue `#212`.

## Purpose

This document maps the operational sources that feed GEO-Pulse measurement,
evidence, evaluation, recommendations, implementation, and delivery. It is the
boundary for later intelligence-plane indexing. It does not authorize cleanup,
deduplication, or historical status repair.

The machine-readable source is:

- `lib/intelligence/source-registry.ts`

Read-only operator commands:

```bash
npm run intelligence:inventory -- --catalog
npm run intelligence:inventory -- --json
npm run intelligence:inventory
```

`--catalog` works offline. The other modes require the existing Supabase service
role environment and read counts plus the earliest/latest first-class timestamp.

## Authority model

| Authority | Meaning |
| --- | --- |
| Raw fact | Direct execution, observation, lifecycle, or provider result |
| Derived fact | Deterministic computation or parser output from raw facts |
| Generated narrative | Model/template output that must retain evidence lineage |
| Configuration | The protocol, schedule, model, cohort, or entitlement controlling a run |
| Operational log | Diagnostic evidence that may be lossy and is not a business fact |

Numerical truth must come from compatible raw/derived facts. Reports, summaries,
and model narratives are never the sole numerical authority.

## Primary flows

### Audit and report

`scans -> scan_runs -> scan_pages -> reports -> R2 markdown/PDF`

The parent scan mixes multiple `run_source` values. A paid deep audit adds a
`scan_runs` row and page facts under `scan_pages`. The current product uses these
records for results, reports, score history, fix generation, and deliveries.

Known lineage gaps:

- old rows may lack check-catalog or effective-model versions;
- global score benchmarking counts completed scan rows rather than canonical
  unique-domain snapshots;
- deep page evidence does not yet share stable evidence IDs with citations or
  recommendations.

### Benchmark and citation

`benchmark_domains + query_sets + queries -> run_groups -> query_runs -> query_citations -> domain_metrics`

Scheduled runs carry window and schedule metadata in run-group JSON. Citations
are parser-derived facts tied to raw query responses. Cohorts provide explicit
membership but do not yet freeze every compatibility dimension.

Known lineage/quality gaps:

- stale `running` run groups and provider failures exist;
- parser and metric-definition versions are not consistently first-class;
- partial windows can still produce stored metrics;
- zero, unavailable, provider failure, and incomplete coverage require explicit
  quality states;
- broad and narrow vertical frames must never be blended automatically.

### Evaluation

`report_eval_runs`

`retrieval_eval_runs -> prompts + passages + answers`

These are offline/admin quality instruments. They do not currently update scan
weights, parsers, prompts, or model policies automatically. Some eval records
use text domain identity instead of canonical foreign keys.

### Recommendation and implementation

`scan/report -> startup_recommendations -> status_events -> implementation_plan/tasks -> audit_execution -> PR_run/events`

This is the closest current representation of intervention history. A merged PR
or manually validated recommendation is an implementation fact, not proof that
an AI-visibility outcome improved. Later work must join it to compatible before
and after measurements.

### Recurring and monitoring

`recurring_audit_schedules / monitoring_subscriptions -> Worker cron -> scans`

Schedules are product configuration; generated scans are measurement facts.
Advancing a schedule is not evidence that every downstream cron stage completed.
Issue `#104` owns the existing cron-tail starvation fix.

### Worker cron

The hourly scheduled handler dispatches several self-gated product workflows.
Structured Worker logs are operational evidence, while each child workflow's
database records remain its business source of truth.

Known risks:

- one long stage can starve later stages;
- some logging is best-effort and may be absent;
- deployment/runtime version is not recorded uniformly on child records;
- scheduled work spans databases, provider APIs, R2, queues, and email without
  one shared run envelope.

### Queues, retries, and DLQs

The scan/report queue carries paid and entitled deep-audit jobs through crawl,
continuation, report generation, and delivery. Exhausted messages enter
`geo-pulse-dlq`; a KV replay key permits one guarded replay to the primary queue.
Queue messages are transient operational records, while `payments`, `scans`,
`scan_runs`, `scan_pages`, and `reports` retain the durable business state.

The distribution queue and `geo-pulse-distribution-dlq` carry scheduled content
jobs. Durable status and attempts remain in `distribution_jobs` and
`distribution_job_attempts`. Those content-marketing records are adjacent to,
but outside, the measurement/evidence learning boundary of this epic.

## Identity fields

Current join fields include:

- canonical-domain text in benchmark tables;
- `domain` and `url` text in scans;
- `normalized_url` and `canonical_url` in deep pages;
- workspace, agency-account, agency-client, and user foreign keys;
- scan/report links on recommendations;
- query-run links on citations.

These are inputs to `INT-002`; they are not yet one canonical identity system.

## Source-to-canonical mapping proposal

| Source identity | Proposed canonical mapping |
| --- | --- |
| `scans.domain`, `scans.url` | Domain property plus observed page URL |
| benchmark `canonical_domain`, `site_url` | Domain property; preserve benchmark row as a source alias |
| `scan_pages.normalized_url`, `canonical_url` | Page property under the mapped domain |
| citation `cited_domain`, `cited_url` | Cited domain property and optional cited page property |
| eval `domain`, `site_url` | Domain/page alias with unresolved state when either is absent |
| recurring/monitoring URL or domain | Schedule target alias; generated scans receive independent observation lineage |
| workspace/account/client IDs | Tenant ownership links, not domain identity |
| scan/run/report/query IDs | Source record pointers retained on canonical run/evidence indexes |

Normalization must be deterministic and versioned. Collisions, redirects,
shared-host platforms, subdomain boundaries, and missing fields remain explicit
review states; the backfill must not force them into a convenient identity.

## Version inventory

Existing version boundaries include:

- query-set `version`;
- model IDs and provider response metadata;
- run-group schedule version/window/run mode;
- scan `checkCatalogVersion` inside results JSON;
- deep-run integer version and config;
- report eval framework/rubric/prompt-set metadata;
- retrieval dataset/retriever/generator versions;
- service model policies;
- assorted prompt/parser data embedded in metadata.

Missing version data must remain `unknown`. It must not be inferred solely to
make old runs appear compatible.

## Explicitly unmapped or ambiguous inputs

- Cloudflare Queue and DLQ message counts/date ranges are not available through
  Supabase; only durable database state, structured logs, and KV replay guards
  can be inventoried from this command.
- R2 object metadata cannot currently be enumerated through the application
  service-role client. Database artifact pointers can therefore be checked, but
  storage existence and object dates require a separate runtime-bound operator.
- Raw model responses are stored in `query_runs`, while some provider request
  IDs and model-policy snapshots remain optional metadata.
- Historical prompt templates, citation parser revisions, scan check catalogs,
  and metric definitions are not uniformly first-class version records.
- Old domain text may represent aliases, redirects, or separate properties; it
  remains deliberately unresolved until canonical identity backfill.
- `payments` controls deep-audit entitlement and queue idempotency but is a
  billing record, not measurement evidence. It remains linked through scan and
  queue identifiers rather than copied into the intelligence plane.

## Access and retention

- Customer/workspace records use tenant RLS where available.
- Benchmark and citation data is service-role only while methodology remains
  internal.
- Eval and operational data is platform-admin/service-role scoped.
- R2 artifacts inherit access from their database lineage; a public URL is not
  an authorization model.
- Private customer evidence must never enter cross-tenant retrieval.

No retention deletion policy is introduced by this issue. Later policy must
separate product records, measurement history, generated artifacts, operational
logs, and data subject/tenant deletion obligations.

## Production coverage snapshot

The read-only report on 2026-07-25 found 476 scans, 1,938 benchmark run groups,
11,302 query runs, 5,799 citations, and 7,472 structured log rows. It also found
229 run groups still marked `running` after six hours, 810 failed run groups,
and 5,917 failed query runs. These are recorded as existing populations only;
this issue does not repair or reinterpret them.

Run the inventory command for the current counts, ranges, status distributions,
and null-identity counts. The checked-in values above are a dated observation,
not a fixture or dashboard source.

## Backfill safety contract

All later backfills must:

1. support preview mode;
2. be idempotent and restartable;
3. preserve reversible source pointers;
4. report collisions and unmapped records;
5. write derived identity/quality separately from original source status;
6. avoid deleting, moving, or rewriting historical source evidence.

## Immediate consumers

- `INT-002`: canonical domain/page identity
- `INT-003`: measurement lanes and windows
- `INT-004`: canonical run index
- `INT-005`: evidence catalog
- `INT-006`: derived quality classification and quarantine
