import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import {
  campaignBriefSections,
  classifyCampaignVertical,
  loadActiveGrowthCampaigns,
  selectCampaignScopedOpportunities,
} from './growth-campaign-intelligence';

type Db = { from(table: string): any };
export type AgentLoopState =
  | 'discovered'
  | 'assigned'
  | 'executing'
  | 'verifying'
  | 'blocked'
  | 'completed'
  | 'dismissed';

type SeoOpportunity = {
  id: string;
  opportunity_key: string;
  kind: string;
  status: string;
  priority: number;
  title: string;
  evidence: string;
  recommendation: string;
  first_seen_at: string;
  growth_campaign_id?: string | null;
  growth_intervention_id?: string | null;
  metadata?: Record<string, unknown> | null;
  seo_keywords?: {
    keyword?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

export type SeoContentFamilyMember = {
  contentId: string;
  slug: string;
  contentType: 'article' | 'social_post';
  status: 'brief' | 'idea';
  title: string;
  owner: 'Jordan';
  goal: string;
  slaHours: number;
};

export function isContentLoopSatisfied(item: {
  content_type?: string | null;
  status?: string | null;
  canonical_url?: string | null;
} | null | undefined): boolean {
  if (item?.content_type === 'article') {
    return item.status === 'published' && Boolean(item.canonical_url);
  }
  if (item?.content_type === 'newsletter' || item?.content_type === 'social_post') {
    return item.status === 'published';
  }
  return false;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

function addHours(iso: string, hours: number): string {
  const value = Date.parse(iso);
  return new Date((Number.isFinite(value) ? value : Date.now()) + hours * 3_600_000).toISOString();
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function shouldReactivateExistingLoop(state: string): boolean {
  return state === 'discovered';
}

export type AcceptedLearningPattern = {
  readonly id: string;
  readonly effectSize: number;
  readonly confidence: number;
  readonly cohortDefinition?: Readonly<Record<string, unknown>>;
};

function matchingLearningPatterns(
  opportunity: SeoOpportunity,
  patterns: readonly AcceptedLearningPattern[],
): AcceptedLearningPattern[] {
  const title = String(opportunity.title ?? '').toLowerCase();
  const opportunityVertical = classifyCampaignVertical(opportunity).vertical;
  return patterns.filter((pattern) => {
    if (pattern.effectSize <= 0) return false;
    const cohort = pattern.cohortDefinition ?? {};
    const campaignVertical = typeof cohort['campaign_vertical'] === 'string'
      ? cohort['campaign_vertical']
      : '';
    if (campaignVertical && campaignVertical !== opportunityVertical) return false;
    const seoKind = typeof cohort['seo_kind'] === 'string' ? cohort['seo_kind'] : '';
    const topic = typeof cohort['topic_cluster'] === 'string'
      ? cohort['topic_cluster'].trim().toLowerCase()
      : '';
    return (seoKind && seoKind === opportunity.kind)
      || (topic.length >= 3 && title.includes(topic));
  });
}

export function prioritizeWithAcceptedLearning(
  opportunities: readonly SeoOpportunity[],
  patterns: readonly AcceptedLearningPattern[],
): SeoOpportunity[] {
  // Learning may reorder work, but it never changes scoring, claims, or customer
  // methodology. Only founder-accepted, positive observational patterns enter.
  return [...opportunities].sort((left, right) => {
    const leftControlled = metadataObject(left.metadata)['loop_controlled'] === true ? 1 : 0;
    const rightControlled = metadataObject(right.metadata)['loop_controlled'] === true ? 1 : 0;
    if (leftControlled !== rightControlled) return leftControlled - rightControlled;
    const score = (opportunity: SeoOpportunity) =>
      matchingLearningPatterns(opportunity, patterns)
        .reduce((sum, pattern) => sum + pattern.effectSize * pattern.confidence, 0);
    const learningDelta = score(right) - score(left);
    if (learningDelta !== 0) return learningDelta;
    return left.priority - right.priority;
  });
}

export function buildSeoContentFamily(args: {
  keyword: string;
  opportunityTitle: string;
  articleSlaHours?: number;
  socialIdeaSlaHours?: number;
}): SeoContentFamilyMember[] {
  const familySlug = `seo-${slugify(args.keyword || args.opportunityTitle)}`;
  return [
    {
      contentId: `seo-agent:${familySlug}`,
      slug: familySlug,
      contentType: 'article',
      status: 'brief',
      title: args.opportunityTitle,
      owner: 'Jordan',
      goal: 'Publish the source-backed canonical website article.',
      slaHours: args.articleSlaHours ?? 24,
    },
    {
      contentId: `seo-agent:${familySlug}:instagram`,
      slug: `${familySlug}-instagram`,
      contentType: 'social_post',
      status: 'idea',
      title: `${args.opportunityTitle} — Instagram`,
      owner: 'Jordan',
      goal: 'Prepare the Instagram carousel or Reel idea for later production.',
      slaHours: args.socialIdeaSlaHours ?? 72,
    },
  ];
}

async function upsertLoop(
  db: Db,
  input: Record<string, unknown>,
): Promise<{
  id: string;
  state: AgentLoopState;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptedAt: string | null;
} | null> {
  const sourceType = String(input['source_type']);
  const sourceKey = String(input['source_key']);
  const { data: existing } = await db
    .from('agent_work_loops')
    .select('id,state,attempt_count,max_attempts,last_attempted_at')
    .eq('source_type', sourceType)
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (existing?.id) {
    const next = {
      ...(shouldReactivateExistingLoop(String(existing.state))
        ? {
            state: input['state'],
            verified_at: null,
            resolved_at: null,
            blocker: null,
            founder_required: false,
          }
        : {}),
      title: input['title'],
      detail: input['detail'],
      next_action: input['next_action'],
      owner: input['owner'],
      severity: input['severity'],
      founder_required: input['founder_required'],
      parent_loop_id: input['parent_loop_id'],
      metadata: input['metadata'],
    };
    await db.from('agent_work_loops').update(next).eq('id', existing.id);
    return {
      id: String(existing.id),
      state: existing.state as AgentLoopState,
      attemptCount: Number(existing.attempt_count ?? 0),
      maxAttempts: Number(existing.max_attempts ?? 3),
      lastAttemptedAt: existing.last_attempted_at ? String(existing.last_attempted_at) : null,
    };
  }

  const { data, error } = await db
    .from('agent_work_loops')
    .insert(input)
    .select('id,state,attempt_count,max_attempts,last_attempted_at')
    .single();
  if (error || !data?.id) return null;
  return {
    id: String(data.id),
    state: data.state as AgentLoopState,
    attemptCount: Number(data.attempt_count ?? 0),
    maxAttempts: Number(data.max_attempts ?? 3),
    lastAttemptedAt: data.last_attempted_at ? String(data.last_attempted_at) : null,
  };
}

// Keep acquisition work coherent: one primary family and at most one challenger.
// Additional evidence stays queued until a live family produces measurement evidence.
export const SEO_FAMILY_WIP_CAP = 2;

export function selectSeoFamilyIdsToDefer(
  parents: readonly {
    id: string;
    state?: string | null;
    due_at?: string | null;
    severity?: string | null;
    metadata?: Record<string, unknown> | null;
  }[],
  children: readonly {
    parent_loop_id?: string | null;
    state?: string | null;
  }[],
  cap = SEO_FAMILY_WIP_CAP,
): string[] {
  const activeChildParents = new Set(
    children
      .filter((child) => ['executing', 'verifying'].includes(String(child.state)))
      .map((child) => String(child.parent_loop_id ?? ''))
      .filter(Boolean),
  );
  const severityRank: Record<string, number> = { urgent: 0, today: 1, normal: 2, watch: 3 };
  const ordered = [...parents].sort((left, right) => {
    const verificationDelta =
      Number(right.state === 'verifying') - Number(left.state === 'verifying');
    if (verificationDelta !== 0) return verificationDelta;
    const childDelta =
      Number(activeChildParents.has(right.id)) - Number(activeChildParents.has(left.id));
    if (childDelta !== 0) return childDelta;
    const isGoverned = (parent: typeof left) => {
      const metadata = metadataObject(parent.metadata);
      return Boolean(metadata['closure_condition'] || metadata['growth_intervention_id']);
    };
    const governanceDelta = Number(isGoverned(right)) - Number(isGoverned(left));
    if (governanceDelta !== 0) return governanceDelta;
    const severityDelta =
      (severityRank[String(left.severity)] ?? 9) - (severityRank[String(right.severity)] ?? 9);
    if (severityDelta !== 0) return severityDelta;
    return Date.parse(String(left.due_at ?? '9999-12-31'))
      - Date.parse(String(right.due_at ?? '9999-12-31'));
  });
  return ordered.slice(Math.max(0, cap)).map((parent) => parent.id);
}

async function enforceSeoFamilyWorkInProgress(db: Db, now = new Date()): Promise<{
  activeFamilies: number;
  deferredFamilies: number;
}> {
  const { data: parents } = await db
    .from('agent_work_loops')
    .select('id,source_key,state,severity,due_at,metadata')
    .eq('source_type', 'seo_opportunity')
    .in('state', ['assigned', 'executing', 'verifying', 'blocked'])
    .order('due_at', { ascending: true })
    .limit(250);
  const parentRows = parents ?? [];
  if (parentRows.length <= SEO_FAMILY_WIP_CAP) {
    return { activeFamilies: parentRows.length, deferredFamilies: 0 };
  }
  const parentIds = parentRows.map((row: any) => String(row.id));
  const { data: children } = await db
    .from('agent_work_loops')
    .select('id,parent_loop_id,state')
    .in('parent_loop_id', parentIds)
    .limit(750);
  const deferredIds = selectSeoFamilyIdsToDefer(parentRows, children ?? []);
  if (deferredIds.length === 0) {
    return { activeFamilies: parentRows.length, deferredFamilies: 0 };
  }
  const deferredParents = parentRows.filter((row: any) => deferredIds.includes(String(row.id)));
  const deferredOpportunityIds = deferredParents.map((row: any) => String(row.source_key));
  await db.from('agent_work_loops').update({
    state: 'discovered',
    due_at: addHours(now.toISOString(), 168),
    blocker: null,
    founder_required: false,
    evidence: {
      verification: 'deferred_to_bounded_wip_queue',
      wip_cap: SEO_FAMILY_WIP_CAP,
    },
    verified_at: null,
    resolved_at: null,
  }).in('id', deferredIds);
  await db.from('agent_work_loops').update({
    state: 'discovered',
    due_at: addHours(now.toISOString(), 168),
    blocker: null,
    founder_required: false,
    evidence: {
      verification: 'parent_family_waiting_for_capacity',
      wip_cap: SEO_FAMILY_WIP_CAP,
    },
    verified_at: null,
    resolved_at: null,
  }).in('parent_loop_id', deferredIds).in('state', ['assigned', 'discovered']);
  for (const opportunityId of deferredOpportunityIds) {
    const { data: opportunity } = await db
      .from('seo_opportunities')
      .select('metadata')
      .eq('id', opportunityId)
      .maybeSingle();
    await db.from('seo_opportunities').update({
      status: 'queued',
      metadata: {
        ...metadataObject(opportunity?.metadata),
        loop_controlled: false,
        deferred_by_wip_cap: true,
      },
    }).eq('id', opportunityId);
  }
  return {
    activeFamilies: parentRows.length - deferredIds.length,
    deferredFamilies: deferredIds.length,
  };
}

export function retryIsDue(input: {
  attemptCount: number;
  lastAttemptedAt: string | null;
  now: Date;
}): boolean {
  if (!input.lastAttemptedAt) return true;
  const attemptedAt = Date.parse(input.lastAttemptedAt);
  if (!Number.isFinite(attemptedAt)) return true;
  const backoffHours = Math.min(24, 2 ** Math.max(0, input.attemptCount - 1));
  return input.now.getTime() - attemptedAt >= backoffHours * 3_600_000;
}

async function ensureContentItem(db: Db, payload: Record<string, unknown>): Promise<{ id: string } | null> {
  const contentId = String(payload['content_id']);
  const { data: existing } = await db
    .from('content_items')
    .select('id')
    .eq('content_id', contentId)
    .maybeSingle();
  if (existing?.id) return { id: String(existing.id) };
  const { data, error } = await db.from('content_items').insert(payload).select('id').single();
  return error || !data?.id ? null : { id: String(data.id) };
}

export async function syncSeoOpportunityLoops(args: {
  db: Db;
  now?: Date;
  limit?: number;
  articleSlaHours?: number;
  socialIdeaSlaHours?: number;
}): Promise<{ opportunities: number; contentItems: number; loops: number }> {
  const now = args.now ?? new Date();
  const { data } = await args.db
    .from('seo_opportunities')
    .select('id,opportunity_key,kind,status,priority,title,evidence,recommendation,first_seen_at,growth_campaign_id,growth_intervention_id,metadata,seo_keywords(keyword,metadata)')
    .in('status', ['queued', 'in_progress'])
    .order('priority', { ascending: true })
    .order('last_seen_at', { ascending: false })
    .limit(100);

  const { data: acceptedPatternRows } = await args.db
    .from('intelligence_learning_patterns')
    .select('id,effect_size,confidence,cohort_definition')
    .eq('status', 'accepted')
    .eq('metric_key', 'intervention_delta')
    .gt('effect_size', 0)
    .order('confidence', { ascending: false })
    .limit(20);
  const acceptedPatterns: AcceptedLearningPattern[] = (acceptedPatternRows ?? []).map((row: any) => ({
    id: String(row.id),
    effectSize: Number(row.effect_size ?? 0),
    confidence: Number(row.confidence ?? 0),
    cohortDefinition: metadataObject(row.cohort_definition),
  }));

  let contentItems = 0;
  let loops = 0;
  const campaigns = await loadActiveGrowthCampaigns(args.db);
  const ordered = prioritizeWithAcceptedLearning(
    [...(data ?? [])] as SeoOpportunity[],
    acceptedPatterns,
  );
  const selected = selectCampaignScopedOpportunities(
    ordered,
    campaigns,
    args.limit ?? 10,
  );
  for (const scoped of selected) {
    const { opportunity, campaign, gateReason } = scoped;
    const metadata = metadataObject(opportunity.metadata);
    const appliedLearningPatternIds = matchingLearningPatterns(opportunity, acceptedPatterns)
      .map((pattern) => pattern.id);
    const intelligence = await retrieveIntelligenceEvidence(args.db, {
      platformInternal: true,
      sourceKinds: ['seo_opportunity'],
      sourceIds: [opportunity.id],
      limit: 10,
    }).catch(() => ({
      status: 'insufficient_evidence' as const,
      evidence: [] as const,
      limitations: ['Continuous intelligence is pending.'],
    }));
    const owner = opportunity.kind === 'technical'
      ? 'Marcus'
      : String(metadata['owner'] ?? 'Jordan');
    await args.db.from('seo_opportunities').update({
      growth_campaign_id: campaign.id,
      metadata: {
        ...metadata,
        campaign_key: campaign.campaign_key,
        campaign_role: campaign.role,
        campaign_vertical: campaign.vertical,
        campaign_gate: gateReason,
        buyer_role: campaign.buyer_role,
        offer_key: campaign.offer_key,
      },
    }).eq('id', opportunity.id);
    const parent = await upsertLoop(args.db, {
      source_type: 'seo_opportunity',
      source_key: opportunity.id,
      lane: 'seo',
      owner,
      state: opportunity.status === 'in_progress' ? 'executing' : 'assigned',
      severity: opportunity.priority === 1 ? 'today' : 'normal',
      title: opportunity.title,
      detail: opportunity.evidence,
      next_action: opportunity.recommendation,
      due_at: addHours(opportunity.first_seen_at, opportunity.priority === 1 ? 24 : 72),
      founder_required: false,
      metadata: {
        opportunity_key: opportunity.opportunity_key,
        kind: opportunity.kind,
        growth_campaign_id: campaign.id,
        growth_intervention_id: opportunity.growth_intervention_id ?? null,
        campaign_key: campaign.campaign_key,
        campaign_role: campaign.role,
        campaign_vertical: campaign.vertical,
        campaign_gate: gateReason,
        retry_policy: metadata['retry_policy'] ?? null,
        closure_condition: metadata['closure_condition'] ?? null,
        intelligence_status: intelligence.status,
        intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId),
        accepted_learning_pattern_ids: appliedLearningPatternIds,
      },
    });
    if (!parent) continue;
    loops += 1;

    if (opportunity.kind !== 'content_gap') continue;
    const keyword = String(opportunity.seo_keywords?.keyword ?? opportunity.title);
    const family = buildSeoContentFamily({
      keyword,
      opportunityTitle: opportunity.title,
      articleSlaHours: args.articleSlaHours,
      socialIdeaSlaHours: args.socialIdeaSlaHours,
    });

    for (const member of family) {
      const item = await ensureContentItem(args.db, {
        content_id: member.contentId,
        slug: member.slug,
        title: member.title,
        status: member.status,
        content_type: member.contentType,
        target_persona: campaign.buyer_role,
        primary_problem: campaign.primary_problem,
        topic_cluster: keyword,
        keyword_cluster: keyword,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        growth_campaign_id: campaign.id,
        growth_intervention_id: opportunity.growth_intervention_id ?? null,
        brief_markdown: [
          ...campaignBriefSections(scoped),
          `## SEO opportunity`,
          opportunity.evidence,
          `## Recommended angle`,
          opportunity.recommendation,
          `## Role in the content family`,
          member.goal,
        ].join('\n\n'),
        metadata: {
          proposed_by: 'seo_agent',
          seo_opportunity_id: opportunity.id,
          seo_family_key: opportunity.opportunity_key,
          owner: member.owner,
          channel: member.contentType,
          growth_campaign_id: campaign.id,
          growth_intervention_id: opportunity.growth_intervention_id ?? null,
          campaign_key: campaign.campaign_key,
          campaign_role: campaign.role,
          campaign_vertical: campaign.vertical,
          campaign_gate: gateReason,
          buyer_role: campaign.buyer_role,
          offer_key: campaign.offer_key,
          cta_goal: campaign.cta_goal,
          success_condition: campaign.success_condition,
          stop_condition: campaign.stop_condition,
          source_url: metadata['source_url'] ?? null,
          source_label: metadata['source_label'] ?? null,
          research_channel: metadata['research_channel'] ?? null,
          recommendation: opportunity.recommendation,
          evidence: opportunity.evidence,
          intelligence_evidence_ids: intelligence.evidence.map((entry) => entry.evidenceId),
          accepted_learning_pattern_ids: appliedLearningPatternIds,
          requires_source_backed_editorial_review: member.contentType === 'article',
        },
      });
      if (!item) continue;
      contentItems += 1;
      const child = await upsertLoop(args.db, {
        source_type: 'content_item',
        source_key: member.contentId,
        parent_loop_id: parent.id,
        lane: member.contentType === 'article' ? 'seo' : 'social',
        owner: member.owner,
        state: 'assigned',
        severity: opportunity.priority === 1 ? 'today' : 'normal',
        title: member.title,
        detail: member.goal,
        next_action: member.goal,
        due_at: addHours(opportunity.first_seen_at, member.slaHours),
        founder_required: false,
        resolved_at: null,
        verified_at: null,
        evidence: {},
        metadata: {
          content_item_id: item.id,
          content_type: member.contentType,
          growth_campaign_id: campaign.id,
          growth_intervention_id: opportunity.growth_intervention_id ?? null,
          campaign_key: campaign.campaign_key,
          campaign_role: campaign.role,
          campaign_vertical: campaign.vertical,
          retry_policy: metadata['retry_policy'] ?? null,
          closure_condition: metadata['closure_condition'] ?? null,
        },
      });
      if (child) loops += 1;
    }

    if (opportunity.status === 'queued') {
      await args.db
        .from('seo_opportunities')
        .update({
          status: 'in_progress',
          metadata: {
            ...metadata,
            owner,
            loop_controlled: true,
            family_created_at: now.toISOString(),
            campaign_key: campaign.campaign_key,
            campaign_role: campaign.role,
            campaign_vertical: campaign.vertical,
            campaign_gate: gateReason,
            buyer_role: campaign.buyer_role,
            offer_key: campaign.offer_key,
          },
        })
        .eq('id', opportunity.id);
    }
  }

  return { opportunities: selected.length, contentItems, loops };
}

export async function reconcileContentLoops(db: Db, now = new Date()): Promise<number> {
  const { data: loopRows } = await db
    .from('agent_work_loops')
    .select('id,source_key,state')
    .eq('source_type', 'content_item')
    .in('state', ['assigned', 'executing', 'verifying', 'blocked', 'completed'])
    .limit(250);
  const loops = loopRows ?? [];
  if (!loops.length) return 0;
  const keys = loops.map((row: any) => String(row.source_key));
  const { data: items } = await db
    .from('content_items')
    .select('content_id,status,canonical_url,published_at,content_type,draft_markdown')
    .in('content_id', keys);
  const byKey = new Map<string, any>(
    (items ?? []).map((item: any) => [String(item.content_id), item] as [string, any]),
  );
  let completed = 0;
  for (const loop of loops) {
    const item = byKey.get(String(loop.source_key));
    const satisfied = isContentLoopSatisfied(item);
    if (!satisfied) {
      if (
        loop.state === 'completed'
        && (item?.content_type === 'newsletter' || item?.content_type === 'social_post')
      ) {
        await db.from('agent_work_loops').update({
          state: 'assigned',
          evidence: { verification: 'publication_not_yet_proven' },
          verified_at: null,
          resolved_at: null,
          blocker: null,
        }).eq('id', loop.id);
      }
      continue;
    }
    if (loop.state === 'completed') continue;
    await db.from('agent_work_loops').update({
      state: 'completed',
      evidence: {
        content_status: item.status,
        canonical_url: item.canonical_url ?? null,
        published_at: item.published_at ?? null,
      },
      verified_at: now.toISOString(),
      resolved_at: now.toISOString(),
      blocker: null,
    }).eq('id', loop.id);
    completed += 1;
  }
  return completed;
}

export async function materializeSeoContentDerivatives(args: {
  db: Db;
  opportunityId: string;
  title: string;
  markdown: string;
  canonicalUrl: string;
  now?: Date;
}): Promise<number> {
  const now = args.now ?? new Date();
  const { data: items } = await args.db
    .from('content_items')
    .select('id,content_id,content_type,status,metadata')
    .eq('metadata->>seo_opportunity_id', args.opportunityId)
    .eq('content_type', 'social_post');
  let updated = 0;
  for (const item of items ?? []) {
    if (item.status === 'published' || item.status === 'archived') continue;
    const metadata = metadataObject(item.metadata);
    await args.db.from('content_items').update({
      brief_markdown: [
        `## Instagram content concept`,
        `Turn “${args.title}” into a crop-safe carousel or paced Reel.`,
        `Lead with the buyer problem, use three evidence-backed teaching beats, and finish with the free scan.`,
        `Canonical source: ${args.canonicalUrl}`,
      ].join('\n\n'),
      metadata: {
        ...metadata,
        derived_from_canonical: true,
        derived_at: now.toISOString(),
      },
    }).eq('id', item.id);
    updated += 1;
  }
  return updated;
}

/**
 * Early versions treated "newsletter" as a separate email send. The intended
 * SEO loop is simpler: publish the canonical GEO-Pulse blog, then derive social.
 * Preserve the old records for audit history while removing them from the
 * active work queue.
 */
export async function retireLegacySeoNewsletterLoops(db: Db, now = new Date()): Promise<number> {
  const { data: items } = await db
    .from('content_items')
    .select('id,content_id,status,metadata')
    .eq('content_type', 'newsletter')
    .eq('metadata->>proposed_by', 'seo_agent')
    .limit(250);
  const legacy = items ?? [];
  if (!legacy.length) return 0;

  for (const item of legacy) {
    if (item.status !== 'published' && item.status !== 'archived') {
      await db.from('content_items').update({
        status: 'archived',
        metadata: {
          ...metadataObject(item.metadata),
          retired_reason: 'canonical_blog_is_the_primary_seo_publication',
          retired_at: now.toISOString(),
        },
      }).eq('id', item.id);
    }
  }

  const keys = legacy.map((item: any) => String(item.content_id));
  const { data: loops } = await db
    .from('agent_work_loops')
    .select('id')
    .eq('source_type', 'content_item')
    .in('source_key', keys)
    .in('state', ['assigned', 'executing', 'verifying', 'blocked']);
  for (const loop of loops ?? []) {
    await db.from('agent_work_loops').update({
      state: 'dismissed',
      evidence: {
        verification: 'channel_merged_into_canonical_blog',
        canonical_channel: 'article',
      },
      founder_required: false,
      blocker: null,
      verified_at: now.toISOString(),
      resolved_at: now.toISOString(),
    }).eq('id', loop.id);
  }
  return loops?.length ?? 0;
}

export function seoParentCanClose(
  children: readonly { state: string }[] | null | undefined,
  measurementCount: number,
): boolean {
  return Boolean(children?.length)
    && children!.every((child) => child.state === 'completed' || child.state === 'dismissed')
    && measurementCount > 0;
}

export async function reconcileSeoFollowupMeasurements(db: Db): Promise<number> {
  const { data: items, error } = await db
    .from('content_items')
    .select('id,content_type,canonical_url,published_at,metadata')
    .eq('metadata->>proposed_by', 'seo_agent')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .limit(100);
  if (error) return 0;
  let created = 0;
  for (const item of items ?? []) {
    const metadata = metadataObject(item.metadata);
    const opportunityId = typeof metadata['seo_opportunity_id'] === 'string'
      ? metadata['seo_opportunity_id']
      : null;
    if (!opportunityId) continue;
    if (item.content_type === 'article' && item.canonical_url) {
      const path = String(item.canonical_url).replace(/^https?:\/\/[^/]+/i, '');
      const { data: measurements } = await db
        .from('seo_measurements')
        .select('id,source,measured_on,position,clicks,impressions,ctr,page_url')
        .ilike('page_url', `%${path}%`)
        .gte('measured_on', String(item.published_at).slice(0, 10))
        .order('measured_on', { ascending: false })
        .limit(1);
      const measurement = measurements?.[0];
      if (!measurement?.id) continue;
      const { error: insertError } = await db.from('content_followup_measurements').upsert({
        content_item_id: item.id,
        seo_opportunity_id: opportunityId,
        measurement_kind: measurement.source === 'google_search_console' ? 'search_console' : 'rank',
        source_table: 'seo_measurements',
        source_id: measurement.id,
        measured_at: `${measurement.measured_on}T12:00:00.000Z`,
        metrics: {
          position: measurement.position,
          clicks: measurement.clicks,
          impressions: measurement.impressions,
          ctr: measurement.ctr,
        },
        evidence_url: measurement.page_url,
        quality_state: 'valid',
      }, { onConflict: 'content_item_id,measurement_kind,source_table,source_id' });
      if (!insertError) created += 1;
      continue;
    }
    if (item.content_type === 'social_post') {
      const { data: deliveries } = await db
        .from('content_distribution_deliveries')
        .select('id,destination_url,destination_post_id,published_at,metadata')
        .eq('content_item_id', item.id)
        .eq('destination_type', 'social')
        .eq('status', 'published')
        .not('destination_post_id', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1);
      const delivery = deliveries?.[0];
      if (!delivery?.id || !delivery.destination_url) continue;
      const { error: insertError } = await db.from('content_followup_measurements').upsert({
        content_item_id: item.id,
        seo_opportunity_id: opportunityId,
        measurement_kind: 'social_provider',
        source_table: 'content_distribution_deliveries',
        source_id: delivery.id,
        measured_at: delivery.published_at,
        metrics: {
          provider_post_id: delivery.destination_post_id,
          ...(metadataObject(delivery.metadata)['instagram_performance']
            ? { instagram_performance: metadataObject(delivery.metadata)['instagram_performance'] }
            : {}),
        },
        evidence_url: delivery.destination_url,
        quality_state: 'valid_partial',
      }, { onConflict: 'content_item_id,measurement_kind,source_table,source_id' });
      if (!insertError) created += 1;
    }
  }
  return created;
}

export async function closeSatisfiedSeoParents(db: Db, now = new Date()): Promise<number> {
  const { data: parents } = await db
    .from('agent_work_loops')
    .select('id,source_key')
    .eq('source_type', 'seo_opportunity')
    .in('state', ['assigned', 'executing', 'verifying', 'completed'])
    .limit(250);
  let completed = 0;
  for (const parent of parents ?? []) {
    const { data: children } = await db
      .from('agent_work_loops')
      .select('state,evidence')
      .eq('parent_loop_id', parent.id);
    const { count: measurementCount, error: measurementError } = await db
      .from('content_followup_measurements')
      .select('id', { count: 'exact', head: true })
      .eq('seo_opportunity_id', parent.source_key)
      .in('quality_state', ['valid', 'valid_partial']);
    const allChildrenComplete = Boolean(children?.length)
      && children.every((child: any) => child.state === 'completed' || child.state === 'dismissed');
    if (!allChildrenComplete) {
      await db.from('agent_work_loops').update({
        state: 'executing',
        evidence: { verification: 'waiting_for_all_channels_to_publish' },
        verified_at: null,
        resolved_at: null,
      }).eq('id', parent.id);
      await db.from('seo_opportunities').update({
        status: 'in_progress',
        completed_at: null,
      }).eq('id', parent.source_key);
      continue;
    }
    if (measurementError || !seoParentCanClose(children, measurementCount ?? 0)) {
      await db.from('agent_work_loops').update({
        state: 'verifying',
        evidence: {
          verification: 'publication_proven_measurement_pending',
          child_loops_verified: children.length,
        },
        verified_at: null,
        resolved_at: null,
      }).eq('id', parent.id);
      continue;
    }
    await db.from('agent_work_loops').update({
      state: 'completed',
      verified_at: now.toISOString(),
      resolved_at: now.toISOString(),
      evidence: { child_loops_verified: children.length },
    }).eq('id', parent.id);
    await db.from('seo_opportunities').update({
      status: 'completed',
      completed_at: now.toISOString(),
    }).eq('id', parent.source_key);
    completed += 1;
  }
  return completed;
}

export async function runAgentLoopControl(args: {
  db: Db;
  now?: Date;
  seoBatch?: number;
}): Promise<{
  synced: number;
  contentCompleted: number;
  seoCompleted: number;
  legacyNewslettersRetired: number;
  measurementsCreated: number;
  activeSeoFamilies: number;
  deferredSeoFamilies: number;
}> {
  const now = args.now ?? new Date();
  const legacyNewslettersRetired = await retireLegacySeoNewsletterLoops(args.db, now);
  const familyCapacity = await enforceSeoFamilyWorkInProgress(args.db, now);
  const synced = await syncSeoOpportunityLoops({
    db: args.db,
    now,
    limit: Math.min(
      args.seoBatch ?? 10,
      Math.max(0, SEO_FAMILY_WIP_CAP - familyCapacity.activeFamilies),
    ),
  });
  const contentCompleted = await reconcileContentLoops(args.db, now);
  const measurementsCreated = await reconcileSeoFollowupMeasurements(args.db);
  const seoCompleted = await closeSatisfiedSeoParents(args.db, now);
  return {
    synced: synced.opportunities,
    contentCompleted,
    seoCompleted,
    legacyNewslettersRetired,
    measurementsCreated,
    activeSeoFamilies: familyCapacity.activeFamilies + synced.opportunities,
    deferredSeoFamilies: familyCapacity.deferredFamilies,
  };
}

export type CampaignLoopAction = {
  key: string;
  severity: 'now' | 'today' | 'watch';
  owner: string;
  resolution: 'agent' | 'approval' | 'external';
  title: string;
  detail: string;
  playbook: string;
  href: string;
};

export async function attemptSafeCampaignRemediation(args: {
  db: Db;
  actions: readonly CampaignLoopAction[];
  now?: Date;
}): Promise<Map<string, Record<string, unknown>>> {
  const now = args.now ?? new Date();
  const resolved = new Map<string, Record<string, unknown>>();
  for (const action of args.actions) {
    if (action.key.startsWith('prospect:')) {
      const id = action.key.slice('prospect:'.length);
      if (action.detail.includes('HTTP 403')) {
        const { error } = await args.db.from('outreach_prospects').update({
          enabled: false,
          lifecycle_status: 'disqualified',
          last_error: null,
          next_action: null,
          exited_at: now.toISOString(),
          exit_reason: 'blocked_target_http_403',
          updated_at: now.toISOString(),
        }).eq('id', id);
        if (!error) {
          resolved.set(action.key, {
            remediation: 'blocked_target_skipped',
            prospect_id: id,
            verified_at: now.toISOString(),
          });
        }
      } else {
        const { error } = await args.db.from('outreach_prospects').update({
          last_error: null,
          next_run_at: now.toISOString(),
        }).eq('id', id);
        // Requeueing is an attempt, not proof of delivery. Maya keeps this loop
        // open until the outreach sweep removes the source exception.
        void error;
      }
      continue;
    }

    if (action.key.startsWith('distribution:') && action.resolution === 'agent') {
      const id = action.key.slice('distribution:'.length);
      const retryable = /timeout|network|429|5\d\d|overdue|processing/i.test(action.detail);
      const exhausted = /retries exhausted|after \d+ attempts/i.test(action.detail);
      if (!retryable || exhausted) continue;
      const { error } = await args.db.from('distribution_jobs').update({
        status: 'queued',
        scheduled_for: now.toISOString(),
        last_error: null,
      }).eq('id', id);
      // A retry is not a resolution. The loop closes only after the source job
      // reports success and disappears from the exception view.
      void error;
    }

    if (action.key.startsWith('newsletter:') && action.detail.includes('draft was created')) {
      const id = action.key.slice('newsletter:'.length);
      const { data: item } = await args.db
        .from('content_items')
        .select('id,status,updated_at,draft_markdown,canonical_url')
        .eq('id', id)
        .maybeSingle();
      const ageMs = item?.updated_at ? now.getTime() - Date.parse(item.updated_at) : 0;
      const incomplete = !item?.canonical_url || /\bsubject ideas\b|optional link-back/i.test(String(item?.draft_markdown ?? ''));
      if (item && ageMs > 2 * 86_400_000 && incomplete) {
        const { error } = await args.db.from('content_items').update({ status: 'archived' }).eq('id', id);
        if (!error) {
          await args.db
            .from('content_distribution_deliveries')
            .update({ status: 'archived' })
            .eq('content_item_id', id)
            .in('status', ['pending', 'drafted', 'queued', 'failed']);
          resolved.set(action.key, {
            remediation: 'stale_incomplete_newsletter_archived',
            content_item_id: id,
            verified_at: now.toISOString(),
          });
        }
      }
    }

    if (action.key.startsWith('gpm:') && action.title.includes('awaiting first report')) {
      const id = action.key.slice('gpm:'.length);
      const { data: config } = await args.db
        .from('client_benchmark_configs')
        .select('metadata')
        .eq('id', id)
        .maybeSingle();
      const metadata = metadataObject(config?.metadata);
      if (metadata['baseline_status'] === 'queued') continue;
      await args.db.from('client_benchmark_configs').update({
        metadata: {
          ...metadata,
          baseline_status: 'queued',
          baseline_requested_at: now.toISOString(),
          baseline_requested_by: 'maya',
        },
      }).eq('id', id);
      // This remains open until gpm_reports proves that the baseline ran.
    }
  }
  return resolved;
}

export async function syncCampaignActionLoops(args: {
  db: Db;
  actions: readonly CampaignLoopAction[];
  resolved?: ReadonlyMap<string, Record<string, unknown>>;
  now?: Date;
}): Promise<{ open: number; resolved: number }> {
  const now = args.now ?? new Date();
  const actions = args.actions.filter(
    (action) =>
      !action.key.startsWith('seo-opportunity:')
      && !action.key.startsWith('runtime-incident:'),
  );
  const activeKeys = new Set(actions.map((action) => action.key));
  let resolvedCount = 0;

  for (const action of actions) {
    const evidence = args.resolved?.get(action.key);
    const founderRequired = action.resolution === 'approval';
    const loop = await upsertLoop(args.db, {
      source_type: 'campaign_action',
      source_key: action.key,
      lane: action.key.split(':', 1)[0] || 'campaign',
      owner: action.owner,
      state: evidence ? 'completed' : 'assigned',
      severity: action.severity === 'now' ? 'urgent' : action.severity,
      title: action.title,
      detail: action.detail,
      next_action: action.playbook,
      due_at: addHours(now.toISOString(), action.severity === 'now' ? 2 : action.severity === 'today' ? 24 : 72),
      founder_required: founderRequired,
      blocker: founderRequired ? 'Founder authority is required for this action.' : null,
      evidence: evidence ?? {},
      verified_at: evidence ? now.toISOString() : null,
      resolved_at: evidence ? now.toISOString() : null,
      metadata: { href: action.href, resolution: action.resolution },
    });
    if (loop && evidence) {
      await args.db.from('agent_work_loops').update({
        state: 'completed',
        evidence,
        verified_at: now.toISOString(),
        resolved_at: now.toISOString(),
        founder_required: false,
        blocker: null,
      }).eq('id', loop.id);
      resolvedCount += 1;
    } else if (
      loop
      && action.resolution === 'agent'
      && loop.attemptCount < loop.maxAttempts
      && retryIsDue({
        attemptCount: loop.attemptCount,
        lastAttemptedAt: loop.lastAttemptedAt,
        now,
      })
    ) {
      await args.db.from('agent_work_loops').update({
        state: 'executing',
        attempt_count: loop.attemptCount + 1,
        last_attempted_at: now.toISOString(),
        evidence: {
          verification: 'repair_attempt_started',
          attempt_number: loop.attemptCount + 1,
          replacement_success_pending: true,
        },
      }).eq('id', loop.id);
    } else if (loop && action.resolution === 'agent' && loop.attemptCount >= loop.maxAttempts) {
      await args.db.from('agent_work_loops').update({
        state: 'blocked',
        blocker: 'Bounded repair attempts are exhausted; Marcus must change the repair strategy.',
        founder_required: false,
      }).eq('id', loop.id);
    }
  }

  const { data: prior } = await args.db
    .from('agent_work_loops')
    .select('id,source_key')
    .eq('source_type', 'campaign_action')
    .in('state', ['assigned', 'executing', 'verifying', 'blocked'])
    .limit(250);
  for (const loop of prior ?? []) {
    if (activeKeys.has(String(loop.source_key))) continue;
    const sourceKey = String(loop.source_key);
    const verification = sourceKey.startsWith('runtime:') || sourceKey.startsWith('cron:')
      ? 'successful_runtime_signal_observed'
      : sourceKey.startsWith('distribution:')
        ? 'provider_delivery_success_observed'
        : sourceKey.startsWith('gpm:')
          ? 'completed_measurement_observed'
          : sourceKey.startsWith('agent:')
            ? 'agent_enabled_without_blockers'
            : 'source_action_no_longer_open';
    await args.db.from('agent_work_loops').update({
      state: 'completed',
      evidence: {
        verification,
      },
      verified_at: now.toISOString(),
      resolved_at: now.toISOString(),
      founder_required: false,
      blocker: null,
    }).eq('id', loop.id);
    resolvedCount += 1;
  }

  return { open: actions.length - (args.resolved?.size ?? 0), resolved: resolvedCount };
}
