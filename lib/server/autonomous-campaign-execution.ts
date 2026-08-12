import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgentLoopControl } from './agent-loop-control';
import { runSocialProofAgent, type SocialProductionEnv } from './social-proof-agent';
import { reconcilePublishedDistributionProofs } from './distribution-publication-proof';
import { loadContentInventoryHealth } from './content-inventory-health';

type Db = SupabaseClient<any, 'public', any>;

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

async function pendingSeoSocialDerivatives(db: Db): Promise<Array<{ id: string; content_id: string }>> {
  const { data, error } = await db
    .from('content_items')
    .select('id,content_id')
    .eq('content_type', 'social_post')
    .in('status', ['idea', 'brief', 'draft', 'approved'])
    .eq('metadata->>proposed_by', 'seo_agent')
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; content_id: string }>;
}

export async function runAutonomousCampaignExecution(args: {
  supabase: Db;
  appUrl: string;
  env?: SocialProductionEnv;
  now?: Date;
}): Promise<{
  loopsSynced: number;
  legacyNewslettersRetired: number;
  socialStatus: string;
  socialJobsCreated: number;
  publicationProofsRepaired: number;
  inventoryHealthy: boolean;
  inventoryReason: string | null;
  inventoryThrough: string | null;
  missingFormats: string;
}> {
  const now = args.now ?? new Date();
  const proofReconciliation = await reconcilePublishedDistributionProofs({
    db: args.supabase,
  });
  const loopControl = await runAgentLoopControl({ db: args.supabase, now });
  const pendingSocial = await pendingSeoSocialDerivatives(args.supabase);
  const social = await runSocialProofAgent({
    supabase: args.supabase,
    appUrl: args.appUrl,
    env: args.env,
    now,
    campaignOnly: false,
    campaignScopeRequired: true,
  });
  const queuedIds = new Set(social?.queuedContentItemIds ?? []);
  if (queuedIds.size > 0) {
    await Promise.all(pendingSocial.filter((item) => queuedIds.has(item.id)).map((item) =>
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
  const inventory = await loadContentInventoryHealth(args.supabase, now);

  return {
    loopsSynced: loopControl.synced,
    legacyNewslettersRetired: loopControl.legacyNewslettersRetired,
    socialStatus: social?.status ?? 'noop',
    socialJobsCreated: social?.jobsCreated ?? 0,
    publicationProofsRepaired: proofReconciliation.repaired,
    inventoryHealthy: inventory.healthy,
    inventoryReason: inventory.reason,
    inventoryThrough: inventory.inventoryThrough,
    missingFormats: inventory.missingFormats.join(','),
  };
}
