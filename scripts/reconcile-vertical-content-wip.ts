import { createServiceRoleClient } from '../lib/supabase/service-role';
import { runAgentLoopControl } from '../lib/server/agent-loop-control';

type Row = Record<string, any>;

const PRIMARY_KEY = 'campaign:msp:public-evidence-to-buyer-question:2026-07-30';
const CHALLENGER_KEY = 'content-gap:agency ai visibility reports';
const RECONCILIATION_ID = 'vertical-wip-reconciliation:2026-07-30';

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function addHours(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

const primaryBrief = `## Asset
- type: article
- target persona: Quebec MSP owner or growth lead
- working title: What evidence should an MSP website provide for AI-assisted buyer questions?

## Problem
- core problem: An MSP can describe broad capabilities without connecting services, locations, industries, security practices, company identity, and trust evidence to the buyer questions it wants its website to support.
- why it matters now: The active MSP sales path needs one useful canonical explanation that connects the free audit to a practical decision without making visibility promises.

## GEO-Pulse angle
- what GEO-Pulse can credibly say: GEO-Pulse inspects observable public-site access, structure, service clarity, trust cues, structured data, and extractability, then separates findings from assumptions.
- what GEO-Pulse must not claim: Do not say that readiness predicts or guarantees rankings, citations, recommendations, traffic, or revenue.

## Key points
- Start with one buyer question the MSP wants its site to support.
- Connect the relevant service, service area, industry, company identity, and trust evidence on the public pages that should support that answer.
- Treat the free audit as a diagnosis of observable readiness signals, not a prediction.
- Use recurring monitoring to observe configured questions over time; do not infer causality from one measurement.

## Source inputs
- product truth: The free audit, MSP solution page, illustrative scorecard, walkthrough request, and recurring measurement paths are live product surfaces.
- social research: Use pain-point language only; do not treat it as standalone proof.
- other: Outreach and funnel evidence can guide the angle but must not become a public benchmark claim.

## CTA
- primary CTA: free scan
- why this CTA fits: It lets the MSP inspect evidence on its own public website before making a buying decision.

## Internal linking ideas
- /solutions/msps
- /examples/msp-ai-visibility-scorecard
- /walkthrough
- /#audit
`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const now = new Date();
  const db = createServiceRoleClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const { data: opportunityRows, error: opportunityError } = await db
    .from('seo_opportunities')
    .select('id,opportunity_key,kind,status,metadata')
    .in('status', ['queued', 'in_progress'])
    .limit(500);
  if (opportunityError) throw opportunityError;

  const opportunities = (opportunityRows ?? []) as Row[];
  const challenger = opportunities.find((row) => row.opportunity_key === CHALLENGER_KEY) ?? null;
  const retire = opportunities.filter((row) =>
    row.kind !== 'technical'
    && row.opportunity_key !== PRIMARY_KEY
    && row.opportunity_key !== CHALLENGER_KEY
  );
  const retireIds = retire.map((row) => String(row.id));
  const { data: contentRows, error: contentError } = retireIds.length
    ? await db
        .from('content_items')
        .select('id,content_id,status,metadata')
        .in('metadata->>seo_opportunity_id', retireIds)
        .in('status', ['idea', 'brief', 'draft', 'review', 'approved'])
        .limit(1_000)
    : { data: [], error: null };
  if (contentError) throw contentError;
  const content = (contentRows ?? []) as Row[];

  const preview = {
    apply,
    generatedAt: now.toISOString(),
    primaryCampaignKey: PRIMARY_KEY,
    challengerFound: Boolean(challenger),
    opportunitiesToRetire: retire.length,
    unpublishedContentToArchive: content.length,
  };
  if (!apply) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const primaryMetadata = {
    owner: 'Jordan',
    campaign_id: 'msp-evidence-to-reply-2026-07',
    vertical: 'managed_service_providers',
    target_persona: 'quebec_msp_owner_or_growth_lead',
    retry_policy: 'One source-backed draft, one editorial/visual retry, then return to evidence review.',
    closure_condition: 'Canonical article is published with bounded claims, internal links, attribution, and a first measurement window.',
    reconciliation_id: RECONCILIATION_ID,
  };
  const { error: primaryError } = await db.from('seo_opportunities').upsert({
    opportunity_key: PRIMARY_KEY,
    kind: 'content_gap',
    status: 'queued',
    priority: 1,
    title: 'What evidence should an MSP website provide for AI-assisted buyer questions?',
    evidence: 'Production outreach is concentrated on MSPs, but the active content queue had no MSP-specific opportunity. The free audit, annotated example, walkthrough, and recurring measurement surfaces already exist.',
    recommendation: 'Create one canonical, source-backed article that connects an MSP buyer question to observable website evidence, then route the reader to the free scan.',
    metadata: primaryMetadata,
    first_seen_at: now.toISOString(),
    last_seen_at: now.toISOString(),
  }, { onConflict: 'opportunity_key' });
  if (primaryError) throw primaryError;

  if (challenger) {
    const { error } = await db.from('seo_opportunities').update({
      metadata: {
        ...metadataObject(challenger.metadata),
        campaign_id: 'agency-challenger-2026-07',
        vertical: 'marketing_agencies',
        target_persona: 'marketing_agency_owner',
        retry_policy: 'Keep one agency family active; do not add another until publication and conversion evidence exists.',
        closure_condition: 'Canonical article and one social derivative have publication proof and a first measurement window.',
        reconciliation_id: RECONCILIATION_ID,
      },
      last_seen_at: now.toISOString(),
    }).eq('id', challenger.id);
    if (error) throw error;
  }

  for (const opportunity of retire) {
    const { error } = await db.from('seo_opportunities').update({
      status: 'dismissed',
      completed_at: now.toISOString(),
      metadata: {
        ...metadataObject(opportunity.metadata),
        retired_reason: 'unscoped_content_does_not_match_active_vertical',
        retired_at: now.toISOString(),
        reconciliation_id: RECONCILIATION_ID,
      },
    }).eq('id', opportunity.id);
    if (error) throw error;
  }

  for (const item of content) {
    const { error } = await db.from('content_items').update({
      status: 'archived',
      metadata: {
        ...metadataObject(item.metadata),
        retired_reason: 'parent_opportunity_retired_by_vertical_wip_gate',
        retired_at: now.toISOString(),
        reconciliation_id: RECONCILIATION_ID,
      },
    }).eq('id', item.id);
    if (error) throw error;
  }

  const contentKeys = content.map((item) => String(item.content_id));
  const dismissal = {
    state: 'dismissed',
    founder_required: false,
    blocker: null,
    evidence: { verification: 'unscoped_content_retired', reconciliation_id: RECONCILIATION_ID },
    verified_at: now.toISOString(),
    resolved_at: now.toISOString(),
  };
  if (retireIds.length) {
    const { error } = await db.from('agent_work_loops').update(dismissal)
      .eq('source_type', 'seo_opportunity').in('source_key', retireIds);
    if (error) throw error;
  }
  if (contentKeys.length) {
    const { error } = await db.from('agent_work_loops').update(dismissal)
      .eq('source_type', 'content_item').in('source_key', contentKeys);
    if (error) throw error;
  }

  const { data: openChildRows, error: openChildError } = await db
    .from('agent_work_loops')
    .select('id,source_key,parent_loop_id')
    .eq('source_type', 'content_item')
    .in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked'])
    .not('parent_loop_id', 'is', null)
    .limit(500);
  if (openChildError) throw openChildError;
  const openChildren = (openChildRows ?? []) as Row[];
  const parentIds = [...new Set(openChildren.map((row) => String(row.parent_loop_id)))];
  const { data: dismissedParentRows, error: dismissedParentError } = parentIds.length
    ? await db.from('agent_work_loops').select('id').in('id', parentIds).eq('state', 'dismissed')
    : { data: [], error: null };
  if (dismissedParentError) throw dismissedParentError;
  const dismissedParentIds = new Set((dismissedParentRows ?? []).map((row) => String(row.id)));
  const orphanedChildren = openChildren.filter((row) => dismissedParentIds.has(String(row.parent_loop_id)));
  const orphanedKeys = orphanedChildren.map((row) => String(row.source_key));
  if (orphanedKeys.length) {
    const { data: orphanedItems, error: orphanedItemsError } = await db
      .from('content_items')
      .select('id,metadata')
      .in('content_id', orphanedKeys)
      .in('status', ['idea', 'brief', 'draft', 'review', 'approved']);
    if (orphanedItemsError) throw orphanedItemsError;
    for (const item of orphanedItems ?? []) {
      const { error } = await db.from('content_items').update({
        status: 'archived',
        metadata: {
          ...metadataObject(item.metadata),
          retired_reason: 'parent_loop_already_dismissed',
          retired_at: now.toISOString(),
          reconciliation_id: RECONCILIATION_ID,
        },
      }).eq('id', item.id);
      if (error) throw error;
    }
    const orphanIds = orphanedChildren.map((row) => String(row.id));
    const { error } = await db.from('agent_work_loops').update({
      ...dismissal,
      evidence: {
        verification: 'parent_loop_already_dismissed',
        reconciliation_id: RECONCILIATION_ID,
      },
    }).in('id', orphanIds);
    if (error) throw error;
  }

  const loopResult = await runAgentLoopControl({ db, now, seoBatch: 2 });
  const { data: primary } = await db.from('seo_opportunities')
    .select('id').eq('opportunity_key', PRIMARY_KEY).maybeSingle();
  if (!primary?.id) throw new Error('Primary MSP opportunity was not persisted.');
  const { data: primaryArticle, error: primaryArticleError } = await db.from('content_items')
    .select('id,metadata')
    .eq('metadata->>seo_opportunity_id', primary.id)
    .eq('content_type', 'article')
    .maybeSingle();
  if (primaryArticleError || !primaryArticle?.id) {
    throw primaryArticleError ?? new Error('Primary MSP article brief was not materialized.');
  }
  const { error: briefError } = await db.from('content_items').update({
    brief_markdown: primaryBrief,
    target_persona: 'quebec_msp_owner_or_growth_lead',
    metadata: {
      ...metadataObject(primaryArticle.metadata),
      ...primaryMetadata,
      proposed_by: 'seo_agent',
      seo_opportunity_id: primary.id,
      requires_source_backed_editorial_review: true,
    },
  }).eq('id', primaryArticle.id);
  if (briefError) throw briefError;

  for (const opportunityKey of [PRIMARY_KEY, CHALLENGER_KEY]) {
    const { data: opportunity } = await db.from('seo_opportunities')
      .select('id').eq('opportunity_key', opportunityKey).maybeSingle();
    if (!opportunity?.id) continue;
    const { data: parent } = await db.from('agent_work_loops')
      .select('id').eq('source_type', 'seo_opportunity').eq('source_key', opportunity.id).maybeSingle();
    if (!parent?.id) continue;
    await db.from('agent_work_loops').update({ due_at: addHours(now, 48) }).eq('id', parent.id);
    await db.from('agent_work_loops').update({ due_at: addHours(now, 72) }).eq('parent_loop_id', parent.id);
  }

  console.log(JSON.stringify({ ...preview, orphanedChildrenRetired: orphanedChildren.length, loopResult }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
