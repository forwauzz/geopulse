import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAgentStatuses } from './agent-console';
import { loadCampaignControlRoom } from './campaign-control-room';
import { structuredLogWithClientAndWait } from './structured-log';

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
    },
    urgent > 0 ? 'warning' : 'info',
  );

  let digestSent = false;
  const now = args.now ?? new Date();
  const recipient = args.env['MARKETING_REPORT_TO']?.trim()
    || args.env['BENCHMARK_DAILY_RECAP_TO']?.trim()
    || args.env['SELF_IMPROVEMENT_REPORT_TO']?.trim()
    || '';
  const resendKey = args.env['RESEND_API_KEY']?.trim() ?? '';
  const resendFrom = args.env['RESEND_FROM_EMAIL']?.trim() ?? '';
  if (room.actions.length > 0 && now.getUTCHours() === 12 && recipient && resendKey && resendFrom) {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await args.supabase
      .from('app_logs')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'chief_of_staff_campaign_digest_sent')
      .gte('created_at', dayStart.toISOString());
    if ((count ?? 0) === 0) {
      const rows = room.actions
        .slice(0, 12)
        .map((action) => `<li style="margin:0 0 16px"><strong>${escapeHtml(action.owner)}: ${escapeHtml(action.title)}</strong><br/>${escapeHtml(action.detail)}<br/><em>Next: ${escapeHtml(action.playbook)}</em></li>`)
        .join('');
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: [recipient],
          subject: `Maya: ${room.actions.length} campaign action${room.actions.length === 1 ? '' : 's'} need owners`,
          html: `<h1>Chief of Staff campaign brief</h1><p>${escapeHtml(room.summary)}</p><ol>${rows}</ol><p><a href="https://getgeopulse.com/admin/campaigns">Open Campaigns</a></p>`,
        }),
      });
      if (response.ok) {
        digestSent = true;
        await structuredLogWithClientAndWait(args.supabase, 'chief_of_staff_campaign_digest_sent', {
          recipient,
          urgent_actions: urgent,
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

  return { health: room.health, actions: room.actions.length, urgent, digestSent };
}
