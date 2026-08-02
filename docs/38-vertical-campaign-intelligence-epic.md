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

## VCI-8: Centralized email campaign control room

### Approved product decision

GEO-Pulse will use Brevo's familiar campaign-building mental model without creating a second
contact database, sender, scheduler, suppression system, or analytics ledger. Brevo is a UX
reference only unless a later founder decision explicitly approves it as an external provider.

The existing system remains authoritative:

| Campaign concern | Existing source of truth |
| --- | --- |
| Business campaign, vertical, offer, success and stop conditions | `growth_campaigns` |
| Channel experiment and one meaningful variable | `growth_campaign_interventions` |
| Saved people and companies | `outreach_contacts` |
| Send eligibility and bounded follow-up lifecycle | `outreach_prospects` |
| Subject and body | `outreach_templates` |
| Delivery attempts and provider evidence | `outreach_sends` |
| Reply classification and automatic stops | `outreach_reply_events` and prospect lifecycle |
| Cross-channel schedule | existing growth calendar |
| Funnel and recurring-revenue truth | existing attribution, checkout, and subscription ledgers |

Extend these contracts rather than adding parallel campaign services. Introduce a new table only
when the existing model cannot preserve immutable campaign/audience history safely. In particular,
a small enrollment ledger is justified if one contact must participate in more than one campaign
over time; do not encode that history by repeatedly overwriting `outreach_contacts.prospect_id`.

### Customer outcome

An operator can safely import a contact inventory, understand which contacts are eligible, compose
and preview a complete email campaign, deliver an internal test, schedule a bounded audience, and
see campaign results in the same control room and calendar. Routine operation must not require the
founder.

### Familiar information architecture

Expose four simple destinations in the existing admin console:

1. **Campaigns** — campaign list and the create/edit flow.
2. **Contacts** — the existing contact bank, imports, segments, quarantine, and suppression.
3. **Templates** — reusable email content and rendered examples.
4. **Calendar** — the existing cross-channel calendar, extended rather than duplicated.

A campaign detail page follows one vertical sequence:

`Goal -> Sender -> Audience -> Subject/preview -> Content -> Preview/test -> Schedule -> Results`

Each section has one visible state: complete, needs attention, or unavailable. The page keeps the
primary actions familiar and small: `Save draft`, `Preview & test`, and `Schedule`. Do not expose
database terminology, agent controls, or a general automation builder in this customer-facing
flow.

### Canonical lifecycle

The detailed email preparation state is a typed, versioned contract associated with the email
intervention:

`draft -> audience_ready -> content_ready -> qa_ready -> test_passed -> scheduled -> running -> evaluating -> completed|stopped`

The coarser existing intervention status remains authoritative for company-wide campaign
intelligence. Store the preparation state in a validated versioned payload until production query
needs prove that a separate table is warranted. After scheduling, the campaign version is
immutable; a meaningful edit creates a new intervention/version so historical sends retain the
exact sender, audience, subject, body, timing, and rules used.

### Contact ingestion and eligibility

Contact ingestion is the first implementation slice, not a final launch step. Importing a contact
must never enroll or email it.

For the founder's agency bundle:

- `1-VERIFIED-published-327.csv` enters a dry-run quality review and then the contact bank. The word
  "published" proves public-source provenance, not mailbox deliverability; do not silently label
  these addresses technically verified.
- `2-CONSTRUCTED-unverified-443.csv` remains quarantined and ineligible for sending until a lawful,
  evidence-backed verification policy passes it.
- `3-remaining-names-and-rejections.csv` and files under `superseded/` remain rejection,
  suppression, or provenance evidence and cannot become sendable through import.

The importer must be idempotent, normalize email and company domain, reject malformed or sensitive
records, preserve public source evidence, and report exact counts for inserted, merged, duplicate,
quarantined, suppressed, and rejected rows. A dry run performs no database writes. An apply run
writes only reviewed contact-bank state.

At minimum, eligibility is explicit and fail-closed:

- `eligible` — may be selected for a campaign after every preflight check;
- `needs_verification` — saved but never selectable for sending;
- `suppressed` — unsubscribe, terminal reply, existing customer, legal/policy suppression, or
  operator suppression;
- `rejected` — invalid, sensitive, low-confidence, or outside the approved ICP/geography;
- `enrolled` — included in one immutable audience snapshot;
- `converted` — excluded from acquisition follow-up.

Prefer deriving terminal states from the existing prospect/reply/subscription ledgers. Add only the
smallest contact eligibility fields or enrollment ledger needed to make the result queryable,
auditable, and reversible.

Initial saved segments are:

- `agency-ca-qc-montreal-published-2026-08`;
- `agency-ca-qc-other-published-2026-08`;
- `agency-unverified-quarantine`.

The UI must show total contacts, eligible recipients, exclusions by reason, and the exact frozen
recipient count before scheduling. Segment membership changing later must not silently change a
scheduled campaign.

### Versioned email campaign contract

Define and validate one `email_campaign_v1` contract rather than spreading loosely typed metadata
through components. It contains only the data needed to reproduce and govern a campaign:

- campaign and intervention IDs/version;
- sender display name, authenticated from-address reference, and reply-to reference;
- segment/query reference plus frozen audience snapshot/checksum;
- template ID/version, subject, preview text, rendered HTML/text, and required merge fields;
- campaign tags and UTM source, medium, campaign, content, and term values;
- local timezone, send window, start time, spacing/cap, maximum sequence steps, and delays;
- success condition, stop condition, owner, retry policy, and closure condition;
- preflight results, internal test evidence, scheduled/locked timestamp, and stop reason.

Do not store credentials, complete reply bodies, or arbitrary customer data in the contract.
Provider message IDs belong in the existing send ledger.

### Preview, test, and preflight gate

The preview surface supports desktop and mobile presentation and "preview as contact" using a
selected contact. It shows the sender, reply-to, subject, preview line, rendered content, links,
footer, unsubscribe path, and unresolved merge fields. It must reuse the production renderer; a
separate mock renderer can create false confidence.

`Schedule` remains disabled until a server-side preflight proves all of the following:

- authenticated GEO-Pulse sender and valid reply-to;
- nonempty frozen audience and exact recipient count within configured caps;
- every recipient is eligible and none is unsubscribed, suppressed, converted, disqualified, or
  already in a conflicting active sequence;
- every required merge variable resolves for every recipient;
- subject, preview text, HTML/text body, links, UTM parameters, footer, and unsubscribe path are
  valid;
- one internal test was accepted by the provider for the exact locked version;
- campaign owner, one meaningful variable, success condition, stop condition, retries, and due
  times are present;
- schedule uses the campaign timezone and approved business-hours/cadence rules;
- expected volume and spend remain within existing provider caps.

The internal test can target only a configured test-recipient allowlist. A test never enrolls a
prospect, advances a sequence, or contributes to campaign/revenue metrics. All actions are
idempotent. Any stale version, audience change, failed provider check, missing suppression check,
or unresolved value invalidates the test and fails scheduling closed.

### Sending and commercial lifecycle

Use the existing outreach sender, scheduler, send ledger, reply ingestion, and unsubscribe route.
Do not send from both Brevo and GEO-Pulse or split tracking between them. Preserve the current
bounded three-step default (`day 0`, `day 4`, `day 10`) only when all three approved templates are
present. Stop later steps immediately after reply, unsubscribe, disqualification, conversion,
customer status, exhausted retry policy, campaign stop, or provider safety incident.

Retries must never create duplicate sends. A schedule or send operation uses an idempotency key
derived from campaign version, enrollment, and sequence step. Provider acceptance is not treated as
human engagement.

### Results and calendar

Campaign results show denominators and stage age for:

`eligible -> enrolled -> queued -> sent -> provider accepted/delivered -> opened -> clicked -> replied -> positive reply -> walkthrough -> trial/baseline -> checkout -> active recurring subscription`

Opened and clicked are leading indicators only and must retain their measurement limitations. A
real active recurring subscription from a non-Jack/Lifter customer remains the revenue result.
Unknown or unavailable denominators render as unavailable, never zero.

The existing growth calendar gains email cards with platform icon, owner avatar, simple status
color/icon, scheduled time, recipient count, and a click-through preview of the exact locked text
and creative. It must distinguish draft, test, scheduled, live/sending, complete, paused, and
stopped without requiring the founder to interpret internal status codes.

### First production experiment

Do not blast the entire imported inventory. The first candidate is a bounded agency challenger
intervention:

- key: `agency-reporting-montreal-v1`;
- audience: the 25 strongest eligible Montreal agency owners/decision-makers;
- offer: an accurate white-labelled AI visibility baseline/report an agency can confidently share
  with a client;
- CTA: reply with one client domain or request a short walkthrough;
- meaningful variable: agency-reporting offer/message only;
- maximum sequence: three approved messages at days 0, 4, and 10;
- success: at least one qualified reply or booked walkthrough;
- stop: 25 provider-accepted first messages with zero qualified replies, or any deliverability,
  sender, consent, privacy, cap, or data-quality failure;
- automatic exits: reply, unsubscribe, disqualification, conversion, or customer status.

This pilot must not activate until the current agency challenger allocation/WIP contract permits it.
The existing stopped MSP experiment must not be altered or given more volume as a side effect.

### Sender and founder boundary

Current Brevo inspection found only Teche Health Services and ALIE sender identities. Production
GEO-Pulse outreach must not use those identities. Authentication of a GEO-Pulse sending identity
and its DNS/domain configuration is the one expected founder or credential-holder setup boundary.
Claude may build and locally verify the full flow with a disabled/unavailable sender state, but must
not invent an address, change DNS, add a provider, or send externally without the existing authority
and verified configuration.

### Explicit non-goals

- Rebuilding all of Brevo, adding a workflow canvas, or supporting arbitrary marketing automation.
- Replacing the existing provider, scheduler, templates, suppression, reply, calendar, attribution,
  or subscription systems.
- Uploading contacts to Brevo or another third party.
- Treating public-source, constructed, guessed, role-based, or free-mail addresses as verified.
- Sending to all 327 contacts, enabling the 443 quarantined contacts, or bypassing sending caps.
- Building a generic CRM, contact enrichment service, inbox, or lead-scoring platform.
- Counting Jack/Lifter, test mail, opens, clicks, verbal interest, or a one-off purchase as recurring
  revenue.

### Claude acting-owner execution sequence

The founder has authorized Claude to act as integration owner for this bounded VCI-8 stream until
the implementation issues are locally complete and handed off for QA, or until a founder-only
boundary above is reached. Claude must read `AGENTS.md`, this section, the current implementation,
and the co-founder issue template before acting. Claude creates the following dependency-ordered
GitHub issues and keeps only one primary implementation issue in progress at a time.

#### ECP-1 — Contact intake, quality, and frozen audience

Build the CSV dry run/apply flow, explicit quarantine and exclusion behavior, segmentation, exact
counts, and a safe campaign audience snapshot/enrollment contract. Reuse `outreach_contacts` and
terminal suppression evidence. Add a migration only if needed for durable eligibility or repeat
campaign history.

Acceptance:

- the three source classes above cannot cross eligibility boundaries;
- dry run is side-effect free and reports deterministic counts/reasons;
- repeated apply does not create duplicates or erase stronger existing evidence;
- import never creates/enables a prospect or sends mail;
- suppressed/unsubscribed/converted contacts remain ineligible;
- a frozen 25-contact cohort cannot drift when its source segment later changes;
- fixtures cover duplicates, malformed rows, constructed addresses, prior unsubscribes, prior
  customers, conflicting active prospects, and geography/ICP rejection.

#### ECP-2 — Campaign composer and versioned contract

Add the Campaigns list/detail flow and the goal, sender, audience, subject/preview, content,
preview/test, schedule, and results sections. Implement `email_campaign_v1` with server-side
validation and immutable versioning. Reuse the existing admin shell, campaign/intervention records,
contact bank, template renderer, and growth calendar design language.

Acceptance:

- one page communicates what will be sent, by whom, to whom, when, why, and what stops it;
- each section shows complete, needs attention, or unavailable;
- desktop/mobile and selected-contact previews use the production renderer;
- unresolved personalization and unauthenticated sender states are unmistakable and fail closed;
- scheduled versions cannot be mutated in place;
- no duplicate campaign, template, contact, or analytics source of truth is introduced.

#### ECP-3 — Internal test and scheduling preflight

Connect the exact locked campaign version to internal test delivery and the existing scheduler.
Implement the complete preflight contract, idempotent enrollment/sending, invalidation rules, caps,
and lifecycle stops. Until a GEO-Pulse sender is authenticated, demonstrate the fail-closed state
without external delivery.

Acceptance:

- tests can go only to the configured internal allowlist and are excluded from metrics;
- a provider-accepted test is attached to the exact version/checksum;
- any content, sender, or audience change invalidates the test;
- scheduling is impossible with any failed or stale gate;
- retry cannot duplicate an enrollment or sequence-step send;
- replies, unsubscribes, conversions, disqualifications, campaign stops, and exhausted retries stop
  future sends;
- an authorized schedule produces the exact expected rows and calendar entry without sending early.

#### ECP-4 — Results, calendar, and operator closure

Complete the campaign dashboard and calendar integration, denominator-safe funnel, stage age,
ownership, next action, retry policy, and evidence-based scale/revise/stop state.

Acceptance:

- the dashboard reconciles against contact, prospect, send, reply, attribution, checkout, and
  subscription ledgers;
- missing data is unavailable rather than zero;
- test/internal/Jack/Lifter activity is excluded from recurring revenue;
- calendar cards distinguish preparation, scheduled, sending, and terminal states and open the
  locked preview;
- a stopped campaign creates no further sends;
- an operator can identify the owner, next action, due time, and closure condition without reading
  raw ledgers.

#### ECP-5 — Local acceptance and held pilot package

Import the supplied bundle through the reviewed dry-run path, create the saved segments, prepare the
25-contact Montreal pilot, render every message as representative contacts, and collect one local
acceptance packet. Keep external sending held.

Acceptance:

- source file hashes, dry-run counts, apply counts, exclusions, and segment counts reconcile;
- no constructed/unverified, rejected, superseded, suppressed, unsubscribed, converted, or
  conflicting contact appears in the pilot;
- the exact audience, sender state, copy, links, UTM values, cadence, cap, success condition, stop
  condition, and expected spend are visible;
- focused tests, all affected tests, `npm run type-check`, `npm run build`, and applicable browser
  smoke pass locally;
- no production data, external email, DNS, campaign activation, or provider configuration changes
  occur during local acceptance;
- Claude leaves the final issue comment using the repository handoff template with branch/PR,
  evidence, remaining sender boundary, and one next action for QA.

### QA, merge, deployment, and launch

The QA owner is whichever co-founder has capacity after Claude finishes implementation. Prefer
Codex as the independent reviewer because Claude is the implementer. If Codex is unavailable,
Claude starts a distinct QA/closure pass after implementation, re-reads the issue, plan, full diff,
fixtures, and evidence as acting owner, and records the separation in the issue. Claude must not
deploy before that QA pass. The first external campaign remains held until an independent human or
co-founder reviews the rendered campaign and exact recipient cohort. Lack of a second reviewer must
not block safe local implementation or merge/deploy of disabled, fail-closed functionality after
the distinct QA pass.

The closer must review the full diff and migration, rerun focused and affected tests, type-check,
production build, and browser smoke, then open/finish the PR, require passing CI/security/Cloudflare
checks, merge, deploy, and verify production. CI should be checked at natural handoff points rather
than continuously polled. The first external send is a separate launch action after production
preflight, authenticated sender evidence, test delivery, and exact cohort approval.

### VCI-8 completion

VCI-8 implementation is complete when the centralized flow is deployed and production-smoked, all
contacts are represented truthfully in the contact bank or quarantine/suppression evidence, and the
25-contact pilot is ready behind a passing preflight with no external send performed accidentally.
The commercial experiment completes only after the bounded pilot is launched under the active WIP
contract and reaches an evidence-based scale, revise, or stop decision.
