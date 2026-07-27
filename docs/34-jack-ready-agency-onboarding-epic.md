# Epic: Jack-ready agency onboarding

## Revenue outcome

An agency owner can add a client and, without buying a second monitoring product or assembling
the setup manually, receive a credible first-session baseline that is ready to share with the
client. The same loop then continues on the plan's reporting cadence.

## Guardrails

- Reuse the current monolith, Supabase schema, benchmark engines, report renderer, and cron.
- No Gmail/CRM connector in this epic. Reports use the agency brand and reply-to address.
- Competitor discovery is evidence-backed and editable; it never claims exhaustive internet coverage.
- Paid model work is fail-closed behind a per-client estimate and a monthly portfolio cap.
- The setup loop is idempotent. Retrying completes missing steps without duplicating runs or reports.

## Issues

### JRA-1 — Understand the client

Persist the company, service/category, market, and buyer context used by downstream research.

Acceptance:

- Existing agency client fields seed the context.
- Missing optional details degrade to honest defaults.
- The UI explains what the system understood.

### JRA-2 — Research competitors

Find three to five real direct competitors using grounded search, excluding the client,
directories, aggregators, and mock/example domains.

Acceptance:

- Live discovery is used only when explicitly enabled and the provider is configured.
- Existing confirmed competitors are retained.
- Discovery source, date, evidence status, and failure reason are stored.
- The list remains editable.

### JRA-3 — Generate buyer prompts

Provision ten high-intent, non-branded discovery and comparison questions from the client's
category and market.

Acceptance:

- Questions cover discovery, comparison, trust, cost/value, alternatives, and use-case intent.
- The query set is versioned and linked to the client's scheduled config.
- Re-running is idempotent and respects plan prompt caps.

### JRA-4 — Establish website readiness

Run or reuse a recent first-party website audit and link it to the agency client.

Acceptance:

- A completed scan less than 24 hours old is reused to avoid waste.
- Otherwise a fresh scan is executed and persisted as `agency_dashboard`.
- A blocked site is recorded as not tested, never as a zero score.

### JRA-5 — Measure AI visibility

Run the first measurement across ChatGPT, Gemini, and Perplexity when configured and within budget.

Acceptance:

- Each provider is independently recorded as launched, already complete, unavailable, or failed.
- Successful work is never discarded because another provider failed.
- Scheduled runs continue on the configured cadence.

### JRA-6 — Store intelligence and control spend

Preserve raw responses, mentions, competitor co-citations, URLs, provider/model identity, and
measurement metadata. Estimate spend before each paid lane and record observed token usage.

Acceptance:

- Default activation estimate is below the per-client cap.
- Monthly portfolio cap blocks new paid calls before they launch.
- The client page shows estimated spend, cap, provider coverage, and loop status.
- No provider key silently enables portfolio-wide work.

### JRA-7 — Deliver the branded client scorecard

Create an unguessable, signed-out scorecard link using the agency's saved brand and make it the
primary sharing action.

Acceptance:

- The link opens signed out and can be copied or emailed to multiple recipients.
- Agency plans say monitoring is included; they do not show the separate $39 small-business offer.
- The scorecard includes readiness, visibility, prompts, competitors, citations, and next actions.
- Report generation/delivery history is visible to the agency.

## Definition of done

For Jack's Lifter account: open Stability Labs, complete/retry the baseline, see a fresh readiness
scan, three provider states, researched competitors, ten prompts, spend below the configured cap,
an active recurring cadence, and a Lifter-branded signed-out scorecard. Maya's loop is closed only
when the persisted evidence proves these steps; otherwise it remains actionable without founder
attention unless a credential, billing limit, or business decision is required.
