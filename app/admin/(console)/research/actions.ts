'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { runResearchSweep } from '@/lib/server/research-agent';
import { structuredLog } from '@/lib/server/structured-log';

/**
 * Approve/reject a proposal. Approving records the decision ONLY — per spec §8.1 the
 * human then makes the actual spec/catalog change by hand; the agent has no write
 * path to production config.
 */
export async function reviewResearchProposal(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('proposalId') ?? '').trim();
  const decision = String(formData.get('decision') ?? '');
  if (!id || (decision !== 'approved' && decision !== 'rejected')) return;

  await ctx.adminDb
    .from('research_proposals')
    .update({ status: decision, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');

  structuredLog('research_proposal_reviewed', { decision }, 'info');
  revalidatePath('/admin/research');
}

export async function toggleWatchlistSource(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const id = String(formData.get('watchId') ?? '').trim();
  const enable = String(formData.get('enable') ?? '') === 'true';
  if (!id) return;

  await ctx.adminDb.from('research_watchlist').update({ enabled: enable }).eq('id', id);
  revalidatePath('/admin/research');
}

/** Adding a source is a logged human decision (spec §8.1 — no silent scope creep). */
export async function addWatchlistSource(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const url = String(formData.get('url') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const tierRaw = Number(formData.get('tier') ?? 3);
  const tier = tierRaw === 1 || tierRaw === 2 ? tierRaw : 3;
  const specSection = String(formData.get('specSection') ?? '').trim() || 'unmapped';

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return;
  } catch {
    return;
  }
  if (!label) return;

  await ctx.adminDb.from('research_watchlist').insert({
    url,
    label,
    tier,
    spec_section: specSection,
    enabled: true,
    added_by: ctx.user.id,
  });
  structuredLog('research_watchlist_added', { tier, specSection }, 'info');
  revalidatePath('/admin/research');
}

export async function runResearchSweepNow(): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;

  const env = await getScanApiEnv();
  await runResearchSweep({
    supabase: ctx.adminDb,
    ai: (env as unknown as { AI?: { run: (m: string, i: Record<string, unknown>) => Promise<unknown> } }).AI ?? null,
    nowMs: Date.now(),
  });
  revalidatePath('/admin/research');
}
