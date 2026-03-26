# Deep Audit Upgrade Plan (Executive Summary)

> **Registry:** Task IDs **DA-001…DA-005** in [`agents/memory/PROJECT_STATE.md`](../agents/memory/PROJECT_STATE.md). This file is the narrative companion for the shipped deep-audit upgrade scope. If older planning notes disagree, trust `PROJECT_STATE.md`, `COMPLETION_LOG.md`, and the implemented code paths first.

Deep Audit Upgrade Plan (Executive Summary)
We will eliminate the truth gap by making paid deep audits run a true multi-page scan (new ScanRun records with per-page ScanPage data) instead of reusing the free scan’s one-page results. We adopt a policy‑driven, capped crawl (robots.txt → sitemap(s) → link graph with section-aware sampling) within Cloudflare Workers limits (30s CPU, 128MB RAM, 10k subreqs). A central fetch gate enforces SSRF safety (allow only http/https, safe ports, block internal IPs, manual redirect mode with DNS+IP validation on each hop) per OWASP guidance. We store discovery state in Supabase (Postgres) with tables ScanRun and ScanPage (each page has status, issues, parent, etc.), using SELECT ... FOR UPDATE SKIP LOCKED to pop frontier URLs without contention.

For orchestration:

Short jobs (≤N pages) use Cloudflare Queues/Workers (fast, low cost).
Longer jobs (hundreds of pages or headless render needed) use Workflows (durable multi-step, auto-retry).
Hybrid: use Cloudflare Browser Rendering /crawl for JS-heavy sites or bulk fetch (it honors robots, crawl-delay, content signals).
Reporting: we generate a unified payload (DeepAuditReportPayload) with site summary, per-page issues, and aggregated scores. PDFs/Markdown are built from this payload; we store the full report in R2 and email a summary plus secure link (Resend limits ~40MB total).

Phases: Phase 0 – Wire “deep” scan trigger and DB schema, small multi-page crawl (e.g. 10 pages).
Phase 1 – Harden SSRF+parsing, add coverage summary, hosted PDF link delivery.
Phase 2 – Scale (chunked crawls or Workflows), refined sampling.
Phase 3 – Optional rendered crawl mode for SPAs.

Each phase has clear acceptance criteria (coverage completeness, resource usage) and observability (pages scanned/skipped, CPU/memory metrics, error rates). All key claims and limits are documented by Cloudflare, OWASP, and industry standards.

Phase 0 (“Fix the Truth Gap”)
Trigger new deep scan run: Modify the paid audit flow to create a distinct ScanRun (mode=deep) upon payment and queue a crawl job.
Schema changes: Add scan_runs and scan_pages tables (see schema example below). ScanRun holds domain, config, summary. ScanPage holds url, status, parent_id, issues_json, etc.. Use a UNIQUE normalized_url key (normalize scheme, host, path; remove fragments) and ON CONFLICT DO NOTHING for dedupe.
Simple multi-page crawl: Implement basic discovery: fetch robots.txt, parse any Sitemap(s) (stream with byte limit), parse homepage HTML links (via HTMLRewriter streaming parser). Populate scan_pages with discovered URLs.
Constraints: Cap total pages (e.g. 10–15 for initial MVP). CPU/memory well under limits via streaming.
Report flow: Build payload with site summary and per-page issues (3 most important issues per page). Generate PDF via build-deep-audit-pdf.ts using this payload. Email user with short exec summary and PDF attachment if small; otherwise attach link only (attachments >10 MB risk bounce).
Acceptance: Running deep audit on a 5-10 page site produces >1 page in report. DB stores multi-page results. Emails include link+summary. Memory <128MB on sitemap. Robots/disallowed pages noted.

Phase 1 (Safety & Coverage)
Central fetch gate: Refactor workers/lib/ssrf.ts so all outbound fetches (pages, robots, sitemaps) go through it. Enforce:
Only http/https, allowed ports (80/443).
DNS-resolution + block private/metadata IP ranges.
fetch(…, {redirect: 'manual'}). On 3xx, read Location, validate, then fetch next hop (limit e.g. 5 hops).
Set a byte limit on read stream (e.g. abort if >5MB) to avoid OOM.
Robots & Sitemap: Fetch once per origin (cache 24h). Honor allow/disallow rules; mark blocked_by_robots if fetch returns 403 or path disallowed. Use Sitemap: in robots or try /sitemap.xml. Parse XML in stream (stop after enough URLs).
Link extraction: Use HTMLRewriter (<a> handler) to append same-origin links to frontier (stop after some count).
Section-aware sampling: Tag ScanPage.section by top-level path prefix. When cap reached, ensure no section omitted: reserve 1 slot per unique prefix before greedy fill.
Acceptance: A site with >cap pages has ~1-page coverage for each major section. Robots-blocked pages are reported skipped. CPU/mem stable with streaming. Duplicate URLs not rescanned.

Phase 2 (Scale & Orchestration)
Chunked crawling: For caps in hundreds, use Cloudflare Queues or Workflows:
Queues: Each message = one URL (pop via Pub/Sub from DB). Ideal for moderate scale (pages ≪ batch size) because Workers queue consumer has 15min wall-time. Supports concurrency control (set maxConcurrency).
Workflows: Define steps (discover sitemaps/seed, parallel fetches, aggregate). Durable state, step retries, and sleeps built-in. Use when we need thousands of pages or human-in-the-loop.
Mix: Use Queues + small Workflows for retries or heavy tasks.
Politeness: Implement per-origin rate-limiting. Possibility: use a Durable Object or Workflow step with a sleep() between requests to same host. Alternatively, process queue messages one host at a time (single consumer) and rely on crawl-delay from robots if present.
LLM checks: Only run costly Gemini/Llama calls on key pages (e.g. homepage or hub pages). Others get offline checks. (Budget reason.)
Monitoring: Log metrics: pages fetched, pages skipped (robots, errors), average CPU, wall-time, queue depth. Set alerts if >X% errors or Worker retries.
Acceptance: Can process 100+ pages without manual intervention. Workflow runs complete within timeouts. Coverage metrics plateau. No Worker OOMs.

Phase 3 (Rendered Crawls)
SPA support: For sites with few HTML links or heavy JS, offer an optional rendered crawl mode:
Trigger Cloudflare Browser Rendering /crawl for, say, top-5 pages or site index. Use render: false for static pages first, true if missing data.
Handle /crawl results by ingesting returned links/content into scan_pages.
This mode likely on higher-tier only (costly).
LLM-powered recommendations: In final report, optionally call an LLM for executive summary or fix suggestions, outside critical path (budget for paid tier).
Plan adjustment: Re-evaluate defaults (caps, concurrency) based on usage and cost.
Acceptance: Demonstrated correct scanning of a Next/React site (e.g. CensusAsst without pre-rendered links) with new links found. Content signals honored (if ai-train=no no data is returned unless search only).

Migration Checklist (Files & Tasks)
app/api/scan/route.ts: When handling deep audit request, insert new scan_runs(deep) row and enqueue deep audit job (either push to Queue or create Supabase task). Modify schema in API response if needed.
workers/scan-engine/run-scan.ts: Refactor to accept a config (cap, mode). Loop now over URL frontier: each fetch through fetchGate, parse signals and sample links via HTMLRewriter, write page issues to ScanPage table (via fetch to Supabase or emit to Workflow). Honor new DB schema (ScanRun ID).
workers/scan-engine/parse-signals.ts: Update to extract anchors and maybe meta robots. Ensure stream parsing (no full .text()).
workers/scan-engine/checks/registry.ts: Adjust to record check results per page in DB. Possibly only run heavy checks on some pages.
workers/lib/ssrf.ts: Expand to full fetch gate: manual redirects, DNS lookup, IP filter, timeouts, etc.
workers/queue/report-queue-consumer.ts: On dequeue, detect deep scan tasks: run run-scan until page_limit reached or no more pending. Then build report payload and either send to Workflow or call PDF builder. Update to use new DeepAuditReportPayload.
workers/report/build-deep-audit-pdf.ts: Build sections: executive summary, score, coverage table, per-page issue tables. Use streaming PDF generation for large lists.
workers/report/resend-delivery.ts: Change to attach only small PDF; include link to R2 for full report. Perhaps zip JSON/MD and attach if size permits.
PLAYBOOK/prd.md: Update to reflect new rubric (site-level summary, appendix, multi-page scoring).

Stress-Test Matrix
Site Archetype	Coverage Challenge	Resource Stress	Notes
Simple marketing (5–10 pages)	Basic links, sitemap full	Low CPU/Memory	Should be fully covered in Phase 0–1
Medium CMS with blog	Page depth, many posts	Moderate (CMS sitemap, dynamic pages)	C1+C2 reach; ensure /blog/* coverage
Large content site (100+)	Deep link graph, fragments	High (many pages, deep BFS)	Use Workflows or /crawl; do not OOM, obey robots
SPA/Next.js site	Thin HTML, heavy JS	Moderate (must fetch rendered content)	Phase 3 rendered mode needed
E-commerce category site	Pagination, filters	High (many parameterized URLs)	Use policy filters; heavy skip logic (e.g. ignore /page/*)

Test failure modes: misidentified robots (test with 5xx robots), long redirect chains (test with multi-hop HTTP→HTTPS), memory blowup (giant pages), duplicate URLs (ensure unique key). Each phase should include these tests.

Orchestration Options Comparison
Option	Cost	Latency	Durability (Retries)	Per-Host Politeness	Complexity	Use Case
Cloudflare Queues	Low (pay per msg)	Medium	At-least-once (batches)	Manual: use concurrency controls or token bucket	Medium (requires idempotency/acks)	Best for moderate (tens) pages; partially batched tasks
Workflows	Higher (compute+storage)	Variable	Durable steps+retries	Built-in (sleep steps)	High (new model)	Large crawls, long-running, multi-step flows
Supabase loop	Low (DB cost)	High (DB+function)	Manual retry (on fail)	DB locking/semaphores	Medium (DB design+pooling)	DIY queue; fine if on existing server infra
Browser /crawl	Paid calls (beta)	Async (job-based)	Managed by Cloudflare; honors robots	Honors crawl-delay, robots, content signals	Low (external API)	When site needs JS rendering or very deep coverage

Monitoring & Metrics
Track: number of pages_discovered, pages_scanned, pages_skipped (by reason); Worker CPU time / memory usage per job; queue backlog length; PDF generation time; LLM calls cost. Alert if error rate >5% or queue length > threshold. Dashboard: per-site coverage %, average issues count. Site-score percentile remains deferred until the benchmark pipeline in `PLAYBOOK/benchmark-percentile-design.md` exists.

Acceptance Criteria
Phase 0: Paid audit yields 2+ pages on a simple 10-page site. Deep scan rows present; free scan unchanged. PDF contains multi-page breakdown.
Phase 1: Scans respect robots (disallowed pages marked). 10MB sitemap parses without OOM. All fetches go through SSRF gate. Errors are logged, coverage summary correct.
Phase 2: 100-page demo site completes without manual restart. Concurrency limits enforced. Coverage ~100% of allowed pages. Workflows handle partial failures.
Phase 3: A React SPA’s key URLs are captured via rendered mode. Content signals (e.g. ai-train=no) honored.

Current repo implementation note (2026-03-26):
- DA-005 is implemented as an optional deep-audit per-page render fallback using Cloudflare Browser Rendering `/content`, not a full Browser Rendering `/crawl` orchestration layer.
- It is disabled by default and only runs when explicit Browser Rendering credentials + `DEEP_AUDIT_BROWSER_RENDER_MODE` are configured.
- The normal fetch gate still validates the target and final URL first; rendered fetch is a post-validation fallback for SPA-like pages.
Example SQL Schema
sql
Copy
CREATE TABLE scan_runs (
  id UUID PRIMARY KEY,
  domain TEXT NOT NULL,
  mode TEXT,           -- 'free' or 'deep'
  config JSONB,        -- {page_limit, depth, etc.}
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  coverage_summary JSONB,
  version INT DEFAULT 1
);

CREATE TABLE scan_pages (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES scan_runs(id),
  url TEXT NOT NULL,
  canonical_url TEXT,
  parent_id UUID REFERENCES scan_pages(id),
  status TEXT,         -- 'pending','fetched','skipped','error'
  discovered_by TEXT,  -- 'robots','sitemap','link'
  http_status INT,
  fetch_ms INT,
  content_type TEXT,
  blocked_by_robots BOOL,
  error_message TEXT,
  issues_json JSONB,
  UNIQUE(run_id, url)
);
Migration: Create above tables; change existing scans to store summary only.

Orchestration Flows (Mermaid)
mermaid
Copy
flowchart TD
  subgraph Worker Queue Flow
    Q[Stripe pay → Cloudflare Queue job (deep_audit)] --> C(Queue consumer)
    C --> F[runFreeScan+multi-page] --> DB[(Supabase)]
    F --> P(build-deep-audit-pdf) --> E(Email/pdf)
    DB --> C
  end
mermaid

Show diagram
Copy
flowchart TD
  subgraph Workflow Flow
    A[Start Job: seed URLs in DB] --> W1{Workflow step 1: Discovery}
    W1 --> W2[Enqueue fetch tasks]
    W2 -->|Workers Fetch| X(Fetch Pages) --> W3[Process results / store issues]
    W3 --> W4{All pages done?}
    W4 -- No --> W2
    W4 -- Yes --> W5[Compile report]
    W5 --> E(Deliver PDF/link)
  end
Each workflow step auto-retries on failure (idempotent design).
