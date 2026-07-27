'use server';

import { revalidatePath } from 'next/cache';
import { runAgentLoopControl } from '@/lib/server/agent-loop-control';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import {
  classifyPriyaIdeaChannel,
  upsertPriyaResearchIdeas,
} from '@/lib/server/priya-research-ideas';

export async function addPriyaResearchIdea(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const title = String(formData.get('title') ?? '').trim();
  const sourceUrl = String(formData.get('sourceUrl') ?? '').trim();
  const evidence = String(formData.get('evidence') ?? '').trim();
  const recommendation = String(formData.get('recommendation') ?? '').trim();
  const sourceLabel = String(formData.get('sourceLabel') ?? '').trim();
  const replyDraft = String(formData.get('replyDraft') ?? '').trim();
  const channelInput = String(formData.get('channel') ?? '').trim();
  if (!title || !sourceUrl || !evidence || !recommendation) return;

  const channel = channelInput === 'reddit' || channelInput === 'twitter' || channelInput === 'google'
    ? channelInput
    : classifyPriyaIdeaChannel(sourceUrl);

  await upsertPriyaResearchIdeas(ctx.adminDb, [{
    channel,
    title,
    evidence,
    recommendation,
    sourceUrl,
    sourceLabel: sourceLabel || channel,
    replyDraft: replyDraft || null,
    audience: 'both',
    score: 75,
  }]);

  await runAgentLoopControl({ db: ctx.adminDb, seoBatch: 10 });
  revalidatePath('/admin/seo-ideas');
  revalidatePath('/admin/automation');
  revalidatePath('/admin/campaigns');
}
