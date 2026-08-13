import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAgentStatuses } from './agent-console';
import {
  attemptSafeCampaignRemediation,
  syncCampaignActionLoops,
} from './agent-loop-control';
import { loadCampaignControlRoom } from './campaign-control-room';
import { structuredLogWithClientAndWait } from './structured-log';
import { syncRuntimeIncidentLoops } from './runtime-incident-control';
import { retrieveIntelligenceEvidence } from '@/lib/intelligence/evidence-retrieval';
import {
  loadDailyCompanyStandup,
} from './daily-company-standup';
import { enqueueLifecycleEmail } from './lifecycle-email';
import {
  classifyFounderExceptions,
  founderExceptionSummary,
  unseenFounderExceptions,
  type FounderPurchase,
  type FounderQualifiedReply,
} from './founder-exception-notifications';

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
  if (now.getUTCHours() >= 12 && recipient) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const standup = await loadDailyCompanyStandup({
      supabase: args.supabase,
      agents,
      now,
    });
    const purchaseCutoff = new Date(now.getTime() - 48 * 60 * 60_000).toISOString();
    const signalCutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const [
      { data: purchaseRows },
      { data: recordedRows },
      { data: replyRows },
      { count: digestCount },
      { count: standupCount },
    ] = await Promise.all([
      args.supabase.from('payments').select('id,amount_cents,currency,type')
        .eq('status', 'complete').gte('created_at', purchaseCutoff).limit(100),
      args.supabase.from('app_logs').select('data')
        .eq('event', 'chief_of_staff_exception_signal_recorded')
        .gte('created_at', signalCutoff).order('created_at', { ascending: false }).limit(1000),
      args.supabase.from('app_logs').select('data')
        .eq('event', 'outreach_reply_received')
        .gte('created_at', purchaseCutoff).order('created_at', { ascending: false }).limit(100),
      args.supabase.from('app_logs').select('id', { count: 'exact', head: true })
        .eq('event', 'chief_of_staff_exception_digest_queued')
        .gte('created_at', dayStart.toISOString()),
      args.supabase.from('app_logs').select('id', { count: 'exact', head: true })
        .eq('event', 'chief_of_staff_daily_standup_recorded')
        .gte('created_at', dayStart.toISOString()),
    ]);
    if ((standupCount ?? 0) === 0) {
      await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_daily_standup_recorded', {
        verdict: standup.verdict,
        department_heads: standup.departments.length,
        verified_recurring_customers: standup.verifiedRecurringCustomers,
        completed_past_24h: standup.activity.completedPast24h,
        open_work: standup.activity.open,
        overdue_work: standup.activity.overdue,
        exhausted_work: standup.activity.exhausted,
        founder_actions: standup.founderDecisions.length,
        notification_policy: 'exception_only_v1',
        standup_json: JSON.stringify(standup),
      }, 'info');
    }
    const purchases = ((purchaseRows ?? []) as Array<{
      id: string; amount_cents: number; currency: string; type: string;
    }>).map((row): FounderPurchase => ({
      id: row.id,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      type: row.type,
    }));
    const recordedKeys = new Set(((recordedRows ?? []) as Array<{
      data: Record<string, unknown> | null;
    }>).flatMap((row) => typeof row.data?.['signal_key'] === 'string'
      ? [String(row.data['signal_key'])]
      : []));
    const qualifiedReplies = ((replyRows ?? []) as Array<{
      data: Record<string, unknown> | null;
    }>).flatMap((row): FounderQualifiedReply[] => {
      const data = row.data ?? {};
      return data['classification'] === 'positive'
        && data['matched'] === true
        && typeof data['provider_event_id'] === 'string'
        ? [{ providerEventId: String(data['provider_event_id']), forwarded: data['forwarded'] === true }]
        : [];
    });
    for (const reply of qualifiedReplies) {
      if (reply.forwarded) recordedKeys.add(`qualified_reply:${reply.providerEventId}`);
    }
    const signals = unseenFounderExceptions(classifyFounderExceptions({
      actions: room.actions,
      standup,
      purchases,
      qualifiedReplies,
    }), recordedKeys);
    if (signals.length > 0 && (digestCount ?? 0) === 0) {
      const queued = await enqueueLifecycleEmail({
        supabase: args.supabase,
        idempotencyKey: `founder-exceptions/${dayStart.toISOString().slice(0, 10)}`,
        eventType: 'founder_exception_digest',
        templateKey: 'founder_exception_digest',
        to: recipient,
        variables: {
          date: standup.reportDate,
          summary: founderExceptionSummary(signals),
          cta_url: `${(args.env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com').replace(/\/$/, '')}/admin/campaigns#loop-control`,
        },
      });
      if (queued.ok && queued.status === 'queued') {
        digestSent = true;
        for (const signal of signals) {
          await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_exception_signal_recorded', {
            signal_key: signal.signalKey,
            kind: signal.kind,
            delivery_id: queued.id ?? null,
          }, 'info');
        }
        await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_exception_digest_queued', {
          delivery_id: queued.id ?? null,
          signal_count: signals.length,
          kinds: [...new Set(signals.map((signal) => signal.kind))].join(','),
        }, 'info');
      } else {
        await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_exception_digest_failed', {
          reason: queued.reason ?? queued.status ?? 'queue_failed',
          signal_count: signals.length,
        }, 'error');
      }
    }
  }

  return { health: room.health, actions: loopSync.open, urgent, digestSent };
}
