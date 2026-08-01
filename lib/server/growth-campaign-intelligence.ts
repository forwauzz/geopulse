type Db = { from(table: string): any };

export type CampaignVertical = 'msp_it_services' | 'marketing_agencies' | 'background';
export type GrowthCampaignRole = 'primary' | 'challenger';

export type GrowthCampaign = {
  readonly id: string;
  readonly campaign_key: string;
  readonly role: GrowthCampaignRole;
  readonly status: 'active';
  readonly vertical: Exclude<CampaignVertical, 'background'>;
  readonly subvertical: string | null;
  readonly geo_region: string | null;
  readonly buyer_role: string;
  readonly primary_problem: string;
  readonly offer_key: string;
  readonly cta_goal: string;
  readonly allocation_percent: number;
  readonly success_condition: string;
  readonly stop_condition: string;
};

export type CampaignClassifiableOpportunity = {
  readonly id: string;
  readonly title?: string | null;
  readonly evidence?: string | null;
  readonly recommendation?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly seo_keywords?: {
    readonly keyword?: string | null;
    readonly metadata?: Readonly<Record<string, unknown>> | null;
  } | null;
  readonly growth_campaign_id?: string | null;
};

export type CampaignScopedOpportunity<T extends CampaignClassifiableOpportunity> = {
  readonly opportunity: T;
  readonly campaign: GrowthCampaign;
  readonly vertical: Exclude<CampaignVertical, 'background'>;
  readonly gateReason: 'explicit_campaign_id' | 'explicit_vertical_metadata' | 'explicit_vertical_language';
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function explicitVertical(value: unknown): CampaignVertical | null {
  const normalized = text(value).replaceAll('-', '_').replaceAll(' ', '_');
  if (['msp', 'msps', 'msp_it_services', 'managed_service_providers'].includes(normalized)) {
    return 'msp_it_services';
  }
  if (['agency', 'agencies', 'marketing_agencies', 'small_marketing_agencies'].includes(normalized)) {
    return 'marketing_agencies';
  }
  if (['background', 'general', 'both'].includes(normalized)) return 'background';
  return null;
}

export function classifyCampaignVertical(
  opportunity: CampaignClassifiableOpportunity,
): {
  vertical: CampaignVertical;
  reason: 'explicit_vertical_metadata' | 'explicit_vertical_language' | 'background';
} {
  const metadata = record(opportunity.metadata);
  const keywordMetadata = record(opportunity.seo_keywords?.metadata);
  for (const candidate of [
    metadata['campaign_vertical'],
    metadata['vertical'],
    keywordMetadata['campaign_vertical'],
    keywordMetadata['vertical'],
  ]) {
    const vertical = explicitVertical(candidate);
    if (vertical) {
      return {
        vertical,
        reason: vertical === 'background' ? 'background' : 'explicit_vertical_metadata',
      };
    }
  }

  const haystack = [
    opportunity.title,
    opportunity.evidence,
    opportunity.recommendation,
    opportunity.seo_keywords?.keyword,
  ].map(text).join(' ');
  if (/\bmsps?\b|managed service providers?|managed it services?/.test(haystack)) {
    return { vertical: 'msp_it_services', reason: 'explicit_vertical_language' };
  }
  if (/\bagenc(?:y|ies)\b|white[ -]?label|client reporting/.test(haystack)) {
    return { vertical: 'marketing_agencies', reason: 'explicit_vertical_language' };
  }
  return { vertical: 'background', reason: 'background' };
}

export async function loadActiveGrowthCampaigns(db: Db): Promise<GrowthCampaign[]> {
  const { data, error } = await db
    .from('growth_campaigns')
    .select(
      'id,campaign_key,role,status,vertical,subvertical,geo_region,buyer_role,primary_problem,offer_key,cta_goal,allocation_percent,success_condition,stop_condition',
    )
    .eq('status', 'active');
  if (error) return [];
  return ((data ?? []).filter((row: Record<string, unknown>) =>
      (row['role'] === 'primary' || row['role'] === 'challenger')
      && (row['vertical'] === 'msp_it_services' || row['vertical'] === 'marketing_agencies')
    ) as GrowthCampaign[])
    .sort((left, right) => right.allocation_percent - left.allocation_percent);
}

export async function resolveGrowthCampaignForOpportunity(
  db: Db,
  opportunity: CampaignClassifiableOpportunity,
): Promise<CampaignScopedOpportunity<CampaignClassifiableOpportunity> | null> {
  const campaigns = await loadActiveGrowthCampaigns(db);
  return selectCampaignScopedOpportunities([opportunity], campaigns, 1)[0] ?? null;
}

function selectedCampaign<T extends CampaignClassifiableOpportunity>(
  opportunity: T,
  campaigns: readonly GrowthCampaign[],
): CampaignScopedOpportunity<T> | null {
  if (opportunity.growth_campaign_id) {
    const campaign = campaigns.find((item) => item.id === opportunity.growth_campaign_id);
    if (campaign) {
      return {
        opportunity,
        campaign,
        vertical: campaign.vertical,
        gateReason: 'explicit_campaign_id',
      };
    }
  }
  const classification = classifyCampaignVertical(opportunity);
  if (
    classification.vertical === 'background'
    || classification.reason === 'background'
  ) return null;
  const campaign = campaigns.find((item) => item.vertical === classification.vertical);
  if (!campaign) return null;
  return {
    opportunity,
    campaign,
    vertical: classification.vertical,
    gateReason: classification.reason,
  };
}

export function selectCampaignScopedOpportunities<T extends CampaignClassifiableOpportunity>(
  opportunities: readonly T[],
  campaigns: readonly GrowthCampaign[],
  limit: number,
): CampaignScopedOpportunity<T>[] {
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return [];
  const classified = opportunities
    .map((opportunity) => selectedCampaign(opportunity, campaigns))
    .filter((item): item is CampaignScopedOpportunity<T> => Boolean(item));
  const primary = classified.filter((item) => item.campaign.role === 'primary');
  const challenger = classified.filter((item) => item.campaign.role === 'challenger');
  const challengerAllocation = campaigns
    .filter((campaign) => campaign.role === 'challenger')
    .reduce((total, campaign) => total + campaign.allocation_percent, 0);
  const proportionalChallengerCap = Math.floor(
    boundedLimit * Math.min(challengerAllocation, 100) / 100,
  );
  const challengerCap = Math.min(
    challenger.length,
    boundedLimit >= 2 && challengerAllocation > 0
      ? Math.max(1, proportionalChallengerCap)
      : proportionalChallengerCap,
  );
  const primaryTarget = boundedLimit - challengerCap;
  return [
    ...primary.slice(0, primaryTarget),
    ...challenger.slice(0, challengerCap),
  ].slice(0, boundedLimit);
}

export function campaignBriefSections(
  scoped: Pick<CampaignScopedOpportunity<CampaignClassifiableOpportunity>, 'campaign' | 'gateReason'>,
): string[] {
  return [
    '## Active campaign',
    `${scoped.campaign.campaign_key} (${scoped.campaign.role})`,
    '## Buyer and market',
    [
      scoped.campaign.buyer_role,
      scoped.campaign.vertical,
      scoped.campaign.subvertical,
      scoped.campaign.geo_region,
    ].filter(Boolean).join(' | '),
    '## Buyer problem',
    scoped.campaign.primary_problem,
    '## Offer and CTA',
    `${scoped.campaign.offer_key} -> ${scoped.campaign.cta_goal}`,
    '## Campaign gate',
    scoped.gateReason,
    '## Success condition',
    scoped.campaign.success_condition,
    '## Stop condition',
    scoped.campaign.stop_condition,
  ];
}
