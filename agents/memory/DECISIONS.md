# Architecture Decision Records
> Written by: Architect agent
> Approved by: Orchestrator
> Format: ADR-NNN — immutable once approved. Add new ADRs, never edit old ones.

---

## ADR-001 — Deploy target: @opennextjs/cloudflare

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** Next.js on Cloudflare requires an adapter. Two options exist: the old `@cloudflare/next-on-pages` and the new `@opennextjs/cloudflare`.

**Decision:** Use `@opennextjs/cloudflare` exclusively.

**Consequences:** `@cloudflare/next-on-pages` is deprecated and must never appear in package.json. OpenNext supports Next.js 15 App Router, Server Components, Server Actions, and ISR. `compatibility_date` must be `2025-04-01` or later for `process.env` to populate correctly.

---

## ADR-002 — PDF generation: pdf-lib (not Puppeteer)

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** Deep Audit reports require PDF generation inside a Cloudflare Worker.

**Decision:** Use `pdf-lib` (pure JS, runs in V8 isolate). Do not use Puppeteer, Playwright, or Chrome DevTools Protocol.

**Consequences:** Puppeteer cannot run in V8 isolates. pdf-lib handles programmatic PDF construction within Workers. HTML-to-PDF is not available on the $0 free tier — it requires Cloudflare Browser Rendering on the paid plan. PDF generation will exceed the 10ms free-tier CPU limit; the Workers $5/mo paid plan is required.

---

## ADR-003 — LLM provider: Gemini 2.5 Flash-Lite, config-driven

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** Two audit checks require semantic reasoning: Q&A block detection and extractability scoring. A free-tier LLM API is needed.

**Decision:** Use Gemini 2.5 Flash-Lite (1,000 RPD free). The model name and endpoint must be config variables, not hardcoded, to allow provider swapping without code changes.

**Consequences:** Gemini cut free limits 50–80% in Dec 2025. If limits drop again, swap to Cloudflare Workers AI or paid Gemini by changing one env var. Claude and OpenAI have no comparable free tiers. All Gemini calls must have fallback handling — audit continues with "unable to assess" if the call fails.

---

## ADR-004 — Database access: Supabase RLS, leads = service_role only

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect + Security

**Context:** Supabase exposes all tables via REST API unless RLS is enabled.

**Decision:** RLS enabled on every table before the first row is inserted. The `leads` table has no user-facing RLS policy — it is service_role only.

**Consequences:** The SQL Editor bypasses RLS — test all queries using the anon key client. Missing RLS indexes cause 2–11x slowdown — all RLS policy columns must be indexed. The `service_role` key must never appear in client-side code or Next.js frontend bundles.

---

## ADR-005 — Automation: n8n self-hosted (not Make.com)

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** The content engine and marketing automation require a workflow automation tool.

**Decision:** Self-host n8n on Oracle Cloud Always Free (4 OCPU ARM, 24 GB RAM). Do not use Make.com.

**Consequences:** Make.com's free tier (1,000 ops/month) is 15x too low for the scan pipeline at 100 scans/day. n8n is free forever on Oracle Cloud. Setup requires a one-time Oracle Cloud account and VM configuration.

---

## ADR-006 — Architecture pattern: API-first (GEO-Pulse is an API with a UI on top)

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** GEO-Pulse can generate revenue from two sources: end-user SaaS subscriptions and API access sold to developers/agencies who want to integrate GEO auditing into their own products.

**Decision:** Build GEO-Pulse as an API-first product from day one. All core functionality is exposed via a versioned, authenticated REST API (`/api/v1/`). The Next.js frontend and the paying SaaS users consume the same API. No functionality exists only in the UI.

**Consequences:**
- Every audit operation must be accessible via API key authentication
- The UI is a first-party API consumer — it has no privileged access the API doesn't expose
- This adds API key management, usage tracking, and rate-per-key complexity from the start
- API revenue tier: Free (100 scans/month), Pro ($49/month, 2,000 scans), Enterprise (custom)
- Enables white-label integrations without the agency UI tier

---

## ADR-007 — SOLID: Audit engine uses Open/Closed registry pattern

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** The audit engine runs 15 checks. Adding new checks should not require modifying the scoring engine.

**Decision:** Implement audit checks as a registry of `AuditCheck` objects conforming to a shared interface. The scoring engine iterates the registry — it never knows about specific checks. New checks are added by registering them, not by editing the engine.

```typescript
interface AuditCheck {
  id: string;
  name: string;
  weight: number; // sum of all weights = 100
  category: 'technical' | 'semantic' | 'security' | 'commerce';
  requiresAI: boolean; // if true, calls Gemini
  run(context: AuditContext): Promise<CheckResult>;
}
```

**Consequences:** The scoring engine is closed for modification, open for extension. QA can test each check in isolation. New checks (e.g., UCP v2, llms.txt extensions) are added to the registry file only.

---

## ADR-008 — Dependency Inversion: LLM, email, and PDF are interfaces

**Status:** Accepted
**Date:** 2026-03-23
**Decided by:** Architect

**Context:** The scan Worker depends on Gemini, Resend, and pdf-lib. These are concrete implementations that may change.

**Decision:** Define interfaces for all external service dependencies. Concrete implementations fulfill the interfaces. Workers depend on the interfaces, not the concrete classes.

```typescript
interface LLMProvider {
  analyze(prompt: string, context: string): Promise<LLMResult>;
}

interface EmailProvider {
  send(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<void>;
}

interface PDFGenerator {
  generateReport(data: ReportData): Promise<Uint8Array>;
}
```

**Consequences:** Swapping Gemini → Cloudflare Workers AI requires only a new `LLMProvider` implementation. Testing uses mock implementations. The interfaces are defined in `workers/lib/interfaces/` and are the single source of truth.

---

## ADR-009 — Subscription truth: `user_subscriptions` + coarse `users.plan` (`plan_type`)

**Status:** Accepted
**Date:** 2026-04-08
**Decided by:** Architect (implementation alignment with Orchestrator backlog BILL-010)

**Context:** Self-serve bundles (`startup_lite`, `startup_dev`, `agency_core`, `agency_pro`) and Stripe webhooks coexist with an older `users.plan` column typed as `plan_type` (`free`, `pro`, `agency` from `001_initial_schema.sql`). Handlers and admin tools risk writing divergent values.

**Decision:**

1. **Canonical subscription and paid-tier identity for Stripe-backed customers** is the row in **`user_subscriptions`**: `bundle_key`, `status`, Stripe ids, billing periods, and links to provisioned workspaces. This is the source of truth for “what they pay for” and for entitlement resolution that keys off active subscription + bundle.

2. **`users.plan`** remains a **denormalized** column constrained by Postgres **`plan_type`** (`free` | `pro` | `agency`). Stripe subscription webhooks update it via **`bundleToPlan`** in `lib/server/stripe/subscription-handlers.ts` (e.g. `startup_dev` → `pro`, `agency_core` / `agency_pro` → `agency`). It exists for coarse legacy/analytics-style reads, not for bundle-granular product logic.

3. **Known gap (to close in BILL-011):** `assignUserPlan` currently allows string labels such as `startup_dev` that are **not** members of `plan_type`. Either admin assignment must be narrowed to valid enum values (and comped “bundle” semantics expressed via `user_subscriptions` or a follow-up migration), or **`plan_type`** must be extended in a migration and all writers updated consistently.

**Consequences:** New code that needs “which bundle” should read **`user_subscriptions.bundle_key`** (and status), not assume `users.plan` encodes bundle. Resolvers such as `resolveUserCapabilities` already emphasize subscription rows. Admin comp flows must not leave `users.plan` and `user_subscriptions` in conflicting states once BILL-011 is implemented.
