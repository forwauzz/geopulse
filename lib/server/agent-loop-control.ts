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
  metadata?: Record<string, unknown> | null;
  seo_keywords?: { keyword?: string | null } | null;
};

export type SeoContentFamilyMember = {
  contentId: string;
  slug: string;
  contentType: 'article' | 'newsletter' | 'social_post';
  status: 'brief' | 'idea';
  title: string;
  owner: 'Jordan';
  goal: string;
  slaHours: number;
};

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

export function buildSeoContentFamily(args: {
  keyword: string;
  opportunityTitle: string;
  articleSlaHours?: number;
  newsletterSlaHours?: number;
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
      contentId: `seo-agent:${familySlug}:newsletter`,
      slug: `${familySlug}-newsletter`,
      contentType: 'newsletter',
      status: 'brief',
      title: `${args.opportunityTitle} — newsletter`,
      owner: 'Jordan',
      goal: 'Prepare the newsletter derivative linked to the canonical article.',
      slaHours: args.newsletterSlaHours ?? 48,
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
): Promise<{ id: string; state: AgentLoopState } | null> {
  const sourceType = String(input['source_type']);
  const sourceKey = String(input['source_key']);
  const { data: existing } = await db
    .from('agent_work_loops')
    .select('id,state')
    .eq('source_type', sourceType)
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (existing?.id) {
    const next = {
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
    return { id: String(existing.id), state: existing.state as AgentLoopState };
  }

  const { data, error } = await db
    .from('agent_work_loops')
    .insert(input)
    .select('id,state')
    .single();
  if (error || !data?.id) return null;
  return { id: String(data.id), state: data.state as AgentLoopState };
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
  newsletterSlaHours?: number;
  socialIdeaSlaHours?: number;
}): Promise<{ opportunities: number; contentItems: number; loops: number }> {
  const now = args.now ?? new Date();
  const { data } = await args.db
    .from('seo_opportunities')
    .select('id,opportunity_key,kind,status,priority,title,evidence,recommendation,first_seen_at,metadata,seo_keywords(keyword)')
    .in('status', ['queued', 'in_progress'])
    .order('priority', { ascending: true })
    .order('last_seen_at', { ascending: false })
    .limit(100);

  let contentItems = 0;
  let loops = 0;
  const ordered = ([...(data ?? [])] as SeoOpportunity[]).sort((left, right) => {
    const leftControlled = metadataObject(left.metadata)['loop_controlled'] === true ? 1 : 0;
    const rightControlled = metadataObject(right.metadata)['loop_controlled'] === true ? 1 : 0;
    return leftControlled - rightControlled;
  });
  const selected = ordered.slice(0, args.limit ?? 10);
  for (const opportunity of selected) {
    const metadata = metadataObject(opportunity.metadata);
    const owner = opportunity.kind === 'technical'
      ? 'Marcus'
      : String(metadata['owner'] ?? 'Jordan');
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
      metadata: { opportunity_key: opportunity.opportunity_key, kind: opportunity.kind },
    });
    if (!parent) continue;
    loops += 1;

    if (opportunity.kind !== 'content_gap') continue;
    const keyword = String(opportunity.seo_keywords?.keyword ?? opportunity.title);
    const family = buildSeoContentFamily({
      keyword,
      opportunityTitle: opportunity.title,
      articleSlaHours: args.articleSlaHours,
      newsletterSlaHours: args.newsletterSlaHours,
      socialIdeaSlaHours: args.socialIdeaSlaHours,
    });

    for (const member of family) {
      const item = await ensureContentItem(args.db, {
        content_id: member.contentId,
        slug: member.slug,
        title: member.title,
        status: member.status,
        content_type: member.contentType,
        target_persona: 'small_business_and_agency',
        primary_problem: opportunity.evidence,
        topic_cluster: keyword,
        keyword_cluster: keyword,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        brief_markdown: [
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
          requires_source_backed_editorial_review: member.contentType === 'article',
        },
      });
      if (!item) continue;
      contentItems += 1;
      const child = await upsertLoop(args.db, {
        source_type: 'content_item',
        source_key: member.contentId,
        parent_loop_id: parent.id,
        lane: member.contentType === 'article' ? 'seo' : member.contentType === 'newsletter' ? 'email' : 'social',
        owner: member.owner,
        state: member.contentType === 'social_post' ? 'completed' : 'assigned',
        severity: opportunity.priority === 1 ? 'today' : 'normal',
        title: member.title,
        detail: member.goal,
        next_action: member.goal,
        due_at: addHours(opportunity.first_seen_at, member.slaHours),
        founder_required: false,
        resolved_at: member.contentType === 'social_post' ? now.toISOString() : null,
        verified_at: member.contentType === 'social_post' ? now.toISOString() : null,
        evidence: member.contentType === 'social_post'
          ? { content_item_id: item.id, status: 'idea_created' }
          : {},
        metadata: { content_item_id: item.id, content_type: member.contentType },
      });
      if (child) loops += 1;
    }

    if (opportunity.status === 'queued') {
      await args.db
        .from('seo_opportunities')
        .update({
          status: 'in_progress',
          metadata: { ...metadata, owner, loop_controlled: true, family_created_at: now.toISOString() },
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
    .in('state', ['assigned', 'executing', 'verifying', 'blocked'])
    .limit(100);
  const loops = loopRows ?? [];
  if (!loops.length) return 0;
  const keys = loops.map((row: any) => String(row.source_key));
  const { data: items } = await db
    .from('content_items')
    .select('content_id,status,canonical_url,published_at,content_type')
    .in('content_id', keys);
  const byKey = new Map<string, any>(
    (items ?? []).map((item: any) => [String(item.content_id), item] as [string, any]),
  );
  let completed = 0;
  for (const loop of loops) {
    const item = byKey.get(String(loop.source_key));
    const satisfied = item?.content_type === 'article'
      ? item.status === 'published' && Boolean(item.canonical_url)
      : item?.content_type === 'newsletter'
        ? item.status === 'published'
        : ['approved', 'published'].includes(String(item?.status ?? ''));
    if (!satisfied) continue;
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

export async function closeSatisfiedSeoParents(db: Db, now = new Date()): Promise<number> {
  const { data: parents } = await db
    .from('agent_work_loops')
    .select('id,source_key')
    .eq('source_type', 'seo_opportunity')
    .in('state', ['assigned', 'executing', 'verifying'])
    .limit(100);
  let completed = 0;
  for (const parent of parents ?? []) {
    const { data: children } = await db
      .from('agent_work_loops')
      .select('state,evidence')
      .eq('parent_loop_id', parent.id);
    if (!children?.length || children.some((child: any) => child.state !== 'completed' && child.state !== 'dismissed')) {
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
}): Promise<{ synced: number; contentCompleted: number; seoCompleted: number }> {
  const now = args.now ?? new Date();
  const synced = await syncSeoOpportunityLoops({
    db: args.db,
    now,
    limit: args.seoBatch ?? 10,
  });
  const contentCompleted = await reconcileContentLoops(args.db, now);
  const seoCompleted = await closeSatisfiedSeoParents(args.db, now);
  return { synced: synced.opportunities, contentCompleted, seoCompleted };
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
          last_error: null,
          next_run_at: null,
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
      if (!retryable) continue;
      const { error } = await args.db.from('distribution_jobs').update({
        status: 'queued',
        scheduled_for: now.toISOString(),
        last_error: null,
      }).eq('id', id);
      // A retry is not a resolution. The loop closes only after the source job
      // reports success and disappears from the exception view.
      void error;
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
  const actions = args.actions.filter((action) => !action.key.startsWith('seo-opportunity:'));
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
    await args.db.from('agent_work_loops').update({
      state: 'completed',
      evidence: { verification: 'source_action_no_longer_open' },
      verified_at: now.toISOString(),
      resolved_at: now.toISOString(),
      founder_required: false,
      blocker: null,
    }).eq('id', loop.id);
    resolvedCount += 1;
  }

  return { open: actions.length - (args.resolved?.size ?? 0), resolved: resolvedCount };
}
