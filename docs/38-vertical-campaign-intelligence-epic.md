# Epic: Vertical Campaign Intelligence for the First Recurring Customer

## Revenue outcome

Win GEO-Pulse's first active recurring subscription from a real customer who is not Jack/Lifter,
then preserve enough campaign and intervention evidence to decide whether the acquisition path is
repeatable.

Raw intelligence remains market-neutral. Campaign decisions are scoped to one primary MSP lane
and one agency challenger lane so broad research cannot create disconnected execution work.

## Operating contract

`source evidence -> quality gate -> campaign brief -> bounded intervention -> attributed outcome -> governed learning`

The existing monolith, intelligence catalog, SEO opportunity bank, content machine, distribution
engine, outreach system, attribution events, agent work loops, and control room remain authoritative.
This epic adds one campaign identity and one intervention identity across those systems. It does not
create another agent, database, scheduler, or marketing service.

## Guardrails

- Index broadly, reason narrowly.
- MSPs receive 80 percent of campaign-facing capacity; agencies receive 20 percent until production
  evidence justifies a change.
- Quebec MSP evidence remains distinguishable from general MSP evidence.
- Cross-vertical evidence may propose a hypothesis but cannot automatically establish a winner.
- Only compatible, quality-eligible evidence can influence a scale, revise, or stop decision.
- Impressions, opens, and engagement are leading indicators. Only a real active recurring
  subscription counts as recurring revenue.
- Preserve consent, unsubscribe, suppression, send caps, spend caps, privacy boundaries, claim
  review, and provider approval contracts.
- Change one meaningful variable per intervention and declare success and stop conditions first.

## Workstreams

### VCI-1: Canonical campaign and intervention contract

Create a small service-role-only campaign ledger with a primary/challenger role, vertical frame,
buyer, problem, offer, CTA, allocation, success condition, and stop condition. Create a linked
intervention ledger for channel, hypothesis, meaningful variable, lifecycle, and evidence.

Acceptance:

- Exactly one primary campaign can be active at a time.
- At most one challenger can be active at a time.
- MSP and agency campaigns are seeded with stable keys.
- SEO opportunities, content, outreach prospects, distribution assets, and marketing events can
  retain campaign and intervention lineage.
- Existing records continue to work when lineage is absent.

### VCI-2: Priya relevance gate and bounded WIP

Classify research and SEO opportunities as MSP, agency, or background evidence before execution.
Use the active campaign ledger to select work with an 80/20 primary/challenger allocation.

Acceptance:

- Untagged or background opportunities stay indexed but do not create content families.
- Every selected opportunity records its campaign, vertical, buyer, offer, evidence, and gate
  reason.
- New content uses the campaign buyer instead of the generic small-business-and-agency persona.
- Existing accepted learning may reorder work only inside the same compatible campaign frame.
- The current WIP cap continues to apply after campaign allocation.

### VCI-3: One evidence card, channel-native campaign bundle

Turn one accepted insight into one canonical campaign bundle rather than independent channel plans.

Acceptance:

- The bundle has one source-backed evidence card and one campaign/intervention ID.
- The canonical article or landing page is the durable conversion surface.
- LinkedIn, Instagram, and email derivatives use channel-native creative but retain the same claim,
  CTA, and attribution lineage.
- LinkedIn publishing remains behind its existing Page authorization and never uses the founder's
  personal profile.
- A channel that is unavailable remains pending without blocking the other channels.

### VCI-4: Commercial intervention and funnel mart

Extend the existing intelligence marts to join campaign interventions to compatible outcomes.

Acceptance:

- The funnel reports qualified traffic, scan/lead, onboarding, baseline, activation, checkout, and
  active recurring subscription.
- Outreach reports queued, sent, delivered, opened, replied, positive reply, walkthrough, trial,
  paid conversion, unsubscribe, disqualification, and cancellation.
- Time stuck at each stage and source/campaign/creative attribution remain visible.
- Missing denominators return `not_available`, never zero.
- Results remain observational unless the intervention has valid holdout lineage.

### VCI-5: Governed commercial learning

Allow campaign outcomes to propose cautious, lane-specific patterns through the existing governed
learning lifecycle.

Acceptance:

- Only quality-eligible, compatible MSP evidence can influence MSP prioritization.
- Agency or broad evidence can create an MSP hypothesis but cannot become an accepted MSP pattern.
- A pattern records sample size, effect size, evidence IDs, run IDs, limitations, success threshold,
  and stop threshold.
- No scoring, prompt, recommendation, or public claim changes without the existing review and
  promotion gates.

### VCI-6: One control room and accountable operating cadence

Make the campaign understandable without reading separate agent ledgers.

Acceptance:

- One view shows the active primary campaign, challenger, allocation, evidence card, interventions,
  WIP, funnel, spend, owner, next action, and closure condition.
- Priya owns evidence synthesis, Sofia owns social pattern inputs, Elena owns sales feedback and
  follow-up, Jordan owns channel production, Maya owns evidence closure, and Marcus owns runtime
  health.
- The chief-of-staff pass makes one evidence-backed scale, revise, or stop recommendation.
- Routine no-op checks do not notify the founder.

### VCI-7: Backfill, reconciliation, and production proof

Classify existing opportunities and reconcile the oversized disconnected work queue without
deleting source evidence.

Acceptance:

- Existing SEO opportunities receive an explicit MSP, agency, or background classification.
- Noncampaign loops are deferred with a durable reason; they are not deleted.
- The production scheduler, intelligence quality gate, outreach, publishing, checkout, and
  subscription reconciliation remain healthy.
- Fresh production evidence shows the campaign gate selecting bounded MSP/agency work.

## Definition of done

This epic closes only when a non-Jack/Lifter customer has an active recurring subscription and the
winning path retains:

- a campaign ID and intervention ID;
- qualified source evidence;
- the buyer, vertical, offer, message, channel, and conversion path;
- compatible leading and revenue outcomes;
- an explicit decision to scale, revise, or stop;
- a repeat experiment that tests whether the path is reproducible.

Healthy infrastructure, content volume, scans, opens, one-off audits, free users, test payments,
and verbal interest do not satisfy the revenue outcome.
