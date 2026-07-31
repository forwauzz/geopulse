# Daily Department Standup and Accountability

## Purpose

Maya sends one founder report per day after 12:00 UTC. The report is a company
debrief, not an exception-only digest and not a collection of self-written agent
status messages.

It answers:

1. What moved toward recurring revenue?
2. What did every department head complete in the last 24 hours?
3. What is every department head working on next?
4. Which work is overdue, exhausted, blocked, or missing evidence?
5. What genuinely requires founder authority?

## Source of truth

The report reuses the existing control plane:

- `agent_work_loops` for owners, states, attempts, deadlines, blockers, next
  actions, verification, and closure evidence;
- the Revenue Agency snapshot for the 30-day acquisition and conversion funnel;
- `monitoring_subscriptions` and `user_subscriptions` for active recurring revenue;
- workforce profiles and agent status for each department head's remit,
  capability state, last operational event, and default next action.

No reporting service or parallel task database is introduced.

## Department heads

- Maya Brooks: Chief of Staff
- Noah Carter: activation
- Priya Shah: SEO and customer outcomes
- Elena Park: sales development and customer intelligence
- Sofia Chen: buyer and competitor research
- Jordan Reyes: content and social production
- Marcus Reed: engineering reliability
- Codex: technical co-founder, COO, and accountable growth operator

The founder is the recipient, CEO, legal decision maker, and human closer. The
founder is not graded inside the employee standup.

## Accountability contract

Every department has an explicit role rubric. Daily status is calculated from
four shared controls:

1. Timeliness and retry control
2. Evidence-backed closure
3. Next-action clarity
4. Blocker ownership

The report also shows a role-specific outcome, such as replies and meetings for
Elena, reports delivered for Priya, proof published for Jordan, activation for
Noah, and reliability work for Marcus.

Maya does not grade herself. Her checks use company-wide evidence:

1. All open work has an owner, next action, and deadline.
2. Completed work has verification evidence.
3. No work is overdue or retry-exhausted without intervention.
4. Only documented founder decisions are escalated.
5. At least one owned action addresses the current revenue constraint.

The states are:

- `on_track`
- `watch`
- `needs_intervention`
- `no_evidenced_work`

No arbitrary numeric employee score is used. A precise failed check and its
evidence are more actionable than a subjective composite score.

## Email behavior

- One email per UTC day.
- Earliest send is 12:00 UTC. If that hourly run is missed, the next hourly
  Chief of Staff run sends it.
- Deduplication event: `chief_of_staff_daily_standup_sent`.
- Delivery failures use the existing
  `chief_of_staff_campaign_digest_failed` incident path.
- The existing founder-recipient and Resend configuration are reused.

The email includes:

- one operating verdict;
- the current constraint and strongest trustworthy signal;
- a 30-day revenue scoreboard;
- a 24-hour company activity summary;
- every department head's worked-on, working-next, blocker, outcome, and rubric
  results;
- founder decisions only;
- explicit data limitations.

## Revenue integrity

The report never promotes opens, posts, drafts, test payments, or internal
accounts into recurring revenue.

Its strict north-star count reads active rows from `monitoring_subscriptions` and
`user_subscriptions`, requires a Stripe subscription ID, and deduplicates by owner
email. It excludes GEO-Pulse, Teche, Lifter/Jack, example/test identities, and rows
explicitly marked internal, test, or sandbox. Trialing, past-due, incomplete, and
cancelled rows do not count.

The company remains `revenue stalled with corrective action underway` until the
strict recurring-customer ledger has an active real customer.
