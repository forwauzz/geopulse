/**
 * The `agency-reporting-montreal-v1` pilot (VCI-8 / ECP-5).
 *
 * The bounded agency challenger the plan specifies: 25 Montreal agency decision-makers, one offer,
 * one meaningful variable, three approved messages at days 0 / 4 / 10, declared success and stop
 * conditions. It lives in code rather than in a database seed so the exact copy is reviewable in a
 * diff, testable, and impossible to edit without a version bump.
 *
 * Copy constraints this deliberately respects:
 *
 * - **No scan-derived merge fields.** `{{score}}`, `{{grade}}`, `{{top_issues}}`, `{{report_url}}`
 *   all require a completed scan of the recipient's site. These agencies have not been scanned,
 *   and the offer is about a report for THEIR client — inventing a score for their own site would
 *   be both unresolvable and off-message.
 * - **No claim the audit cannot support.** The offer is an accurate baseline an agency can share,
 *   not a promise of citations, rankings, or results.
 * - **One ask per message**, and the last one gives permission to close the loop.
 */
import type { EmailCampaignGoal, EmailCampaignStepContent, EmailCampaignTracking, EmailCampaignSchedule } from './email-campaign-contract';
import { MONTREAL_PUBLISHED_SEGMENT } from './agency-contact-intake';

export const AGENCY_REPORTING_PILOT_KEY = 'agency-reporting-montreal-v1';
/** Seeded by migration 078 as the active challenger. */
export const AGENCY_CHALLENGER_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000802';
export const AGENCY_REPORTING_PILOT_SEGMENT = MONTREAL_PUBLISHED_SEGMENT;
export const AGENCY_REPORTING_PILOT_RECIPIENTS = 25;

export const AGENCY_REPORTING_PILOT_GOAL: EmailCampaignGoal = {
  objective: 'Learn whether an accurate, white-labelled AI visibility baseline is a reason for a Montreal agency owner to reply.',
  buyer: 'Montreal marketing agency owner or founder',
  offerKey: 'agency_client_visibility_baseline',
  ctaGoal: 'Reply with one client domain, or ask for a short walkthrough',
  owner: 'elena',
  meaningfulVariable: 'The agency-reporting offer and message only. Sender, cadence, cap, and audience source stay as declared.',
  successCondition: 'At least one qualified reply or booked walkthrough from the 25-contact cohort.',
  stopCondition: '25 provider-accepted first messages with zero qualified replies, or any deliverability, sender, consent, privacy, cap, or data-quality failure.',
  closureCondition: 'Reply, unsubscribe, disqualification, conversion, customer status, or completion of the three approved messages.',
  retryPolicy: 'Three delivery attempts per step. An exhausted retry stops that contact and records the reason; it never re-queues the same step.',
};

const STEP_1: EmailCampaignStepContent = {
  subject: 'A white-labelled AI visibility baseline for one of your clients',
  previewText: 'One client domain is enough to see what it looks like.',
  bodyTemplate: `Hi {{name}},

I run GEO-Pulse. We measure what AI answer engines can actually access, understand, and say about a business website, and we produce a baseline report an agency can put its own name on and hand to a client.

It is an evidence report, not a ranking promise. It shows what the public site exposes, what an answer engine can retrieve from it, and which gaps are worth fixing first — with the observed evidence attached to each finding, so nothing in it is a claim you would have to defend on our word.

I am looking for a handful of Montreal agencies to run it against one real client site, because the useful feedback is "this is/isn't something I would send to a client", and I can only get that from people who send client reports for a living.

If you want to see one: reply with a single client domain and I will send the baseline back. If you would rather talk it through first, that works too: {{walkthrough_url}}

Either way, no account and no commitment.`,
};

const STEP_2: EmailCampaignStepContent = {
  subject: 'Re: a white-labelled baseline for one of your clients',
  previewText: 'Still happy to run one, or to hear it is not useful.',
  bodyTemplate: `Hi {{name}},

Following up once on the AI visibility baseline for {{company}} — the white-labelled report you could share with a client.

The offer is unchanged: send one client domain and I will send the baseline back with the evidence behind each finding.

If this is not something you would put in front of a client, that is genuinely useful to know too, and one line telling me so saves us both time.

{{walkthrough_url}}`,
};

const STEP_3: EmailCampaignStepContent = {
  subject: 'Closing the loop on the client baseline',
  previewText: 'Last note — happy to close this out.',
  bodyTemplate: `Hi {{name}},

Last note on this. I do not want to keep writing if the timing or the fit is wrong.

If a white-labelled AI visibility baseline is something you might want for a client later, keep this thread and reply whenever. If not, I will close it out here and you will not hear from me again about it.

Thanks for the time either way.`,
};

export const AGENCY_REPORTING_PILOT_STEPS: readonly EmailCampaignStepContent[] = [STEP_1, STEP_2, STEP_3];

export const AGENCY_REPORTING_PILOT_TRACKING: EmailCampaignTracking = {
  tags: ['vci-8', 'agency-challenger', 'pilot'],
  utmSource: 'outreach',
  utmMedium: 'email',
  utmCampaign: AGENCY_REPORTING_PILOT_KEY,
  utmContent: 'agency-reporting-baseline',
  utmTerm: null,
};

export const AGENCY_REPORTING_PILOT_SCHEDULE: EmailCampaignSchedule = {
  timezone: 'America/Toronto',
  sendWindowStartHour: 9,
  sendWindowEndHour: 17,
  startAt: null,
  // 25 recipients × 15 minutes = 6 hours, so the whole cohort lands inside one 09:00–17:00 window.
  spacingMinutes: 15,
  dailyCap: AGENCY_REPORTING_PILOT_RECIPIENTS,
  maxSequenceSteps: 3,
  sequenceDelaysDays: [0, 4, 10],
};

export const AGENCY_REPORTING_PILOT_CONTENT = {
  templateId: null,
  templateVersion: 1,
  subject: STEP_1.subject,
  previewText: STEP_1.previewText,
  bodyFormat: 'text' as const,
  bodyTemplate: STEP_1.bodyTemplate,
  followUpSteps: [STEP_2, STEP_3],
};
