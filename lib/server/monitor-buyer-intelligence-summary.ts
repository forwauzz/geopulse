import type { SupabaseClient } from '@supabase/supabase-js';
import { buildBuyerIntelligenceView } from '../intelligence/buyer-intelligence-view-model';
import { createBuyerIntelligenceSnapshotRepository } from './buyer-intelligence-snapshot-repository';

function canonicalHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]!.replace(/^www\./, '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]!);
}

export function renderCanonicalMonitorSummary(view: ReturnType<typeof buildBuyerIntelligenceView>): string {
  if (view.kind !== 'monthly_brief') throw new Error('monitor_summary_requires_monthly_brief');
  const changes = view.change?.changes ?? [];
  const improved = changes.filter((item) => item.direction === 'improved').length;
  const regressed = changes.filter((item) => item.direction === 'regressed').length;
  return `<div style="margin:24px 0;padding:20px;border:1px solid #d9dce4;border-radius:14px;background:#f8f8fb">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#565e74">Buyer intelligence update</p>
    <h2 style="margin:0 0 10px;font-size:20px;color:#181b22">${escapeHtml(view.headline)}</h2>
    <p style="margin:0;color:#4d5360;line-height:1.55">${escapeHtml(view.summary)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#4d5360">${improved} improved · ${regressed} regressed · ${view.unavailableMeasurements.length} unavailable</p>
  </div>`;
}

/** Load canonical intelligence only when the recipient user belongs to the matching client account. */
export async function loadCanonicalMonitorSummary(args: {
  readonly supabase: SupabaseClient;
  readonly userId: string | null;
  readonly domain: string;
}): Promise<string | null> {
  if (!args.userId) return null;
  const host = canonicalHost(args.domain);
  const { data: clients, error: clientError } = await args.supabase
    .from('agency_clients')
    .select('id,agency_account_id')
    .eq('canonical_domain', host)
    .eq('status', 'active')
    .limit(10);
  if (clientError) throw clientError;
  if (!clients?.length) return null;
  const accountIds = [...new Set(clients.map((row: any) => String(row.agency_account_id)))];
  const { data: memberships, error: membershipError } = await args.supabase
    .from('agency_users')
    .select('agency_account_id')
    .eq('user_id', args.userId)
    .eq('status', 'active')
    .in('agency_account_id', accountIds);
  if (membershipError) throw membershipError;
  const authorized = new Set((memberships ?? []).map((row: any) => String(row.agency_account_id)));
  const client = clients.find((row: any) => authorized.has(String(row.agency_account_id)));
  if (!client) return null;
  const [snapshot] = await createBuyerIntelligenceSnapshotRepository(args.supabase).list(
    { type: 'agency_client', id: String(client.id) },
    { eligibility: 'eligible', limit: 1 },
  );
  if (!snapshot) return null;
  return renderCanonicalMonitorSummary(buildBuyerIntelligenceView({ kind: 'monthly_brief', snapshot }));
}
