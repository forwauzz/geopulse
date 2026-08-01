import { createServiceRoleClient } from '../lib/supabase/service-role';
import { CONTENT_SCHEDULE, validateContentSchedule, type ContentScheduleItem } from '../lib/server/content-schedule';
import { createDistributionEngineRepository } from '../lib/server/distribution-engine-repository';

const APPLY = process.argv.includes('--apply');
const TERMINAL_LOOP_STATES = new Set(['completed', 'dismissed']);
const TERMINAL_JOB_STATES = new Set(['published', 'cancelled']);

function postKind(item: ContentScheduleItem): 'single_image_post' | 'link_post' {
  return item.mediaUrl ? 'single_image_post' : 'link_post';
}

async function contentRowId(db: ReturnType<typeof createServiceRoleClient>, contentId: string | null): Promise<string | null> {
  if (!contentId) return null;
  const { data, error } = await db
    .from('content_items')
    .select('id')
    .eq('content_id', contentId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

async function reconcileAsset(
  db: ReturnType<typeof createServiceRoleClient>,
  repo: ReturnType<typeof createDistributionEngineRepository>,
  item: ContentScheduleItem,
): Promise<{ id: string; status: string }> {
  const current = await repo.getAssetByAssetId(item.assetId);
  const linkedContentId = await contentRowId(db, item.contentId);
  const keepStatus = current && ['scheduled', 'published'].includes(current.status) ? current.status : 'approved';
  const approvedAt = current?.approved_at ?? new Date().toISOString();
  const asset = await repo.upsertAsset({
    assetId: item.assetId,
    contentItemId: linkedContentId,
    sourceType: linkedContentId ? 'content_item' : 'manual',
    sourceKey: linkedContentId ? null : item.contentId ?? item.assetId,
    assetType: postKind(item),
    providerFamily: item.channel,
    title: item.title,
    bodyMarkdown: item.body,
    bodyPlaintext: item.body,
    captionText: item.channel === 'instagram' ? item.body : null,
    status: keepStatus,
    ctaUrl: item.ctaUrl,
    approvedAt,
    metadata: {
      owner: item.channel === 'linkedin' ? 'sofia' : 'jordan',
      accountable_owner: 'codex',
      schedule_policy: 'two_week_revenue_content_inventory_v1',
      scheduled_for: item.scheduledFor,
      campaign_role: item.campaignRole,
      funnel_stage: 'qualified traffic',
      approval_basis: 'founder-approved content cadence and existing approved source material',
      visual_qa: item.mediaUrl ? 'provider_ready' : 'not_applicable',
    },
  });

  const { error: lineageError } = await db
    .from('distribution_assets')
    .update({ growth_campaign_id: item.campaignId })
    .eq('id', asset.id);
  if (lineageError) throw lineageError;

  const currentMedia = await repo.listMediaForAsset(asset.id);
  const expectedMedia = item.mediaUrl
    ? [{
        mediaKind: 'image' as const,
        storageUrl: item.mediaUrl,
        mimeType: 'image/jpeg',
        altText: item.mediaAlt,
        providerReadyStatus: 'ready' as const,
        metadata: { visual_qa: 'approved', scheduled_asset: true },
      }]
    : [];
  const mediaMatches = currentMedia.length === expectedMedia.length && currentMedia.every((media, index) => (
    media.storage_url === expectedMedia[index]?.storageUrl
    && media.provider_ready_status === expectedMedia[index]?.providerReadyStatus
  ));
  if (!mediaMatches) await repo.replaceAssetMedia(asset.id, expectedMedia);
  return { id: asset.id, status: asset.status };
}

async function reconcileLinkedInLoop(
  db: ReturnType<typeof createServiceRoleClient>,
  item: ContentScheduleItem,
  distributionAssetId: string,
): Promise<string> {
  const sourceKey = `linkedin:${item.assetId}`;
  const { data: current, error: currentError } = await db
    .from('agent_work_loops')
    .select('id,state')
    .eq('source_type', 'manual_distribution')
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current && TERMINAL_LOOP_STATES.has(String(current.state))) return `preserved ${current.state}`;

  const { error } = await db.from('agent_work_loops').upsert({
    source_type: 'manual_distribution',
    source_key: sourceKey,
    lane: 'distribution',
    owner: 'sofia',
    state: current?.state ?? 'assigned',
    severity: 'normal',
    title: item.title,
    detail: 'Scheduled LinkedIn company-page post. Manual fallback is required until LinkedIn developer access is connected.',
    next_action: 'Codex/Sofia: publish through the logged-in GEO-Pulse LinkedIn company page, verify the live post, record its destination URL in metadata and evidence, then complete this loop.',
    due_at: item.scheduledFor,
    attempt_count: 0,
    max_attempts: 3,
    founder_required: false,
    blocker: null,
    metadata: {
      channel: 'linkedin',
      manual_publish: true,
      distribution_asset_id: distributionAssetId,
      growth_campaign_id: item.campaignId,
      campaign_role: item.campaignRole,
      funnel_stage: 'qualified traffic',
      accountable_owner: 'codex',
      execution_owner: 'sofia',
      publishing_route: 'logged_in_company_page',
      retry_policy: 'Retry browser publication up to three times; after three evidence-backed failures escalate as an unrecoverable incident.',
      success_condition: item.successCondition,
      stop_condition: item.stopCondition,
    },
  }, { onConflict: 'source_type,source_key' });
  if (error) throw error;
  return current ? 'updated' : 'created';
}

async function reconcileInstagramJob(
  db: ReturnType<typeof createServiceRoleClient>,
  repo: ReturnType<typeof createDistributionEngineRepository>,
  item: ContentScheduleItem,
  distributionAssetId: string,
): Promise<string> {
  const accounts = await repo.listAccounts({ providerName: 'instagram', status: 'connected' });
  if (accounts.length !== 1) {
    throw new Error(`Expected exactly one connected Instagram account; found ${accounts.length}.`);
  }
  const jobId = `scheduled:${item.assetId}`;
  const current = await repo.getJobByJobId(jobId);
  if (current && TERMINAL_JOB_STATES.has(current.status)) return `preserved ${current.status}`;
  if (current) {
    const { error } = await db.from('distribution_jobs').update({
      distribution_account_id: accounts[0]!.id,
      publish_mode: 'scheduled',
      scheduled_for: item.scheduledFor,
      status: 'scheduled',
      last_error: null,
    }).eq('id', current.id);
    if (error) throw error;
  } else {
    await repo.createJob({
      jobId,
      distributionAssetId,
      distributionAccountId: accounts[0]!.id,
      publishMode: 'scheduled',
      scheduledFor: item.scheduledFor,
      status: 'scheduled',
    });
  }
  const { error: assetError } = await db
    .from('distribution_assets')
    .update({ status: 'scheduled' })
    .eq('id', distributionAssetId)
    .neq('status', 'published');
  if (assetError) throw assetError;
  return current ? 'updated' : 'created';
}

async function main(): Promise<void> {
  const errors = validateContentSchedule(CONTENT_SCHEDULE);
  if (errors.length > 0) throw new Error(`Invalid content schedule:\n- ${errors.join('\n- ')}`);

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    linkedin: CONTENT_SCHEDULE.filter((item) => item.channel === 'linkedin').map((item) => ({ at: item.scheduledFor, title: item.title })),
    instagram: CONTENT_SCHEDULE.filter((item) => item.channel === 'instagram').map((item) => ({ at: item.scheduledFor, title: item.title })),
  }, null, 2));
  if (!APPLY) return;

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim();
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  const db = createServiceRoleClient(url, key);
  const repo = createDistributionEngineRepository(db as never);
  const outcomes: Array<Record<string, string>> = [];

  for (const item of CONTENT_SCHEDULE) {
    const asset = await reconcileAsset(db, repo, item);
    const route = item.channel === 'linkedin'
      ? await reconcileLinkedInLoop(db, item, asset.id)
      : await reconcileInstagramJob(db, repo, item, asset.id);
    outcomes.push({ assetId: item.assetId, channel: item.channel, scheduledFor: item.scheduledFor, route });
  }
  console.log(JSON.stringify({ applied: outcomes }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
