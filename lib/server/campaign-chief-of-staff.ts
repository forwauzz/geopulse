import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAgentStatuses } from './agent-console';
import {
  attemptSafeCampaignRemediation,
  syncCampaignActionLoops,
} from './agent-loop-control';
import { loadCampaignControlRoom } from './campaign-control-room';
import { agentEmailSignatureHtml } from './email-theme';
import { structuredLogWithClientAndWait } from './structured-log';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export async function runCampaignChiefOfStaffCheck(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly env: Record<string, string | undefined>;
  readonly now?: Date;
}): Promise<{ health: string; actions: number; urgent: number; digestSent: boolean }> {
  const agents = await loadAgentStatuses(args.supabase, args.env);
  const room = await loadCampaignControlRoom({
    supabase: args.supabase,
    agents,
    now: args.now,
  });
  const now = args.now ?? new Date();
  const intelligence = await retrieveIntelligenceEvidence(args.supabase, {
    platformInternal: true,
    sourceKinds: [
      'report_delivery',
      'distribution_delivery',
      'outreach_delivery',
      'payment',
      'subscription',
    ],
    observedAfter: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    limit: 25,
  }).catch(() => ({
    status: 'insufficient_evidence' as const,
    evidence: [] as const,
    limitations: ['Continuous intelligence is pending.'],
  }));
  const remediated = await attemptSafeCampaignRemediation({
    db: args.supabase,
    actions: room.actions,
    now,
  });
  const loopSync = await syncCampaignActionLoops({
    db: args.supabase,
    actions: room.actions,
    resolved: remediated,
    now,
  });
  const urgent = room.actions.filter((action) => action.severity === 'now').length;
  await structuredLogWithClientAndWait(
    args.supabase,
    urgent > 0 ? 'chief_of_staff_campaign_escalation' : 'chief_of_staff_campaign_check',
    {
      health: room.health,
      tracked_campaigns: room.campaigns.length,
      open_actions: room.actions.length,
      urgent_actions: urgent,
      cron_healthy: room.cron.healthy,
      safely_remediated: remediated.size,
      loops_open: loopSync.open,
      loops_resolved: loopSync.resolved,
      intelligence_status: intelligence.status,
      intelligence_evidence_count: intelligence.evidence.length,
      intelligence_evidence_ids: intelligence.evidence.map((item) => item.evidenceId).join(','),
    },
    urgent > 0 ? 'warning' : 'info',
  );

  let digestSent = false;
  const recipient = args.env['MARKETING_REPORT_TO']?.trim()
    || args.env['BENCHMARK_DAILY_RECAP_TO']?.trim()
    || args.env['SELF_IMPROVEMENT_REPORT_TO']?.trim()
    || '';
  const resendKey = args.env['RESEND_API_KEY']?.trim() ?? '';
  const resendFrom = args.env['RESEND_FROM_EMAIL']?.trim() ?? '';
  if (now.getUTCHours() === 12 && recipient && resendKey && resendFrom) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const [{ data: founderRows }, { data: resolvedRows }] = await Promise.all([
      args.supabase
        .from('agent_work_loops')
        .select('id,title,detail,next_action,owner,blocker')
        .eq('founder_required', true)
        .in('state', ['assigned', 'executing', 'verifying', 'blocked'])
        .order('due_at', { ascending: true })
        .limit(12),
      args.supabase
        .from('agent_work_loops')
        .select('id,title,owner,evidence,resolved_at')
        .eq('state', 'completed')
        .gte('resolved_at', dayStart.toISOString())
        .order('resolved_at', { ascending: false })
        .limit(20),
    ]);
    const founderActions = founderRows ?? [];
    const resolvedActions = resolvedRows ?? [];
    const mode = founderActions.length > 0 ? 'attention' : resolvedActions.length > 0 ? 'resolved' : null;
    if (!mode) return { health: room.health, actions: loopSync.open, urgent, digestSent };
    const event = mode === 'attention'
      ? 'chief_of_staff_founder_attention_sent'
      : 'chief_of_staff_resolved_digest_sent';
    const { count } = await args.supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', event)
      .gte('created_at', dayStart.toISOString());
    if ((count ?? 0) === 0) {
      const rows = mode === 'attention'
        ? founderActions.map((action: any) =>
            `<li style="margin:0 0 16px"><strong>${escapeHtml(String(action.owner))}: ${escapeHtml(String(action.title))}</strong><br/>${escapeHtml(String(action.detail ?? ''))}<br/><em>Your decision: ${escapeHtml(String(action.next_action ?? action.blocker ?? 'Review this exception.'))}</em></li>`
          ).join('')
        : resolvedActions.map((action: any) =>
            `<li style="margin:0 0 16px"><strong>${escapeHtml(String(action.owner))}: ${escapeHtml(String(action.title))}</strong><br/>Resolved and verified at ${escapeHtml(String(action.resolved_at ?? now.toISOString()))}.</li>`
          ).join('');
      const subject = mode === 'attention'
        ? `Maya: ${founderActions.length} decision${founderActions.length === 1 ? '' : 's'} need your attention`
        : `Maya: we had ${resolvedActions.length} issue${resolvedActions.length === 1 ? '' : 's'} and they were resolved`;
      const heading = mode === 'attention'
        ? 'Only these decisions need you'
        : 'Issues found and resolved';
      const intro = mode === 'attention'
        ? 'Routine problems are being handled by the team. These items require founder authority.'
        : 'The team found the following issues, fixed them, and verified the result.';
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: [recipient],
          subject,
          html: `<h1>${heading}</h1><p>${intro}</p><ol>${rows}</ol><p><a href="https://getgeopulse.com/admin/campaigns">Open Loop Control</a></p>${agentEmailSignatureHtml('maya')}`,
        }),
      });
      if (response.ok) {
        digestSent = true;
        await structuredLogWithClientAndWait(args.supabase, event, {
          recipient,
          mode,
          founder_actions: founderActions.length,
          resolved_actions: resolvedActions.length,
        }, 'info');
      } else {
        await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_campaign_digest_failed', {
          recipient,
          urgent_actions: urgent,
          status: response.status,
        }, 'error');
      }
    }
  }

  return { health: room.health, actions: loopSync.open, urgent, digestSent };
}
