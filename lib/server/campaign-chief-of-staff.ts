import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAgentStatuses } from './agent-console';
import {
  attemptSafeCampaignRemediation,
  syncCampaignActionLoops,
} from './agent-loop-control';
import { loadCampaignControlRoom } from './campaign-control-room';
import { agentEmailSignatureHtml } from './email-theme';
import { structuredLogWithClientAndWait } from './structured-log';
import { syncRuntimeIncidentLoops } from './runtime-incident-control';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import {
  loadDailyCompanyStandup,
  renderDailyCompanyStandupHtml,
} from './daily-company-standup';

export async function runCampaignChiefOfStaffCheck(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly env: Record<string, string | undefined>;
  readonly now?: Date;
}): Promise<{ health: string; actions: number; urgent: number; digestSent: boolean }> {
  const agents = await loadAgentStatuses(args.supabase, args.env);
  const runtimeIncidents = await syncRuntimeIncidentLoops({
    db: args.supabase,
    now: args.now,
  });
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
      runtime_incidents_active: runtimeIncidents.active,
      runtime_incidents_opened: runtimeIncidents.opened,
      runtime_incidents_escalated: runtimeIncidents.escalated,
      runtime_incidents_resolved: runtimeIncidents.resolved,
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
  if (now.getUTCHours() >= 12 && recipient && resendKey && resendFrom) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await args.supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'chief_of_staff_daily_standup_sent')
      .gte('created_at', dayStart.toISOString());
    if ((count ?? 0) === 0) {
      const standup = await loadDailyCompanyStandup({
        supabase: args.supabase,
        agents,
        now,
      });
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: [recipient],
          subject: `Maya: Daily company standup | ${standup.verdict}`,
          html: `${renderDailyCompanyStandupHtml(standup)}${agentEmailSignatureHtml('maya')}`,
        }),
      });
      if (response.ok) {
        digestSent = true;
        await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_daily_standup_sent', {
          recipient,
          verdict: standup.verdict,
          department_heads: standup.departments.length,
          verified_recurring_customers: standup.verifiedRecurringCustomers,
          completed_past_24h: standup.activity.completedPast24h,
          open_work: standup.activity.open,
          overdue_work: standup.activity.overdue,
          exhausted_work: standup.activity.exhausted,
          founder_actions: standup.founderDecisions.length,
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
