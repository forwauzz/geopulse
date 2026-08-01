export type ContentScheduleChannel = 'linkedin' | 'instagram';
export type ContentScheduleCampaignRole = 'primary' | 'challenger';

export type ContentScheduleItem = {
  readonly assetId: string;
  readonly channel: ContentScheduleChannel;
  readonly campaignId: string;
  readonly campaignRole: ContentScheduleCampaignRole;
  readonly contentId: string | null;
  readonly scheduledFor: string;
  readonly title: string;
  readonly body: string;
  readonly ctaUrl: string;
  readonly mediaUrl: string | null;
  readonly mediaAlt: string | null;
  readonly successCondition: string;
  readonly stopCondition: string;
};

export const CONTENT_SCHEDULE_POLICY = {
  timezone: 'America/Toronto',
  linkedinPostsPerWeek: 3,
  linkedinDays: ['Monday', 'Wednesday', 'Friday'],
  linkedinLocalTime: '09:00',
  inventoryDays: 14,
  primaryAllocationPercent: 80,
  challengerAllocationPercent: 20,
  linkedinPublishingRoute: 'manual_browser_fallback',
  instagramPublishingRoute: 'connected_distribution_pipeline',
} as const;

const MSP_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000801';
const AGENCY_CAMPAIGN_ID = '00000000-0000-4000-8000-000000000802';
const MSP_ARTICLE = 'https://getgeopulse.com/blog/seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi';
const AGENCY_ARTICLE = 'https://getgeopulse.com/blog/ai-visibility-reporting-for-agencies';
const MSP_HERO = 'https://getgeopulse.com/images/blog/ai-search-readiness-audit.png';
const DENOMINATOR_MEME = 'https://getgeopulse.com/branding/social/agency-reporting-denominator-meme-2026-08.jpg';

export const CONTENT_SCHEDULE: readonly ContentScheduleItem[] = [
  {
    assetId: 'linkedin-msp-evidence-not-adjectives-2026-08-03',
    channel: 'linkedin',
    campaignId: MSP_CAMPAIGN_ID,
    campaignRole: 'primary',
    contentId: 'seo-agent:seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi',
    scheduledFor: '2026-08-03T13:00:00.000Z',
    title: 'Your MSP website needs evidence, not adjectives',
    body: `Most MSP websites say they are proactive, secure, and responsive.\n\nThose words are easy to publish and hard for a buyer—or an AI answer engine—to verify.\n\nA stronger service page names the buyer problem, the evidence that supports the claim, and the next step a prospect can take.\n\nWe turned that into a practical checklist for MSP websites:\n${MSP_ARTICLE}\n\n#MSPMarketing #AISearch #GEO`,
    ctaUrl: MSP_ARTICLE,
    mediaUrl: MSP_HERO,
    mediaAlt: 'AI search readiness audit for MSP websites',
    successCondition: 'Generate at least one qualified MSP site visit or scan start attributable to LinkedIn within 14 days.',
    stopCondition: 'Revise the hook or format after six LinkedIn posts if there are no qualified visits, scan starts, replies, or saves.',
  },
  {
    assetId: 'linkedin-msp-one-question-one-proof-2026-08-05',
    channel: 'linkedin',
    campaignId: MSP_CAMPAIGN_ID,
    campaignRole: 'primary',
    contentId: 'seo-agent:seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi',
    scheduledFor: '2026-08-05T13:00:00.000Z',
    title: 'Map one buyer question to one public proof',
    body: `A useful AI-visibility exercise for an MSP:\n\n1. Write down one question a qualified buyer asks.\n2. Find the page that answers it.\n3. Point to the public proof supporting the answer.\n\nIf step three is difficult, the problem is not the AI platform. The evidence is missing or buried.\n\nStart with one service and one buyer question. That is enough to expose the gap.\n\nOur full evidence checklist:\n${MSP_ARTICLE}\n\n#ManagedServices #ContentStrategy #AISearch`,
    ctaUrl: MSP_ARTICLE,
    mediaUrl: null,
    mediaAlt: null,
    successCondition: 'Generate at least one qualified MSP site visit or scan start attributable to LinkedIn within 14 days.',
    stopCondition: 'Revise the hook or format after six LinkedIn posts if there are no qualified visits, scan starts, replies, or saves.',
  },
  {
    assetId: 'linkedin-agency-keep-denominator-2026-08-07',
    channel: 'linkedin',
    campaignId: AGENCY_CAMPAIGN_ID,
    campaignRole: 'challenger',
    contentId: 'agency-reporting-launch-2026-08-01',
    scheduledFor: '2026-08-07T13:00:00.000Z',
    title: 'The score improved. What changed?',
    body: `Client: “Great—the AI visibility score went up.”\n\nAgency: “Yes. And here is exactly what was measured.”\n\nA report should help the agency explain progress without hiding the denominator. Show the prompts, platforms, wins, gaps, and next actions.\n\nThat is how a reporting tool makes an agency look good: the work is clear and defensible.\n\n${AGENCY_ARTICLE}\n\n#AgencyReporting #AIVisibility #GEO`,
    ctaUrl: AGENCY_ARTICLE,
    mediaUrl: DENOMINATOR_MEME,
    mediaAlt: 'Office workers celebrating before noticing the report denominator',
    successCondition: 'Generate at least one qualified agency profile visit, article visit, reply, or scan start within 14 days.',
    stopCondition: 'Keep the agency challenger at 20 percent unless it produces stronger qualified action than the MSP primary campaign.',
  },
  {
    assetId: 'linkedin-msp-schema-needs-facts-2026-08-10',
    channel: 'linkedin',
    campaignId: MSP_CAMPAIGN_ID,
    campaignRole: 'primary',
    contentId: 'seo-agent:seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi',
    scheduledFor: '2026-08-10T13:00:00.000Z',
    title: 'Structured data cannot replace missing service facts',
    body: `Schema can help a machine interpret facts that already exist. It cannot create evidence your page never states.\n\nBefore adding another markup block, check whether the page clearly answers:\n\n• Who is this service for?\n• What problem does it solve?\n• What proof supports the claim?\n• Where is the service available?\n• What should the buyer do next?\n\nGood structure amplifies clear evidence. It does not substitute for it.\n\n${MSP_ARTICLE}\n\n#TechnicalSEO #MSPMarketing #GenerativeEngineOptimization`,
    ctaUrl: MSP_ARTICLE,
    mediaUrl: null,
    mediaAlt: null,
    successCondition: 'Generate at least one qualified MSP site visit or scan start attributable to LinkedIn within 14 days.',
    stopCondition: 'Revise the hook or format after six LinkedIn posts if there are no qualified visits, scan starts, replies, or saves.',
  },
  {
    assetId: 'linkedin-msp-crawlable-vs-extractable-2026-08-12',
    channel: 'linkedin',
    campaignId: MSP_CAMPAIGN_ID,
    campaignRole: 'primary',
    contentId: 'seo-agent:seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi',
    scheduledFor: '2026-08-12T13:00:00.000Z',
    title: 'Crawlable is not the same as extractable',
    body: `A page can be technically crawlable and still make its most important answer difficult to extract.\n\nCommon causes:\n\n• the service area is implied, not stated\n• proof lives in an image with no supporting text\n• every service shares the same generic paragraph\n• the useful answer is buried below several screens of copy\n\nThe test is simple: can a buyer quote the answer and point to the evidence?\n\nIf not, an answer engine may struggle too.\n\n${MSP_ARTICLE}\n\n#AISearch #MSP #WebsiteStrategy`,
    ctaUrl: MSP_ARTICLE,
    mediaUrl: null,
    mediaAlt: null,
    successCondition: 'Generate at least one qualified MSP site visit or scan start attributable to LinkedIn within 14 days.',
    stopCondition: 'Revise the hook or format after six LinkedIn posts if there are no qualified visits, scan starts, replies, or saves.',
  },
  {
    assetId: 'linkedin-msp-audit-one-service-page-2026-08-14',
    channel: 'linkedin',
    campaignId: MSP_CAMPAIGN_ID,
    campaignRole: 'primary',
    contentId: 'seo-agent:seo-what-evidence-should-an-msp-website-provide-for-ai-assisted-buyer-questi',
    scheduledFor: '2026-08-14T13:00:00.000Z',
    title: 'Audit one service page against one buyer question',
    body: `You do not need a 50-page content project to find an AI-search gap.\n\nPick one commercially important service page and one real buyer question. Then check whether the answer is explicit, supported, current, and easy to quote.\n\nThat small audit gives you a concrete improvement backlog instead of a vague “do more GEO” task.\n\nGEO-Pulse can run the first scan and surface the evidence gaps:\nhttps://getgeopulse.com/\n\n#ManagedServices #AIVisibility #GEO`,
    ctaUrl: 'https://getgeopulse.com/',
    mediaUrl: null,
    mediaAlt: null,
    successCondition: 'Generate at least one qualified MSP scan start attributable to LinkedIn within 14 days.',
    stopCondition: 'Revise the CTA after six LinkedIn posts if there are no qualified visits, scan starts, replies, or saves.',
  },
  {
    assetId: 'instagram-agency-keep-denominator-2026-08-06',
    channel: 'instagram',
    campaignId: AGENCY_CAMPAIGN_ID,
    campaignRole: 'challenger',
    contentId: 'agency-reporting-launch-2026-08-01',
    scheduledFor: '2026-08-06T17:00:00.000Z',
    title: 'Keep the denominator visible',
    body: `A visibility score is only useful when the denominator stays visible.\n\nShow what improved. Show what did not. Show what happens next.\n\nThat is a client report an agency can stand behind.\n\nRun a free scan through the link in bio.\n\n#AgencyReporting #AIVisibility #GenerativeEngineOptimization #GEO`,
    ctaUrl: AGENCY_ARTICLE,
    mediaUrl: DENOMINATOR_MEME,
    mediaAlt: 'Office workers celebrating before noticing the report denominator',
    successCondition: 'Produce at least one qualified profile visit, link tap, save, share, reply, or scan start within 14 days.',
    stopCondition: 'Stop this visual format after three uses if it produces no qualified action; do not optimize for views alone.',
  },
] as const;

export function validateContentSchedule(items: readonly ContentScheduleItem[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.assetId)) errors.push(`Duplicate asset id: ${item.assetId}`);
    ids.add(item.assetId);
    if (!Number.isFinite(Date.parse(item.scheduledFor))) errors.push(`Invalid schedule date: ${item.assetId}`);
    if (!item.body.trim()) errors.push(`Missing post body: ${item.assetId}`);
    if (!item.successCondition.trim() || !item.stopCondition.trim()) errors.push(`Missing experiment gate: ${item.assetId}`);
    if (item.channel === 'instagram' && !item.mediaUrl) errors.push(`Instagram asset requires media: ${item.assetId}`);
  }

  const linkedin = items.filter((item) => item.channel === 'linkedin');
  if (linkedin.length !== 6) errors.push(`Expected six LinkedIn posts for two-week coverage; found ${linkedin.length}`);
  const primary = linkedin.filter((item) => item.campaignRole === 'primary').length;
  const challenger = linkedin.filter((item) => item.campaignRole === 'challenger').length;
  if (primary !== 5 || challenger !== 1) errors.push(`Expected LinkedIn allocation 5 primary / 1 challenger; found ${primary} / ${challenger}`);
  return errors;
}
