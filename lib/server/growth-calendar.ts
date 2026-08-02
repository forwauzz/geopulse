type SupabaseLike = {
  from(table: string): any;
};

export type GrowthCalendarChannel =
  | 'instagram'
  | 'linkedin'
  | 'email'
  | 'blog'
  | 'sales'
  | 'experiment'
  | 'internal';

export type GrowthCalendarDisplayState = 'live' | 'next' | 'action' | 'stopped';

export type GrowthCalendarMedia = {
  readonly url: string;
  readonly kind: string;
  readonly altText: string | null;
  readonly readyStatus: string;
  readonly sortOrder: number;
};

export type GrowthCalendarActivity = {
  readonly id: string;
  readonly sourceType: 'distribution' | 'content' | 'outreach' | 'sales' | 'work_loop' | 'experiment' | 'email_campaign';
  readonly sourceId: string;
  readonly displayState: GrowthCalendarDisplayState;
  readonly channel: GrowthCalendarChannel;
  readonly title: string;
  readonly startsAt: string;
  readonly status: string;
  /**
   * Plain-language state for the card. The four display states are deliberately coarse (live /
   * next / needs help / stopped), which is not enough to tell a draft from a scheduled campaign
   * from a stopped one — and the founder should not have to read an internal status code.
   */
  readonly statusLabel?: string;
  /**
   * The real sender for this card. Email cards used to render a hardcoded from-address, which
   * would claim an authenticated identity that does not exist yet.
   */
  readonly senderLine?: string;
  readonly recipientCount?: number | null;
  readonly owner: string;
  readonly summary: string | null;
  readonly previewTitle: string | null;
  readonly previewText: string | null;
  readonly media: readonly GrowthCalendarMedia[];
  readonly destinationUrl: string | null;
  readonly campaignName: string | null;
  readonly campaignRole: string | null;
  readonly vertical: string | null;
  readonly interventionName: string | null;
  readonly funnelStage: string | null;
  readonly sourceContentTitle: string | null;
  readonly sourceContentUrl: string | null;
  readonly approvedAt: string | null;
  readonly approvalLabel: string | null;
  readonly nextAction: string | null;
  readonly dueAt: string | null;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly dependencies: readonly string[];
  readonly successCondition: string | null;
  readonly stopCondition: string | null;
  readonly outcomeLabel: string | null;
  readonly outcomeValue: string | null;
  readonly detailHref: string;
};

export type GrowthCalendarInboxItem = {
  readonly id: string;
  readonly severity: 'urgent' | 'today' | 'normal' | 'watch';
  readonly title: string;
  readonly detail: string | null;
  readonly owner: string;
  readonly nextAction: string;
  readonly dueAt: string | null;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly href: string;
  readonly sourceLabel: string;
};

export type GrowthCalendarCampaign = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly vertical: string;
  readonly status: string;
  readonly allocationPercent: number;
};

export type GrowthCalendarData = {
  readonly generatedAt: string;
  readonly activities: readonly GrowthCalendarActivity[];
  readonly inbox: readonly GrowthCalendarInboxItem[];
  readonly campaigns: readonly GrowthCalendarCampaign[];
  readonly warnings: readonly string[];
};

type Row = Record<string, any>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ownerFrom(metadata: unknown, fallback: string): string {
  const value = text(record(metadata)['owner']);
  if (!value) return fallback;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function providerChannel(value: unknown): GrowthCalendarChannel {
  const provider = text(value)?.toLowerCase();
  if (provider === 'instagram' || provider === 'linkedin') return provider;
  if (provider === 'newsletter' || provider === 'mailchimp' || provider === 'kit' || provider === 'buttondown' || provider === 'beehiiv') return 'email';
  return 'internal';
}

function explicitChannel(value: unknown): GrowthCalendarChannel | null {
  const channel = text(value)?.toLowerCase();
  return channel && ['instagram', 'linkedin', 'email', 'blog', 'sales', 'experiment', 'internal'].includes(channel)
    ? (channel as GrowthCalendarChannel)
    : null;
}

function defaultOwner(channel: GrowthCalendarChannel): string {
  if (channel === 'email' || channel === 'sales') return 'Elena';
  if (channel === 'instagram' || channel === 'blog') return 'Jordan';
  if (channel === 'linkedin') return 'Sofia';
  return 'Maya';
}

function titleCase(value: unknown): string {
  return (text(value) ?? 'Unassigned')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isPastDue(value: unknown): boolean {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function displayStateFor(status: unknown, options?: { readonly manuallyPublished?: boolean; readonly hasDependency?: boolean; readonly dueAt?: unknown }): GrowthCalendarDisplayState {
  if (options?.manuallyPublished) return 'live';
  const value = String(status).toLowerCase();
  if (['published', 'published_manual', 'sent', 'completed'].includes(value)) return 'live';
  if (['scheduled', 'queued', 'approved', 'processing', 'assigned', 'executing', 'verifying'].includes(value) && isPastDue(options?.dueAt)) return 'action';
  if (['scheduled', 'queued', 'approved', 'processing', 'running', 'evaluating', 'assigned', 'executing', 'verifying'].includes(value)) return options?.hasDependency ? 'action' : 'next';
  if (['failed', 'blocked', 'attention', 'review', 'draft', 'brief', 'discovered'].includes(value)) return 'action';
  if (['cancelled', 'archived', 'dismissed', 'stopped', 'disqualified', 'unsubscribed'].includes(value)) return 'stopped';
  return options?.hasDependency ? 'action' : 'next';
}

async function rows(label: string, promise: PromiseLike<{ data?: unknown; error?: unknown }>, warnings: string[]): Promise<Row[]> {
  try {
    const result = await promise;
    if (result.error) {
      warnings.push(`${label} could not be loaded`);
      return [];
    }
    return Array.isArray(result.data) ? (result.data as Row[]) : [];
  } catch {
    warnings.push(`${label} could not be loaded`);
    return [];
  }
}

function isoDay(value: string): string {
  return value.slice(0, 10);
}

export async function loadGrowthCalendar(supabase: SupabaseLike): Promise<GrowthCalendarData> {
  const warnings: string[] = [];
  const [campaignRows, interventionRows, contentRows, assetRows, mediaRows, jobRows, accountRows, prospectRows, sendRows, templateRows, replyRows, leadRows, loopRows] = await Promise.all([
    rows('Campaigns', supabase.from('growth_campaigns').select('id,name,role,vertical,status,allocation_percent,success_condition,stop_condition,metadata').order('role', { ascending: true }), warnings),
    rows('Experiments', supabase.from('growth_campaign_interventions').select('id,campaign_id,intervention_key,name,channel,status,success_condition,stop_condition,started_at,ended_at,updated_at,metadata').order('updated_at', { ascending: false }).limit(100), warnings),
    rows('Content', supabase.from('content_items').select('id,content_id,title,status,content_type,draft_markdown,canonical_url,approved_at,published_at,created_at,updated_at,growth_campaign_id,growth_intervention_id,metadata').order('updated_at', { ascending: false }).limit(200), warnings),
    rows('Distribution assets', supabase.from('distribution_assets').select('id,asset_id,content_item_id,asset_type,provider_family,title,body_plaintext,caption_text,status,cta_url,approved_at,created_at,updated_at,growth_campaign_id,growth_intervention_id,metadata').order('updated_at', { ascending: false }).limit(200), warnings),
    rows('Media', supabase.from('distribution_asset_media').select('distribution_asset_id,media_kind,storage_url,alt_text,provider_ready_status,sort_order').order('sort_order', { ascending: true }).limit(500), warnings),
    rows('Publishing jobs', supabase.from('distribution_jobs').select('id,job_id,distribution_asset_id,distribution_account_id,publish_mode,scheduled_for,status,destination_url,provider_post_id,last_error,completed_at,created_at,updated_at').order('updated_at', { ascending: false }).limit(250), warnings),
    rows('Publishing accounts', supabase.from('distribution_accounts').select('id,provider_name,account_label,status').limit(100), warnings),
    rows('Outreach cohorts', supabase.from('outreach_prospects').select('id,segment,template_id,lifecycle_status,sequence_step,max_sequence_steps,next_run_at,last_run_at,last_error,owner,next_action,closure_condition,consecutive_failures,max_attempts,growth_campaign_id,growth_intervention_id,enabled').order('next_run_at', { ascending: true }).limit(500), warnings),
    rows('Outreach sends', supabase.from('outreach_sends').select('id,prospect_id,sent_at,opened_at,delivery_status,sequence_step,delivery_error').order('sent_at', { ascending: false }).limit(500), warnings),
    rows('Outreach templates', supabase.from('outreach_templates').select('id,name,subject_template,body_template,is_default,updated_at').order('updated_at', { ascending: false }).limit(100), warnings),
    rows('Outreach replies', supabase.from('outreach_reply_events').select('provider_event_id,prospect_id,lead_id,classification,processing_status,received_at').order('received_at', { ascending: false }).limit(100), warnings),
    rows('Sales leads', supabase.from('leads').select('id,company,request_type,status,owner,next_action,closure_condition,created_at').not('request_type', 'is', null).order('created_at', { ascending: false }).limit(100), warnings),
    rows('Action loops', supabase.from('agent_work_loops').select('id,source_type,source_key,lane,owner,state,severity,title,detail,next_action,due_at,attempt_count,max_attempts,founder_required,blocker,metadata,created_at,updated_at').in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked']).order('due_at', { ascending: true }).limit(250), warnings),
  ]);

  const campaignById = new Map(campaignRows.map((row) => [String(row.id), row]));
  const interventionById = new Map(interventionRows.map((row) => [String(row.id), row]));
  const contentById = new Map(contentRows.map((row) => [String(row.id), row]));
  const assetById = new Map(assetRows.map((row) => [String(row.id), row]));
  const accountById = new Map(accountRows.map((row) => [String(row.id), row]));
  const prospectById = new Map(prospectRows.map((row) => [String(row.id), row]));
  const templateById = new Map(templateRows.map((row) => [String(row.id), row]));
  const defaultTemplate = templateRows.find((row) => row.is_default) ?? null;
  const mediaByAsset = new Map<string, GrowthCalendarMedia[]>();
  for (const row of mediaRows) {
    const assetId = String(row.distribution_asset_id);
    const existing = mediaByAsset.get(assetId) ?? [];
    existing.push({
      url: String(row.storage_url),
      kind: String(row.media_kind),
      altText: text(row.alt_text),
      readyStatus: String(row.provider_ready_status),
      sortOrder: number(row.sort_order),
    });
    mediaByAsset.set(assetId, existing);
  }

  const activities: GrowthCalendarActivity[] = [];
  const distributedContentIds = new Set<string>();

  for (const job of jobRows) {
    const asset = assetById.get(String(job.distribution_asset_id));
    if (!asset) continue;
    const account = accountById.get(String(job.distribution_account_id));
    const channel = providerChannel(account?.provider_name ?? asset.provider_family);
    const campaign = campaignById.get(String(asset.growth_campaign_id));
    const intervention = interventionById.get(String(asset.growth_intervention_id));
    const content = contentById.get(String(asset.content_item_id));
    if (content?.id) distributedContentIds.add(String(content.id));
    const media = mediaByAsset.get(String(asset.id)) ?? [];
    const dependencies: string[] = [];
    if (account && account.status !== 'connected') dependencies.push(`${titleCase(account.provider_name)} account is ${titleCase(account.status).toLowerCase()}`);
    if (!['approved', 'scheduled', 'published'].includes(String(asset.status))) dependencies.push(`Asset approval is ${titleCase(asset.status).toLowerCase()}`);
    if (media.some((item) => !['ready', 'uploaded'].includes(item.readyStatus))) dependencies.push('Media still needs provider-ready QA');
    if (job.last_error) dependencies.push(String(job.last_error));
    const manuallyPublished = job.status === 'cancelled' && /manual.+publish|manual browser publication|prevent a duplicate/i.test(String(job.last_error ?? ''));
    const jobStatus = String(job.status).toLowerCase();
    const startsAt = ['published', 'completed'].includes(jobStatus)
      ? text(job.completed_at) ?? text(job.scheduled_for)
      : manuallyPublished
        ? text(job.completed_at) ?? text(job.updated_at) ?? text(job.scheduled_for)
        : jobStatus === 'failed'
          ? text(job.scheduled_for) ?? text(job.updated_at)
          : text(job.scheduled_for);
    if (!startsAt) continue;
    const owner = ownerFrom(asset.metadata, defaultOwner(channel));
    activities.push({
      id: `distribution:${job.id}`,
      sourceType: 'distribution',
      sourceId: String(job.id),
      displayState: displayStateFor(job.status, { manuallyPublished, hasDependency: dependencies.length > 0, dueAt: job.scheduled_for }),
      channel,
      title: text(asset.title) ?? `${titleCase(asset.asset_type)} for ${titleCase(account?.provider_name ?? asset.provider_family)}`,
      startsAt,
      status: manuallyPublished ? 'published_manual' : String(job.status),
      owner,
      summary: text(account?.account_label),
      previewTitle: text(asset.title),
      previewText: text(asset.caption_text) ?? text(asset.body_plaintext),
      media,
      destinationUrl: text(job.destination_url),
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: text(intervention?.name),
      funnelStage: text(record(asset.metadata)['funnel_stage']) ?? 'qualified traffic',
      sourceContentTitle: text(content?.title),
      sourceContentUrl: text(content?.canonical_url),
      approvedAt: text(asset.approved_at),
      approvalLabel: asset.approved_at ? 'Approved in distribution ledger' : null,
      nextAction: dependencies[0] ?? (job.status === 'published' ? 'Review qualified outcomes' : 'Publish at scheduled time'),
      dueAt: text(job.scheduled_for),
      attemptCount: 0,
      maxAttempts: 3,
      dependencies,
      successCondition: text(intervention?.success_condition) ?? text(campaign?.success_condition),
      stopCondition: text(intervention?.stop_condition) ?? text(campaign?.stop_condition),
      outcomeLabel: job.status === 'published' || manuallyPublished ? 'Published' : job.status === 'failed' ? 'Delivery failed' : 'Delivery state',
      outcomeValue: manuallyPublished ? 'Verified manual publication' : text(job.destination_url) ? 'Live destination available' : titleCase(job.status),
      detailHref: '/dashboard/distribution',
    });
  }

  for (const content of contentRows) {
    if (distributedContentIds.has(String(content.id))) continue;
    const campaign = campaignById.get(String(content.growth_campaign_id));
    const intervention = interventionById.get(String(content.growth_intervention_id));
    const metadata = record(content.metadata);
    const channel: GrowthCalendarChannel = content.content_type === 'article' ? 'blog' : content.content_type === 'newsletter' ? 'email' : 'internal';
    const dueAt = text(metadata['scheduled_for']) ?? text(metadata['due_at']);
    const startsAt = text(content.published_at) ?? dueAt ?? text(content.approved_at);
    if (!startsAt) continue;
    activities.push({
      id: `content:${content.id}`,
      sourceType: 'content',
      sourceId: String(content.id),
      displayState: displayStateFor(content.status, { hasDependency: content.status !== 'published', dueAt }),
      channel,
      title: String(content.title),
      startsAt,
      status: String(content.status),
      owner: ownerFrom(metadata, channel === 'internal' ? 'Priya' : defaultOwner(channel)),
      summary: titleCase(content.content_type),
      previewTitle: String(content.title),
      previewText: text(content.draft_markdown),
      media: [],
      destinationUrl: text(content.canonical_url),
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: text(intervention?.name),
      funnelStage: text(metadata['funnel_stage']) ?? 'qualified traffic',
      sourceContentTitle: null,
      sourceContentUrl: null,
      approvedAt: text(content.approved_at),
      approvalLabel: content.approved_at ? 'Approved in content ledger' : null,
      nextAction: content.status === 'published' ? 'Review qualified outcomes' : `Move ${titleCase(content.status).toLowerCase()} content to the next gate`,
      dueAt,
      attemptCount: 0,
      maxAttempts: 3,
      dependencies: content.status === 'published' ? [] : [`Content is ${titleCase(content.status).toLowerCase()}`],
      successCondition: text(intervention?.success_condition) ?? text(campaign?.success_condition),
      stopCondition: text(intervention?.stop_condition) ?? text(campaign?.stop_condition),
      outcomeLabel: content.status === 'published' ? 'Published' : 'Content state',
      outcomeValue: titleCase(content.status),
      detailHref: '/dashboard/content',
    });
  }

  const outreachBuckets = new Map<string, { date: string; segment: string; templateId: string | null; prospectIds: Set<string>; sent: number; failed: number; opened: number }>();
  for (const prospect of prospectRows) {
    if (!prospect.enabled || prospect.lifecycle_status !== 'active' || !prospect.next_run_at) continue;
    const date = isoDay(String(prospect.next_run_at));
    const segment = text(prospect.segment) ?? 'unsegmented';
    const templateId = text(prospect.template_id);
    const key = `${date}:due:${segment}:${templateId ?? 'default'}`;
    const bucket = outreachBuckets.get(key) ?? { date: String(prospect.next_run_at), segment, templateId, prospectIds: new Set(), sent: 0, failed: 0, opened: 0 };
    bucket.prospectIds.add(String(prospect.id));
    outreachBuckets.set(key, bucket);
  }
  for (const send of sendRows) {
    const prospect = prospectById.get(String(send.prospect_id));
    const segment = text(prospect?.segment) ?? 'unsegmented';
    const templateId = text(prospect?.template_id);
    const key = `${isoDay(String(send.sent_at))}:sent:${segment}:${templateId ?? 'default'}`;
    const bucket = outreachBuckets.get(key) ?? { date: String(send.sent_at), segment, templateId, prospectIds: new Set(), sent: 0, failed: 0, opened: 0 };
    bucket.prospectIds.add(String(send.prospect_id));
    if (send.delivery_status === 'failed') bucket.failed += 1;
    else bucket.sent += 1;
    if (send.opened_at) bucket.opened += 1;
    outreachBuckets.set(key, bucket);
  }
  for (const [key, bucket] of outreachBuckets) {
    const prospects = [...bucket.prospectIds].map((id) => prospectById.get(id)).filter(Boolean) as Row[];
    const sample = prospects[0] ?? {};
    const campaign = campaignById.get(String(sample.growth_campaign_id));
    const intervention = interventionById.get(String(sample.growth_intervention_id));
    const template = (bucket.templateId ? templateById.get(bucket.templateId) : null) ?? defaultTemplate;
    const isSent = key.includes(':sent:');
    const failures = prospects.reduce((sum, row) => sum + number(row.consecutive_failures), 0) + bucket.failed;
    const dependencies = failures > 0 ? [`${failures} delivery or retry issue${failures === 1 ? '' : 's'}`] : [];
    activities.push({
      id: `outreach:${key}`,
      sourceType: 'outreach',
      sourceId: key,
      displayState: displayStateFor(isSent ? (bucket.failed > 0 ? 'attention' : 'sent') : 'scheduled', { hasDependency: dependencies.length > 0, dueAt: bucket.date }),
      channel: 'email',
      title: `${titleCase(bucket.segment)} ${isSent ? 'outreach sent' : 'outreach cohort due'}`,
      startsAt: bucket.date,
      status: isSent ? (bucket.failed > 0 ? 'attention' : 'sent') : 'scheduled',
      owner: titleCase(sample.owner ?? 'Elena'),
      summary: `${bucket.prospectIds.size} qualified contact${bucket.prospectIds.size === 1 ? '' : 's'} · cohort view`,
      previewTitle: text(template?.subject_template),
      previewText: text(template?.body_template),
      media: [],
      destinationUrl: null,
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: text(intervention?.name),
      funnelStage: 'qualified outreach',
      sourceContentTitle: text(template?.name),
      sourceContentUrl: null,
      approvedAt: null,
      approvalLabel: template ? 'Approved outreach template' : 'Built-in approved template',
      nextAction: text(sample.next_action) ?? (isSent ? 'Classify replies and advance qualified intent' : 'Send the approved bounded cohort'),
      dueAt: bucket.date,
      attemptCount: failures,
      maxAttempts: Math.max(1, ...prospects.map((row) => number(row.max_attempts, 3))),
      dependencies,
      successCondition: text(intervention?.success_condition) ?? text(campaign?.success_condition),
      stopCondition: text(intervention?.stop_condition) ?? text(campaign?.stop_condition) ?? text(sample.closure_condition),
      outcomeLabel: isSent ? 'Delivery outcome' : 'Scheduled cohort',
      outcomeValue: isSent ? `${bucket.sent} sent · ${bucket.failed} failed · ${bucket.opened} opens (floor)` : `${bucket.prospectIds.size} due`,
      detailHref: '/admin/outreach',
    });
  }

  for (const loop of loopRows) {
    if (!loop.due_at) continue;
    const metadata = record(loop.metadata);
    const linkedAssetId = text(metadata['distribution_asset_id']);
    const linkedAsset = linkedAssetId ? assetById.get(linkedAssetId) : null;
    const linkedContent = linkedAsset?.content_item_id
      ? contentById.get(String(linkedAsset.content_item_id))
      : null;
    const linkedMedia = linkedAsset ? mediaByAsset.get(String(linkedAsset.id)) ?? [] : [];
    const lane = String(loop.lane).toLowerCase();
    const channel: GrowthCalendarChannel =
      explicitChannel(metadata['channel']) ??
      (linkedAsset ? providerChannel(linkedAsset.provider_family) : null) ??
      (lane.includes('sales') || lane.includes('outreach') ? 'sales' : 'internal');
    const campaign = campaignById.get(String(linkedAsset?.growth_campaign_id ?? metadata['growth_campaign_id']));
    const intervention = interventionById.get(String(linkedAsset?.growth_intervention_id ?? metadata['growth_intervention_id']));
    const dependencies: string[] = loop.blocker ? [String(loop.blocker)] : [];
    if (linkedAsset && !['approved', 'scheduled', 'published'].includes(String(linkedAsset.status))) {
      dependencies.push(`Asset approval is ${titleCase(linkedAsset.status).toLowerCase()}`);
    }
    if (linkedMedia.some((item) => !['ready', 'uploaded'].includes(item.readyStatus))) {
      dependencies.push('Media still needs provider-ready QA');
    }
    const isManualDistribution = Boolean(linkedAsset && metadata['manual_publish'] === true);
    activities.push({
      id: `loop:${loop.id}`,
      sourceType: 'work_loop',
      sourceId: String(loop.id),
      displayState: displayStateFor(loop.state, { hasDependency: dependencies.length > 0, dueAt: loop.due_at }),
      channel,
      title: String(loop.title),
      startsAt: String(loop.due_at),
      status: String(loop.state),
      owner: titleCase(loop.owner),
      summary: isManualDistribution
        ? `${titleCase(channel)} manual publishing fallback`
        : text(loop.detail),
      previewTitle: text(linkedAsset?.title) ?? String(loop.title),
      previewText: text(linkedAsset?.caption_text) ?? text(linkedAsset?.body_plaintext) ?? text(loop.detail),
      media: linkedMedia,
      destinationUrl: text(metadata['destination_url']),
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: text(intervention?.name),
      funnelStage: text(metadata['funnel_stage']) ?? (lane.includes('sales') ? 'sales follow-up' : isManualDistribution ? 'qualified traffic' : 'operating dependency'),
      sourceContentTitle: text(linkedContent?.title),
      sourceContentUrl: text(linkedContent?.canonical_url),
      approvedAt: text(linkedAsset?.approved_at),
      approvalLabel: linkedAsset?.approved_at ? 'Approved manual publishing asset' : null,
      nextAction: text(loop.next_action),
      dueAt: text(loop.due_at),
      attemptCount: number(loop.attempt_count),
      maxAttempts: number(loop.max_attempts, 3),
      dependencies,
      successCondition: text(metadata['success_condition']) ?? text(intervention?.success_condition) ?? text(campaign?.success_condition),
      stopCondition: text(metadata['stop_condition']) ?? text(intervention?.stop_condition) ?? text(campaign?.stop_condition),
      outcomeLabel: isManualDistribution ? 'Publishing route' : 'Loop state',
      outcomeValue: isManualDistribution ? 'Scheduled browser fallback' : titleCase(loop.state),
      detailHref: isManualDistribution ? '/dashboard/distribution' : '/admin/agents',
    });
  }

  // Email campaign cards come from the `email_campaign_v1` payload rather than from prospect
  // buckets: only the contract knows the exact locked text, sender, recipient count, and
  // preparation state, and a card built from prospects alone cannot distinguish a draft from a
  // stopped campaign.
  for (const intervention of interventionRows) {
    const campaignPayload = record(record(intervention.metadata)['email_campaign']);
    const versions = record(campaignPayload['versions']);
    const current = campaignPayload['current'];
    const contract = record(versions[String(current)]);
    if (Object.keys(contract).length === 0) continue;

    const schedule = record(contract['schedule']);
    const content = record(contract['content']);
    const audience = record(contract['audience']);
    const governance = record(contract['governance']);
    const goal = record(contract['goal']);
    const sender = record(contract['sender']);
    const state = String(contract['state'] ?? 'draft');

    const startsAt = text(schedule['startAt'])
      ?? text(governance['scheduledAt'])
      ?? text(intervention.updated_at);
    if (!startsAt) continue;

    const campaign = campaignById.get(String(intervention.campaign_id));
    const statusLabel = state === 'draft' ? 'Draft'
      : state === 'audience_ready' || state === 'content_ready' || state === 'qa_ready' ? 'In preparation'
      : state === 'test_passed' ? 'Internal test passed'
      : state === 'scheduled' ? 'Scheduled'
      : state === 'running' ? 'Sending'
      : state === 'evaluating' ? 'Evaluating'
      : state === 'completed' ? 'Complete'
      : state === 'stopped' ? 'Stopped'
      : titleCase(state);

    const displayState: GrowthCalendarDisplayState = state === 'stopped' ? 'stopped'
      : state === 'running' || state === 'evaluating' || state === 'completed' ? 'live'
      : state === 'scheduled' ? 'next'
      : 'action';

    const authenticated = Boolean(sender['authenticated']);
    const recipientCount = typeof audience['recipientCount'] === 'number' ? audience['recipientCount'] : null;

    activities.push({
      id: `email-campaign:${String(intervention.id)}`,
      sourceType: 'email_campaign',
      sourceId: String(contract['interventionKey'] ?? intervention.intervention_key),
      displayState,
      channel: 'email',
      title: String(intervention.name),
      startsAt,
      status: state,
      statusLabel,
      senderLine: authenticated
        ? `${String(sender['displayName'] ?? 'GEO-Pulse')} (authenticated sender)`
        : 'No authenticated GEO-Pulse sender configured',
      recipientCount,
      owner: titleCase(goal['owner'] ?? 'elena'),
      summary: recipientCount === null
        ? 'Audience not frozen yet'
        : `${String(recipientCount)} frozen recipients · ${String(audience['segment'] ?? 'segment')}`,
      previewTitle: text(content['subject']),
      previewText: text(content['bodyTemplate']),
      media: [],
      destinationUrl: null,
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: String(intervention.name),
      funnelStage: 'qualified outreach',
      sourceContentTitle: null,
      sourceContentUrl: null,
      approvedAt: text(governance['scheduledAt']),
      approvalLabel: governance['testAcceptedAt'] ? 'Internal test accepted for this exact version' : null,
      nextAction: state === 'stopped'
        ? 'Record the stop reason and what the next intervention changes'
        : state === 'scheduled'
          ? 'Wait for the scheduled send window'
          : 'Complete the remaining preflight gates',
      dueAt: text(schedule['startAt']),
      attemptCount: 0,
      maxAttempts: 3,
      dependencies: authenticated ? [] : ['No authenticated GEO-Pulse sending identity'],
      successCondition: text(goal['successCondition']) ?? text(campaign?.success_condition),
      stopCondition: text(goal['stopCondition']) ?? text(campaign?.stop_condition),
      outcomeLabel: 'Campaign state',
      outcomeValue: text(governance['stopReason']) ?? statusLabel,
      // Click-through opens the exact locked version, not a live re-render of an edited draft.
      detailHref: `/admin/campaigns/email/${String(contract['interventionKey'] ?? intervention.intervention_key)}`,
    });
  }

  for (const intervention of interventionRows) {
    const startsAt = text(intervention.ended_at) ?? text(intervention.started_at);
    if (!startsAt) continue;
    const campaign = campaignById.get(String(intervention.campaign_id));
    activities.push({
      id: `experiment:${intervention.id}`,
      sourceType: 'experiment',
      sourceId: String(intervention.id),
      displayState: displayStateFor(intervention.status),
      channel: 'experiment',
      title: String(intervention.name),
      startsAt,
      status: String(intervention.status),
      owner: ownerFrom(intervention.metadata, 'Maya'),
      summary: `${titleCase(intervention.channel)} experiment`,
      previewTitle: String(intervention.name),
      previewText: null,
      media: [],
      destinationUrl: null,
      campaignName: text(campaign?.name),
      campaignRole: text(campaign?.role),
      vertical: text(campaign?.vertical),
      interventionName: String(intervention.name),
      funnelStage: 'experiment decision',
      sourceContentTitle: null,
      sourceContentUrl: null,
      approvedAt: null,
      approvalLabel: null,
      nextAction: ['running', 'evaluating'].includes(String(intervention.status)) ? 'Apply the declared success and stop conditions' : null,
      dueAt: text(intervention.ended_at),
      attemptCount: 0,
      maxAttempts: 3,
      dependencies: [],
      successCondition: text(intervention.success_condition),
      stopCondition: text(intervention.stop_condition),
      outcomeLabel: 'Experiment state',
      outcomeValue: titleCase(intervention.status),
      detailHref: '/admin/campaigns',
    });
  }

  const inbox: GrowthCalendarInboxItem[] = loopRows.map((loop) => ({
    id: `loop:${loop.id}`,
    severity: ['urgent', 'today', 'normal', 'watch'].includes(String(loop.severity)) ? loop.severity : 'normal',
    title: String(loop.title),
    detail: text(loop.blocker) ?? text(loop.detail),
    owner: titleCase(loop.owner),
    nextAction: text(loop.next_action) ?? 'Define and execute the next evidence-backed action',
    dueAt: text(loop.due_at),
    attemptCount: number(loop.attempt_count),
    maxAttempts: number(loop.max_attempts, 3),
    href: '/admin/agents',
    sourceLabel: titleCase(loop.lane),
  }));

  for (const job of jobRows.filter((row) => row.status === 'failed')) {
    const asset = assetById.get(String(job.distribution_asset_id));
    inbox.push({
      id: `failed-job:${job.id}`,
      severity: 'today',
      title: text(asset?.title) ?? 'Publishing job failed',
      detail: text(job.last_error),
      owner: defaultOwner(providerChannel(asset?.provider_family)),
      nextAction: 'Repair or retry the existing publishing job',
      dueAt: text(job.updated_at),
      attemptCount: 1,
      maxAttempts: 3,
      href: '/dashboard/distribution',
      sourceLabel: 'Publishing',
    });
  }

  for (const reply of replyRows.filter((row) => row.classification === 'positive' || row.processing_status !== 'processed')) {
    inbox.push({
      id: `reply:${reply.provider_event_id}`,
      severity: reply.classification === 'positive' ? 'urgent' : 'today',
      title: reply.classification === 'positive' ? 'Qualified outreach reply' : 'Outreach reply needs classification',
      detail: 'Message bodies are never retained; open the outreach ledger to handle the reply.',
      owner: 'Elena',
      nextAction: reply.classification === 'positive' ? 'Route positive intent and schedule the next sales step' : 'Classify the reply and apply the correct stop state',
      dueAt: text(reply.received_at),
      attemptCount: 0,
      maxAttempts: 1,
      href: '/admin/outreach',
      sourceLabel: 'Reply inbox',
    });
  }

  for (const lead of leadRows.filter((row) => !['closed_won', 'closed_lost'].includes(String(row.status)))) {
    inbox.push({
      id: `lead:${lead.id}`,
      severity: lead.status === 'qualified' ? 'urgent' : 'today',
      title: lead.company ? `${lead.company} sales follow-up` : 'Sales follow-up',
      detail: `${titleCase(lead.request_type)} · ${titleCase(lead.status ?? 'new')}`,
      owner: titleCase(lead.owner ?? 'Elena'),
      nextAction: text(lead.next_action) ?? 'Schedule and record the next sales step',
      dueAt: text(lead.created_at),
      attemptCount: 0,
      maxAttempts: 3,
      href: '/admin/outreach',
      sourceLabel: 'Sales',
    });
  }

  const severityOrder = { urgent: 0, today: 1, normal: 2, watch: 3 } as const;
  inbox.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  activities.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    generatedAt: new Date().toISOString(),
    activities,
    inbox,
    campaigns: campaignRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: String(row.role),
      vertical: String(row.vertical),
      status: String(row.status),
      allocationPercent: number(row.allocation_percent),
    })),
    warnings: [...new Set(warnings)],
  };
}
