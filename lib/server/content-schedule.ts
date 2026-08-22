export type ContentScheduleChannel = 'linkedin' | 'instagram';
export type ContentScheduleCampaignRole = 'primary' | 'challenger';
export type ContentScheduleOwner = 'jordan' | 'sofia';

export type ContentScheduleItem = {
  readonly assetId: string;
  readonly week: number;
  readonly channel: ContentScheduleChannel;
  readonly owner: ContentScheduleOwner;
  readonly campaignId: string;
  readonly campaignRole: ContentScheduleCampaignRole;
  readonly contentId: string;
  readonly scheduledFor: string;
  readonly title: string;
  readonly body: string;
  readonly ctaUrl: string;
  readonly mediaUrl: string | null;
  readonly mediaAlt: string | null;
  readonly claimBoundary: string;
  readonly retryPolicy: string;
  readonly successCondition: string;
  readonly stopCondition: string;
};

export const CONTENT_SCHEDULE_POLICY = {
  timezone: 'America/Toronto',
  evergreenWeeks: 12,
  postsPerWeek: 3,
  linkedinPostsPerWeek: 2,
  instagramPostsPerWeek: 1,
  linkedinDays: ['Monday', 'Friday'],
  instagramDay: 'Wednesday',
  linkedinLocalTime: '09:00',
  instagramLocalTime: '13:00',
  inventoryDays: 84,
  primaryAllocationPercent: 80,
  challengerAllocationPercent: 20,
  linkedinPublishingRoute: 'manual_browser_fallback',
  instagramPublishingRoute: 'connected_distribution_pipeline',
  reactiveLoopScope: ['verified_news', 'replies', 'bounded_experiments', 'measured_replacements'],
  reactiveLoopExcludes: 'Any theme or asset already present in the evergreen schedule.',
} as const;

const MSP_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000801';
const AGENCY_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000802';
const MSP_CTA = 'https://getgeopulse.com/solutions/msps';
const AGENCY_CTA = 'https://getgeopulse.com/solutions/agencies';
const MEDIA_ROOT = 'https://getgeopulse.com/branding/social/amara/campaign-2026-08';
const CLAIM_BOUNDARY = 'Readiness and public evidence only; no ranking, citation, traffic, or revenue guarantee.';
const RETRY_POLICY = 'Reconcile provider state before retrying; retry at most three times and never duplicate a provider-accepted post.';
const SUCCESS_CONDITION = 'At least one qualified MSP or agency action attributable to this 12-week family: profile visit plus link tap, scan start/completion, walkthrough request, reply, or activated baseline.';
const STOP_CONDITION = 'Review after six posts; revise the hook or format if qualified actions are zero. Stop the creative family after twelve posts with zero qualified actions; do not optimize for impressions alone.';

type WeekPlan = {
  readonly slug: string;
  readonly mondayTitle: string;
  readonly mondayBody: string;
  readonly instagramTitle: string;
  readonly instagramBody: string;
  readonly instagramAlt: string;
  readonly fridayRole: ContentScheduleCampaignRole;
  readonly fridayTitle: string;
  readonly fridayBody: string;
};

const WEEKLY_PLAN: readonly WeekPlan[] = [
  {
    slug: 'proof-beside-promise',
    mondayTitle: 'Put the proof beside the MSP promise',
    mondayBody: `“Proactive. Secure. Responsive.”\n\nThose are promises, not evidence. A stronger MSP service page puts the proof beside the claim: what is monitored, what is covered, where the limit sits, and what the buyer can do next.\n\nStart with the commercially important page, not a site-wide rewrite.`,
    instagramTitle: 'Put the proof beside the promise',
    instagramBody: `An MSP claim becomes useful when a buyer can verify it.\n\nName the promise. Show the evidence. State the scope and limit. Make the next step clear.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara in a warm office with the headline Put the proof beside the promise.',
    fridayRole: 'primary',
    fridayTitle: 'A service page should answer four buyer questions',
    fridayBody: `Open one MSP service page and check four things:\n\n1. Who is this for?\n2. What problem is covered?\n3. What public evidence supports the claim?\n4. What should the buyer do next?\n\nIf the page cannot answer those clearly, adding more adjectives will not fix it.`,
  },
  {
    slug: 'response-time-scope',
    mondayTitle: 'A response-time claim needs a clock and a scope',
    mondayBody: `“Fast response” leaves the buyer to guess.\n\nA verifiable claim names the clock, severity, coverage window, measurement source, and exclusions. That is more useful to a prospect—and easier for an AI research tool to represent accurately.`,
    instagramTitle: 'A response-time claim needs a clock',
    instagramBody: `“Fast support” is vague.\n\nState the response target, coverage window, severity definition, and limit. Clear scope is stronger than a bigger adjective.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara seated in an office with the headline A response-time claim needs a clock.',
    fridayRole: 'challenger',
    fridayTitle: 'Agency reporting should start with the buyer question',
    fridayBody: `A client report is easier to trust when it starts with the exact buyer question—not a floating score.\n\nShow the question, the observed answer, the cited source when available, the limitation, and the next fix. That gives the client something they can inspect and act on.`,
  },
  {
    slug: 'security-scope',
    mondayTitle: '“Secure” is not a complete MSP claim',
    mondayBody: `Security claims need boundaries.\n\nName the controls, the service tier, the responsibility split, the standard or process that supports the claim, and what is not included. Without that context, a buyer—or an answer engine—can overread the promise.`,
    instagramTitle: 'Secure is not a complete sentence',
    instagramBody: `A security promise needs scope.\n\nName the control, coverage, responsibility split, evidence, and exclusions. That is what makes the claim usable.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara in a tailored office portrait with the headline Secure is not a complete sentence.',
    fridayRole: 'primary',
    fridayTitle: 'Show the incident process without exposing sensitive detail',
    fridayBody: `An MSP can explain its incident process without publishing confidential runbooks.\n\nState who is notified, how severity is defined, what the escalation path covers, and where the customer’s responsibility begins. Useful evidence can be specific without being unsafe.`,
  },
  {
    slug: 'service-area',
    mondayTitle: 'Do not make the buyer infer your MSP service area',
    mondayBody: `A list of city names in the footer is not always enough.\n\nThe service page should say where support is available, whether delivery is remote or on-site, which time zones are covered, and where limitations apply. Make the commercial boundary explicit.`,
    instagramTitle: 'State where you actually provide support',
    instagramBody: `Service area is part of the offer.\n\nState geography, remote or on-site coverage, time zones, and any limits on the page where the service is sold.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara beside a clean office background with the headline State where you actually provide support.',
    fridayRole: 'challenger',
    fridayTitle: 'Map each client promise to one proof source',
    fridayBody: `A practical agency exercise:\n\nTake the five claims a client repeats most often. For each one, identify the strongest public proof source and the page that should carry it.\n\nIf there is no source, mark it as a gap—not a messaging opportunity.`,
  },
  {
    slug: 'extractable-answer',
    mondayTitle: 'Crawlable does not mean the answer is extractable',
    mondayBody: `A page can load, index, and still bury its useful answer.\n\nPut the service definition, buyer fit, scope, evidence, and next step in clear text with concrete headings. Do not make the reader assemble the offer from sliders, icons, and vague paragraphs.`,
    instagramTitle: 'Put the useful answer before the scroll',
    instagramBody: `If the service answer is buried, the page is harder to use.\n\nDefine the offer early. Add concrete headings. Keep the proof in readable text.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline Put the useful answer before the scroll.',
    fridayRole: 'primary',
    fridayTitle: 'One service page should not describe five different offers',
    fridayBody: `When backup, security, cloud, help desk, and consulting share one generic paragraph, the buyer has to guess what changes between them.\n\nGive each commercially important service its own buyer problem, scope, proof, limit, and next step.`,
  },
  {
    slug: 'evidence-block',
    mondayTitle: 'Build one evidence block a buyer can verify',
    mondayBody: `A useful evidence block is small:\n\n• the claim\n• the observable proof\n• the scope or limitation\n• the source or date\n• the next action\n\nPlace it on the service page instead of hiding it in a sales deck.`,
    instagramTitle: 'Build one evidence block a buyer can verify',
    instagramBody: `Claim. Proof. Scope. Source. Next action.\n\nThat five-part block is more useful than another paragraph of “trusted partner” copy.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara in a modern office with the headline Build one evidence block a buyer can verify.',
    fridayRole: 'challenger',
    fridayTitle: 'An agency handoff should preserve the evidence boundary',
    fridayBody: `The strategist finds the claim. The writer sharpens it. The developer publishes it.\n\nThe evidence boundary can disappear in that handoff. Keep the source, scope, limitation, owner, and recheck date attached to the recommendation all the way through publication.`,
  },
  {
    slug: 'buyer-question-quality',
    mondayTitle: 'A weak buyer question creates a weak AI baseline',
    mondayBody: `“Best IT company” is usually too vague to diagnose anything.\n\nA useful question includes the buyer, service, location or operating constraint, and decision context. Confirm those inputs before measuring who appears and why.`,
    instagramTitle: 'Fix the buyer question before the baseline',
    instagramBody: `Bad prompt in. Weak baseline out.\n\nConfirm the buyer, service, market, constraint, and decision stage before measuring visibility.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline A weak buyer question creates a weak baseline.',
    fridayRole: 'challenger',
    fridayTitle: 'Freeze the question set before reporting a trend',
    fridayBody: `If the questions change every month, the chart is not a clean trend.\n\nFreeze the buyer questions, engines, market context, and denominator for the comparison window. Record any change as a new baseline instead of hiding it in the line.`,
  },
  {
    slug: 'competitor-clarity',
    mondayTitle: 'Ask why the competitor is easier to quote',
    mondayBody: `Competitor visibility is not only a popularity question.\n\nCompare whether the competitor states the service, market, evidence, limitations, and next step more clearly. The useful output is a page-level fix—not a vague instruction to “build authority.”`,
    instagramTitle: 'Why is the competitor easier to quote?',
    instagramBody: `Compare the actual pages.\n\nWho states the service, scope, evidence, limits, and next action more clearly? Turn that difference into one fix.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline Why is the competitor easier to quote?',
    fridayRole: 'challenger',
    fridayTitle: 'Use the same questions for client and competitor comparisons',
    fridayBody: `A competitor chart is only useful when the comparison is compatible.\n\nUse the same buyer questions, engines, location context, and measurement window. If one competitor is unavailable, disclose it; do not score the missing result as zero.`,
  },
  {
    slug: 'schema-and-proof',
    mondayTitle: 'Schema can label the fact. It cannot invent it',
    mondayBody: `Structured data helps a machine interpret information that the business actually publishes.\n\nIt cannot create a missing service area, response commitment, credential, policy, or customer-fit statement. Fix the fact first. Then mark it up.`,
    instagramTitle: 'Schema cannot invent proof',
    instagramBody: `Markup can label a fact. It cannot create one.\n\nPublish the clear service fact and its evidence first. Add structured data second.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline Schema cannot invent proof.',
    fridayRole: 'primary',
    fridayTitle: 'Use structured data to reinforce visible service facts',
    fridayBody: `The strongest structured facts match what the buyer can already read on the page.\n\nKeep business identity, service area, contact details, offers, and relevant credentials consistent between visible copy and machine-readable markup.`,
  },
  {
    slug: 'source-consistency',
    mondayTitle: 'Make the MSP’s public sources agree',
    mondayBody: `The website says 24/7. The directory says business hours. The service page says regional. The footer implies national.\n\nResolve the source conflict before asking an AI system to represent the business accurately. Start with the facts that change a buying decision.`,
    instagramTitle: 'Make the public sources agree',
    instagramBody: `Conflicting public facts create avoidable ambiguity.\n\nAlign hours, service area, offer, contact details, and key claims across the sources buyers check.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline Make the public sources agree.',
    fridayRole: 'challenger',
    fridayTitle: 'Keep a change log for AI-visibility work',
    fridayBody: `A client should be able to see what changed between measurements.\n\nRecord the page, claim, source, implementation date, owner, and the exact question set that will be rerun. That turns reporting into an operating loop instead of a screenshot archive.`,
  },
  {
    slug: 'specific-next-step',
    mondayTitle: 'The next step is part of the MSP evidence',
    mondayBody: `A credible page can still lose the buyer if the next step is vague.\n\nState what happens after the click: assessment, response window, information required, and who the call is for. A specific next action makes the offer easier to evaluate.`,
    instagramTitle: 'Make the next step specific',
    instagramBody: `“Contact us” leaves too much unsaid.\n\nName the next step, expected response, required input, and who it is for.\n\nRun the free MSP audit through the link in bio.`,
    instagramAlt: 'Amara with the headline Make the next step specific.',
    fridayRole: 'primary',
    fridayTitle: 'Audit the path from proof to action',
    fridayBody: `Follow one buyer path end to end:\n\nQuestion → service answer → evidence → limitation → next action.\n\nIf the path breaks, fix the smallest missing step. More traffic will not repair a confusing handoff.`,
  },
  {
    slug: 'fix-and-rerun',
    mondayTitle: 'Fix one blocker, then rerun the same check',
    mondayBody: `A score without a remeasurement plan becomes shelfware.\n\nChoose one observable blocker, record the baseline, make the change, and rerun the same questions and engines. Keep the denominator visible and separate observation from interpretation.`,
    instagramTitle: 'Fix one blocker. Then run the same check again',
    instagramBody: `The real loop is simple:\n\nBaseline. Fix. Same questions. Same scope. Rerun.\n\nThat is how a readiness audit becomes operational. Link in bio.`,
    instagramAlt: 'Amara with the headline Fix one blocker then run the same check again.',
    fridayRole: 'challenger',
    fridayTitle: 'A renewal report should show the operating loop',
    fridayBody: `A strong renewal conversation is not “the score went up.”\n\nShow the frozen scope, observed results, changes shipped, remaining gaps, customer actions, and the next measurement. Be explicit about what the report does not prove.`,
  },
] as const;

const instagramFiles = [
  '01-proof-beside-the-promise-instagram-1080x1350.jpg',
  '02-response-time-needs-a-clock-instagram-1080x1350.jpg',
  '03-secure-is-not-complete-instagram-1080x1350.jpg',
  '04-state-the-service-area-instagram-1080x1350.jpg',
  '05-answer-before-the-scroll-instagram-1080x1350.jpg',
  '06-build-an-evidence-block-instagram-1080x1350.jpg',
  '07-fix-the-buyer-question-instagram-1080x1350.jpg',
  '08-why-the-competitor-is-easier-instagram-1080x1350.jpg',
  '09-schema-cannot-invent-proof-instagram-1080x1350.jpg',
  '10-align-the-public-sources-instagram-1080x1350.jpg',
  '11-make-the-next-step-specific-instagram-1080x1350.jpg',
  '12-fix-then-rerun-instagram-1080x1350.jpg',
] as const;

function utcAt(dayOffset: number, hour: number): string {
  return new Date(Date.UTC(2026, 7, 10 + dayOffset, hour, 0, 0)).toISOString();
}

function attributedUrl(base: string, channel: ContentScheduleChannel, assetId: string): string {
  const url = new URL(base);
  url.searchParams.set('utm_source', channel);
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', 'msp_evergreen_2026_q3');
  url.searchParams.set('utm_content', assetId);
  return url.toString();
}

function linkedinBody(body: string, ctaUrl: string, role: ContentScheduleCampaignRole): string {
  const tags = role === 'primary'
    ? '#ManagedServices #MSPMarketing #AISearch'
    : '#AgencyReporting #AISearch #GEO';
  return `${body}\n\nRun the relevant free audit:\n${ctaUrl}\n\n${tags}`;
}

export const CONTENT_SCHEDULE: readonly ContentScheduleItem[] = WEEKLY_PLAN.flatMap((plan, index) => {
  const week = index + 1;
  const mondayAssetId = `linkedin-msp-${plan.slug}-w${String(week).padStart(2, '0')}`;
  const instagramAssetId = `instagram-msp-${plan.slug}-w${String(week).padStart(2, '0')}`;
  const fridayLane = plan.fridayRole === 'primary' ? 'msp' : 'agency';
  const fridayAssetId = `linkedin-${fridayLane}-${plan.slug}-followup-w${String(week).padStart(2, '0')}`;
  const mondayUrl = attributedUrl(MSP_CTA, 'linkedin', mondayAssetId);
  const instagramUrl = attributedUrl(MSP_CTA, 'instagram', instagramAssetId);
  const fridayBase = plan.fridayRole === 'primary' ? MSP_CTA : AGENCY_CTA;
  const fridayUrl = attributedUrl(fridayBase, 'linkedin', fridayAssetId);
  const common = {
    week,
    claimBoundary: CLAIM_BOUNDARY,
    retryPolicy: RETRY_POLICY,
    successCondition: SUCCESS_CONDITION,
    stopCondition: STOP_CONDITION,
  } as const;

  return [
    {
      ...common,
      assetId: mondayAssetId,
      channel: 'linkedin' as const,
      owner: 'sofia' as const,
      campaignId: MSP_CAMPAIGN_ID,
      campaignRole: 'primary' as const,
      contentId: `msp-evergreen-2026-q3:w${week}:monday`,
      scheduledFor: utcAt(index * 7, 13),
      title: plan.mondayTitle,
      body: linkedinBody(plan.mondayBody, mondayUrl, 'primary'),
      ctaUrl: mondayUrl,
      mediaUrl: null,
      mediaAlt: null,
    },
    {
      ...common,
      assetId: instagramAssetId,
      channel: 'instagram' as const,
      owner: 'jordan' as const,
      campaignId: MSP_CAMPAIGN_ID,
      campaignRole: 'primary' as const,
      contentId: `msp-evergreen-2026-q3:w${week}:instagram`,
      scheduledFor: utcAt(index * 7 + 2, 17),
      title: plan.instagramTitle,
      body: `${plan.instagramBody}\n\n#ManagedServices #MSPMarketing #AISearch #GEO`,
      ctaUrl: instagramUrl,
      mediaUrl: `${MEDIA_ROOT}/${instagramFiles[index]}`,
      mediaAlt: plan.instagramAlt,
    },
    {
      ...common,
      assetId: fridayAssetId,
      channel: 'linkedin' as const,
      owner: 'sofia' as const,
      campaignId: plan.fridayRole === 'primary' ? MSP_CAMPAIGN_ID : AGENCY_CAMPAIGN_ID,
      campaignRole: plan.fridayRole,
      contentId: `${fridayLane}-evergreen-2026-q3:w${week}:friday`,
      scheduledFor: utcAt(index * 7 + 4, 13),
      title: plan.fridayTitle,
      body: linkedinBody(plan.fridayBody, fridayUrl, plan.fridayRole),
      ctaUrl: fridayUrl,
      mediaUrl: null,
      mediaAlt: null,
    },
  ];
});

export function validateContentSchedule(items: readonly ContentScheduleItem[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const scheduleTimes = new Set<string>();
  for (const item of items) {
    if (ids.has(item.assetId)) errors.push(`Duplicate asset id: ${item.assetId}`);
    ids.add(item.assetId);
    if (scheduleTimes.has(item.scheduledFor)) errors.push(`Duplicate schedule time: ${item.scheduledFor}`);
    scheduleTimes.add(item.scheduledFor);
    if (!Number.isFinite(Date.parse(item.scheduledFor))) errors.push(`Invalid schedule date: ${item.assetId}`);
    if (!item.body.trim()) errors.push(`Missing post body: ${item.assetId}`);
    if (!item.owner || !item.retryPolicy.trim()) errors.push(`Missing ownership or retry policy: ${item.assetId}`);
    if (!item.successCondition.trim() || !item.stopCondition.trim()) errors.push(`Missing experiment gate: ${item.assetId}`);
    if (!item.claimBoundary.trim()) errors.push(`Missing claim boundary: ${item.assetId}`);
    if (!item.ctaUrl.includes('utm_campaign=msp_evergreen_2026_q3') || !item.ctaUrl.includes(`utm_content=${item.assetId}`)) {
      errors.push(`Missing attribution lineage: ${item.assetId}`);
    }
    if (item.channel === 'instagram' && (!item.mediaUrl || !item.mediaAlt)) {
      errors.push(`Instagram asset requires provider-ready media and alt text: ${item.assetId}`);
    }
  }

  const expected = CONTENT_SCHEDULE_POLICY.evergreenWeeks * CONTENT_SCHEDULE_POLICY.postsPerWeek;
  if (items.length !== expected) errors.push(`Expected ${expected} evergreen posts; found ${items.length}`);
  const linkedin = items.filter((item) => item.channel === 'linkedin');
  const instagram = items.filter((item) => item.channel === 'instagram');
  if (linkedin.length !== CONTENT_SCHEDULE_POLICY.evergreenWeeks * CONTENT_SCHEDULE_POLICY.linkedinPostsPerWeek) {
    errors.push(`Expected 24 LinkedIn posts; found ${linkedin.length}`);
  }
  if (instagram.length !== CONTENT_SCHEDULE_POLICY.evergreenWeeks * CONTENT_SCHEDULE_POLICY.instagramPostsPerWeek) {
    errors.push(`Expected 12 Instagram posts; found ${instagram.length}`);
  }
  const primary = items.filter((item) => item.campaignRole === 'primary').length;
  const challenger = items.filter((item) => item.campaignRole === 'challenger').length;
  if (primary !== 29 || challenger !== 7) {
    errors.push(`Expected primary/challenger allocation 29/7; found ${primary}/${challenger}`);
  }
  for (let week = 1; week <= CONTENT_SCHEDULE_POLICY.evergreenWeeks; week += 1) {
    const rows = items.filter((item) => item.week === week);
    if (rows.length !== 3) errors.push(`Week ${week} must contain exactly three posts; found ${rows.length}`);
  }
  return errors;
}
