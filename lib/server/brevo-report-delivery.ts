import { z } from 'zod';

export const brevoReportDeliveryStatusSchema = z.enum(['prepared', 'synced', 'sending', 'delivered', 'failed', 'uncertain']);
export type BrevoReportDeliveryStatus = z.infer<typeof brevoReportDeliveryStatusSchema>;
export type BrevoReportDelivery = {
  readonly id: string; readonly agencyAccountId: string; readonly connectorAccountId: string;
  readonly batchId: string; readonly providerContactId: string; readonly generationId: string;
  readonly status: BrevoReportDeliveryStatus; readonly reportUrl: string; readonly thumbnailUrl: string;
  readonly recipientEmail: string; readonly providerMessageId: string | null; readonly attempts: number;
  readonly errorCode: string | null; readonly syncedAt: string | null; readonly deliveredAt: string | null;
};

type Row = {
  id: string; agency_account_id: string; connector_account_id: string; batch_id: string;
  provider_contact_id: string; generation_id: string; status: string; report_url: string;
  thumbnail_url: string; recipient_email: string; provider_message_id: string | null;
  attempts: number; error_code: string | null; synced_at: string | null; delivered_at: string | null;
};
type Supabase = { from(table: string): any };
function fromRow(row: Row): BrevoReportDelivery {
  return {
    id: row.id, agencyAccountId: row.agency_account_id, connectorAccountId: row.connector_account_id,
    batchId: row.batch_id, providerContactId: row.provider_contact_id, generationId: row.generation_id,
    status: brevoReportDeliveryStatusSchema.parse(row.status), reportUrl: row.report_url,
    thumbnailUrl: row.thumbnail_url, recipientEmail: row.recipient_email,
    providerMessageId: row.provider_message_id, attempts: row.attempts, errorCode: row.error_code,
    syncedAt: row.synced_at, deliveredAt: row.delivered_at,
  };
}

export function createBrevoReportDeliveryRepository(supabase: Supabase) {
  return {
    async load(args: { agencyAccountId: string; batchId: string; providerContactId: string; generationId: string }) {
      const { data, error } = await supabase.from('crm_report_deliveries').select('*')
        .eq('agency_account_id', args.agencyAccountId).eq('batch_id', args.batchId)
        .eq('provider_contact_id', args.providerContactId).eq('generation_id', args.generationId).maybeSingle();
      if (error) throw error; return data ? fromRow(data as Row) : null;
    },
    async prepare(args: {
      agencyAccountId: string; connectorAccountId: string; batchId: string; providerContactId: string;
      generationId: string; reportUrl: string; thumbnailUrl: string; recipientEmail: string; userId: string;
    }) {
      const existing = await this.load(args);
      if (existing) return existing;
      const { data, error } = await supabase.from('crm_report_deliveries').insert({
        agency_account_id: args.agencyAccountId, connector_account_id: args.connectorAccountId,
        batch_id: args.batchId, provider_contact_id: args.providerContactId, generation_id: args.generationId,
        report_url: z.string().url().parse(args.reportUrl), thumbnail_url: z.string().url().parse(args.thumbnailUrl),
        recipient_email: z.string().email().parse(args.recipientEmail.toLowerCase()), created_by_user_id: args.userId,
      }).select('*').single();
      if (error || !data) {
        const raced = await this.load(args); if (raced) return raced;
        throw error ?? new Error('brevo_delivery_prepare_failed');
      }
      return fromRow(data as Row);
    },
    async markSynced(id: string, agencyAccountId: string) {
      const { data, error } = await supabase.from('crm_report_deliveries').update({
        status: 'synced', synced_at: new Date().toISOString(), error_code: null,
      }).eq('id', id).eq('agency_account_id', agencyAccountId).in('status', ['prepared', 'failed']).select('*').maybeSingle();
      if (error) throw error; return data ? fromRow(data as Row) : null;
    },
    async claimSend(delivery: BrevoReportDelivery) {
      if (!['synced', 'failed'].includes(delivery.status)) return null;
      const { data, error } = await supabase.from('crm_report_deliveries').update({
        status: 'sending', attempts: delivery.attempts + 1, error_code: null,
      }).eq('id', delivery.id).eq('agency_account_id', delivery.agencyAccountId)
        .eq('status', delivery.status).eq('attempts', delivery.attempts).select('*').maybeSingle();
      if (error) throw error; return data ? fromRow(data as Row) : null;
    },
    async markDelivered(id: string, agencyAccountId: string, providerMessageId: string) {
      const { data, error } = await supabase.from('crm_report_deliveries').update({
        status: 'delivered', provider_message_id: providerMessageId, delivered_at: new Date().toISOString(), error_code: null,
      }).eq('id', id).eq('agency_account_id', agencyAccountId).eq('status', 'sending').select('*').maybeSingle();
      if (error || !data) throw error ?? new Error('brevo_delivery_confirmation_failed'); return fromRow(data as Row);
    },
    async markUncertain(id: string, agencyAccountId: string, errorCode: string) {
      const { data, error } = await supabase.from('crm_report_deliveries').update({
        status: 'uncertain', error_code: errorCode.slice(0, 120),
      }).eq('id', id).eq('agency_account_id', agencyAccountId).eq('status', 'sending').select('*').maybeSingle();
      if (error) throw error; return data ? fromRow(data as Row) : null;
    },
    async markFailed(id: string, agencyAccountId: string, errorCode: string) {
      const { data, error } = await supabase.from('crm_report_deliveries').update({
        status: 'failed', error_code: errorCode.slice(0, 120),
      }).eq('id', id).eq('agency_account_id', agencyAccountId).eq('status', 'sending').select('*').maybeSingle();
      if (error) throw error; return data ? fromRow(data as Row) : null;
    },
  };
}
