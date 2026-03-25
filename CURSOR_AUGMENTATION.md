# Cursor Augmentation Brief — GEO-Pulse (Phase 2, Growth-First)

**Purpose:** Give Cursor durable context so it makes relevant decisions for the **current implementation phase**.

**Date:** 2026-03-24

---

## 1) Product Direction (Important)

GEO-Pulse is currently in **Phase 2 (Payment + PDF + Email)**.

Primary objective **right now**:
- get to reliable paid fulfillment for early users,
- improve activation/conversion,
- and collect real usage/revenue signals.

Secondary objective:
- keep the product in a state that could be acquired later **if that becomes the best option**.

**Do not optimize for selling at the expense of growth.** If usage goes viral and growth economics are strong, continuing to operate may be better than selling.

---

## 2) Blunt Current State

- Free scan MVP is implemented (URL scan, scoring, top issues, results, lead capture).
- Paid deep-audit path exists in code, but buyer-grade reliability proof and ops evidence are still limited.
- Documentation and implementation can drift; Cursor must explicitly flag mismatches.

---

## 3) Phase-2 Relevance Rule (Critical)

Cursor must prioritize **Phase 2-relevant work** and avoid pushing premature future-phase implementation.

### In scope now (Phase 2)
1. Stripe checkout stability
2. Webhook correctness + idempotency
3. Queue processing reliability + DLQ handling
4. PDF generation quality and deterministic behavior
5. Email delivery reliability
6. Basic conversion instrumentation for free -> lead -> paid
7. Documentation sync to current truth

### Out of scope unless explicitly requested
- Full Phase 3 auth/dashboard build
- Full Phase 4 launch checklist execution
- Large API platform expansions beyond what unblocks Phase 2 monetization

When suggesting improvements, Cursor should tag each as:
- **NOW (Phase 2)**
- **LATER (Phase 3/4)**
- **OPTIONAL (only if traction requires it)**

---

## 4) Decision Lens for Suggestions

For every meaningful suggestion, Cursor should answer:
1. Does this help us get more real users or revenue in the next 2–6 weeks?
2. Does this reduce a concrete failure risk in current paid flow?
3. Is this Phase-2 scope creep?
4. Is this preserving optionality (grow vs sell) instead of forcing a sale narrative?

---

## 5) Truth Source Hierarchy

Use this priority when context conflicts:
1. Runtime code + migrations (actual behavior)
2. Tests / command outputs
3. Project docs (`agents/memory/*`) only if aligned with code

If docs conflict with code:
- call it out,
- treat code as operational truth,
- propose a docs-sync patch.

---

## 6) Immediate Gaps to Close (Phase 2-focused)

### A) Monetization reliability (NOW)
- Ensure checkout -> webhook -> queue -> PDF -> email path is provably reliable.
- Add/expand smoke tests around failure modes and retries.

### B) Early growth evidence (NOW)
- Track and report:
  - scan starts,
  - scan completions,
  - lead submissions,
  - checkout attempts,
  - successful paid completions.
- Produce simple weekly funnel snapshots.

### C) Diligence hygiene (NOW)
- Keep `PROJECT_STATE.md`, security docs, and implementation status synchronized.
- Eliminate contradictory “pending vs implemented” messaging.

### D) Later optimization (LATER)
- Deep Phase 3 account/dashboard polish.
- Launch-scale infra hardening not needed for current traffic.

---

## 7) Guardrails for Code Generation

### Security / abuse
- Keep strict SSRF validation for user-submitted URLs.
- Keep server-side Turnstile validation where applicable.
- Keep Stripe webhook signature verification + idempotent event handling.
- Never expose service-role keys client-side.

### Product integrity
- Do not claim ranking guarantees.
- Phrase output as readiness signals + actionable fixes.

### Reliability
- Prefer small testable changes.
- Add tests/checks for non-trivial behavior changes.
- Avoid hidden coupling and undocumented side effects.

---

## 8) What Cursor Should Output for Medium/Large Changes

1. **Scope label:** NOW / LATER / OPTIONAL
2. **Why now:** user/revenue or reliability impact in current phase
3. **Risk impact:** what failure/abuse path is reduced
4. **Evidence added:** tests, logs, metrics, docs updates
5. **Optionality note:** how this keeps both paths open (scale vs sell)

---

## 9) Practical Definition of Success for This Phase

We are successful in Phase 2 when:
- paid fulfillment path is stable and observable,
- real users are flowing through the funnel,
- conversion data is visible week-over-week,
- docs reflect reality,
- and we retain strategic optionality:
  - keep growing if traction is strong,
  - or pursue acquisition later if it is truly optimal.

---

## 10) Prompt Template for Cursor

> Work in GEO-Pulse with a Phase-2, growth-first lens. Prioritize improvements that increase real user throughput, free-to-paid conversion confidence, and paid-flow reliability. Avoid proposing Phase 3/4 implementation unless explicitly requested. Label suggestions as NOW/LATER/OPTIONAL and preserve strategic optionality (continue scaling vs future acquisition).
