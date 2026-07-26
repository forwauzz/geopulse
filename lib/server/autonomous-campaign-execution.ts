import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgentLoopControl } from './agent-loop-control';
import { createDistributionEngineRepository } from './distribution-engine-repository';
import { runSocialProofAgent, type SocialProductionEnv } from './social-proof-agent';
import { reconcilePublishedDistributionProofs } from './distribution-publication-proof';

type Db = SupabaseClient<any, 'public', any>;

type NewsletterRow = {
  id: string;
  content_id: string;
  title: string;
  draft_markdown: string | null;
  canonical_url: string | null;
  metadata: Record<string, unknown> | null;
};

const NEWSLETTER_PROVIDERS = new Set(['buttondown', 'kit', 'ghost']);

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);
}

async function markContentLoopExecuting(args: {
  db: Db;
  contentId: string;
  evidence: Record<string, unknown>;
  now: Date;
}): Promise<void> {
  const { data: loop } = await args.db
    .from('agent_work_loops')
    .select('id,attempt_count,max_attempts')
    .eq('source_type', 'content_item')
    .eq('source_key', args.contentId)
    .maybeSingle();
  if (!loop?.id) return;

  await args.db
    .from('agent_work_loops')
    .update({
      state: 'executing',
      attempt_count: Math.min(
        Number(loop.attempt_count ?? 0) + 1,
        Number(loop.max_attempts ?? 3),
      ),
      last_attempted_at: args.now.toISOString(),
      evidence: args.evidence,
      founder_required: false,
      blocker: null,
    })
    .eq('id', loop.id);
}

async function markContentLoopBlocked(args: {
  db: Db;
  contentId: string;
  blocker: string;
  now: Date;
}): Promise<void> {
  await args.db
    .from('agent_work_loops')
    .update({
      state: 'blocked',
      founder_required: true,
      blocker: args.blocker,
      evidence: { verification: 'publishing_connector_missing' },
      last_attempted_at: args.now.toISOString(),
    })
    .eq('source_type', 'content_item')
    .eq('source_key', args.contentId)
    .in('state', ['assigned', 'executing', 'verifying', 'blocked']);
}

export async function dispatchPreparedSeoNewsletters(args: {
  supabase: Db;
  now?: Date;
  limit?: number;
}): Promise<{ prepared: number; jobsCreated: number; skippedNoAccount: number }> {
  const now = args.now ?? new Date();
  const repo = createDistributionEngineRepository(args.supabase);
  const accounts = (await repo.listAccounts({ status: 'connected' }))
    .filter((account) => NEWSLETTER_PROVIDERS.has(account.provider_name));
  const account = accounts[0] ?? null;

  const { data, error } = await args.supabase
    .from('content_items')
    .select('id,content_id,title,draft_markdown,canonical_url,metadata')
    .eq('content_type', 'newsletter')
    .in('status', ['draft', 'approved'])
    .eq('metadata->>derived_from_canonical', 'true')
    .order('updated_at', { ascending: true })
    .limit(args.limit ?? 5);
  if (error) throw error;

  const rows = (data ?? []) as NewsletterRow[];
  if (!account) {
    await Promise.all(rows.map((item) =>
      markContentLoopBlocked({
        db: args.supabase,
        contentId: item.content_id,
        now,
        blocker:
          'Connect one newsletter destination (Buttondown, Kit, or Ghost) so Jordan can send this issue.',
      })
    ));
    return { prepared: rows.length, jobsCreated: 0, skippedNoAccount: rows.length };
  }

  let jobsCreated = 0;
  for (const item of rows) {
    if (!item.draft_markdown?.trim()) continue;
    const assetId = stableId(`seo-newsletter-${item.id}-${account.account_id}`);
    const asset = await repo.upsertAsset({
      assetId,
      contentItemId: item.id,
      sourceType: 'content_item',
      assetType: 'newsletter_email',
      providerFamily: 'newsletter',
      title: item.title,
      bodyMarkdown: item.draft_markdown,
      bodyPlaintext: item.draft_markdown,
      status: 'approved',
      ctaUrl: item.canonical_url,
      metadata: {
        created_by_agent: 'jordan',
        execution_owner: 'maya',
        seo_derivative: true,
        content_id: item.content_id,
      },
    });
    const jobId = stableId(`seo-newsletter-job-${item.id}-${account.account_id}`);
    const existingJob = await repo.getJobByJobId(jobId);
    if (!existingJob) {
      await repo.createJob({
        jobId,
        distributionAssetId: asset.id,
        distributionAccountId: account.id,
        publishMode: 'publish_now',
        status: 'queued',
      });
      jobsCreated += 1;
    }
    await markContentLoopExecuting({
      db: args.supabase,
      contentId: item.content_id,
      now,
      evidence: {
        distribution_asset_id: asset.id,
        distribution_job_id: existingJob?.id ?? jobId,
        provider: account.provider_name,
        verification: 'provider_publication_pending',
      },
    });
  }

  return { prepared: rows.length, jobsCreated, skippedNoAccount: 0 };
}

async function pendingSeoSocialDerivatives(db: Db): Promise<Array<{ content_id: string }>> {
  const { data, error } = await db
    .from('content_items')
    .select('content_id')
    .eq('content_type', 'social_post')
    .in('status', ['idea', 'brief', 'draft', 'approved'])
    .eq('metadata->>derived_from_canonical', 'true')
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Array<{ content_id: string }>;
}

export async function runAutonomousCampaignExecution(args: {
  supabase: Db;
  appUrl: string;
  env?: SocialProductionEnv;
  now?: Date;
}): Promise<{
  loopsSynced: number;
  newslettersPrepared: number;
  newsletterJobsCreated: number;
  socialStatus: string;
  socialJobsCreated: number;
  publicationProofsRepaired: number;
}> {
  const now = args.now ?? new Date();
  const proofReconciliation = await reconcilePublishedDistributionProofs({
    db: args.supabase,
  });
  const loopControl = await runAgentLoopControl({ db: args.supabase, now });
  const newsletters = await dispatchPreparedSeoNewsletters({
    supabase: args.supabase,
    now,
  });
  const pendingSocial = await pendingSeoSocialDerivatives(args.supabase);
  const social = pendingSocial.length > 0
    ? await runSocialProofAgent({
        supabase: args.supabase,
        appUrl: args.appUrl,
        env: args.env,
        now,
      })
    : null;
  if ((social?.jobsCreated ?? 0) > 0) {
    await Promise.all(pendingSocial.map((item) =>
      markContentLoopExecuting({
        db: args.supabase,
        contentId: item.content_id,
        now,
        evidence: {
          social_jobs_created: social?.jobsCreated ?? 0,
          verification: 'provider_publication_pending',
        },
      })
    ));
  }

  return {
    loopsSynced: loopControl.synced,
    newslettersPrepared: newsletters.prepared,
    newsletterJobsCreated: newsletters.jobsCreated,
    socialStatus: social?.status ?? 'noop',
    socialJobsCreated: social?.jobsCreated ?? 0,
    publicationProofsRepaired: proofReconciliation.repaired,
  };
}
