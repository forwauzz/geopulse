import type { SupabaseClient } from '@supabase/supabase-js';
import { emitMarketingEvent } from '@services/marketing-attribution/emit';

type LeadIdentity = { id: string; converted: boolean | null };

export async function markMonitorLeadConverted(args: {
  readonly supabase: SupabaseClient;
  readonly scanId: string | null;
  readonly email: string | null;
  readonly stripeEventId: string;
  readonly stripeSessionId: string;
}): Promise<number> {
  const matches: LeadIdentity[] = [];
  if (args.scanId) {
    const { data, error } = await args.supabase
      .from('leads')
      .select('id,converted')
      .eq('scan_id', args.scanId);
    if (error) throw new Error(`monitor_lead_scan_lookup_failed:${error.message}`);
    matches.push(...((data ?? []) as LeadIdentity[]));
  }
  if (args.email) {
    const { data, error } = await args.supabase
      .from('leads')
      .select('id,converted')
      .ilike('email', args.email);
    if (error) throw new Error(`monitor_lead_email_lookup_failed:${error.message}`);
    matches.push(...((data ?? []) as LeadIdentity[]));
  }

  const ids = [...new Set(matches.filter((lead) => !lead.converted).map((lead) => lead.id))];
  if (ids.length > 0) {
    const { error: updateError } = await args.supabase
      .from('leads')
      .update({ converted: true, converted_at: new Date().toISOString() })
      .in('id', ids);
    if (updateError) throw new Error(`monitor_lead_update_failed:${updateError.message}`);
  }

  await emitMarketingEvent(args.supabase, 'payment_completed', {
    scan_id: args.scanId,
    lead_id: ids[0] ?? null,
    email: args.email,
    idempotency_key: `stripe:${args.stripeEventId}:payment_completed`,
    metadata: {
      kind: 'monitor',
      stripe_event_id: args.stripeEventId,
      stripe_session_id: args.stripeSessionId,
      matched_lead_count: ids.length,
    },
  });
  return ids.length;
}
