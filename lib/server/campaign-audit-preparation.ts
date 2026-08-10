import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportQueueMessageV3 } from '@/lib/queue/report-job';
import type { ScanApiEnv } from '@/lib/server/cf-env';
import { resolveDefaultDeepAuditPageLimit } from '@/lib/server/deep-audit-page-limit';
import { resolveAgencyModelPolicy } from '@/lib/server/agency-model-policy';
import { structuredLog } from '@/lib/server/structured-log';

export type CampaignAuditContact = {
  readonly id: string;
  readonly email: string;
  readonly url: string;
  readonly company: string | null;
};

export type CampaignAuditPreparationResult = {
  readonly alreadyReady: number;
  readonly queued: number;
  readonly failed: number;
  readonly errors: readonly string[];
};

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

async function existingDeepAudit(supabase: SupabaseClient, domain: string): Promise<boolean> {
  const { data: scans, error } = await supabase
    .from('scans')
    .select('id')
    .eq('domain', domain)
    .is('user_id', null)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const ids = (scans ?? []).map((row: { id: string }) => row.id);
  if (ids.length === 0) return false;
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id')
    .in('scan_id', ids)
    .eq('type', 'deep_audit')
    .not('pdf_url', 'is', null)
    .limit(1)
    .maybeSingle();
  if (reportError) throw new Error(reportError.message);
  return Boolean(report?.id);
}

/** Queue internal report generation. V3 explicitly suppresses all prospect email delivery. */
export async function prepareCampaignAudits(args: {
  readonly supabase: SupabaseClient;
  readonly env: ScanApiEnv;
  readonly contacts: readonly CampaignAuditContact[];
}): Promise<CampaignAuditPreparationResult> {
  if (!args.env.SCAN_QUEUE) throw new Error('scan_queue_not_configured');
  const errors: string[] = [];
  let alreadyReady = 0;
  let queued = 0;
  let failed = 0;
  for (const contact of args.contacts.slice(0, 10)) {
    const domain = hostname(contact.url);
    if (!domain) {
      failed += 1;
      errors.push(`${contact.email}: invalid_url`);
      continue;
    }
    try {
      if (await existingDeepAudit(args.supabase, domain)) {
        alreadyReady += 1;
        continue;
      }
      const modelPolicy = await resolveAgencyModelPolicy({
        supabase: args.supabase,
        agencyAccountId: null,
        agencyClientId: null,
        productSurface: 'deep_audit',
        fallbackProvider: 'gemini',
        fallbackModelId: args.env.GEMINI_MODEL,
      });
      const { data: scan, error: scanError } = await args.supabase.from('scans').insert({
        url: contact.url,
        domain,
        status: 'queued',
        user_id: null,
        is_public: false,
        run_source: 'admin_manual',
        requested_model_policy: modelPolicy.requestedModelPolicy,
        effective_model: modelPolicy.effectiveModel,
      }).select('id').single();
      if (scanError || !scan?.id) throw new Error(scanError?.message ?? 'scan_insert_failed');
      const config = {
        page_limit: resolveDefaultDeepAuditPageLimit(args.env.DEEP_AUDIT_DEFAULT_PAGE_LIMIT ?? ''),
        render_mode: args.env.DEEP_AUDIT_BROWSER_RENDER_MODE || 'off',
        campaign_preview: true,
        contact_id: contact.id,
        model_policy: {
          requested_model_policy: modelPolicy.requestedModelPolicy,
          requested_provider: modelPolicy.requestedProvider,
          requested_model: modelPolicy.requestedModel,
          effective_provider: modelPolicy.effectiveProvider,
          effective_model: modelPolicy.effectiveModel,
          resolution_source: modelPolicy.source,
          fallback_reason: modelPolicy.fallbackReason,
        },
      };
      const { data: run, error: runError } = await args.supabase.from('scan_runs').insert({
        scan_id: scan.id,
        domain,
        mode: 'deep',
        config,
      }).select('id').single();
      if (runError || !run?.id) throw new Error(runError?.message ?? 'scan_run_insert_failed');
      const payload: ReportQueueMessageV3 = {
        v: 3,
        scanId: String(scan.id),
        scanRunId: String(run.id),
        customerEmail: 'reports@getgeopulse.com',
        paymentId: `campaign-preview:${String(contact.id)}`,
        stripeSessionId: 'campaign-preview',
        deliveryMode: 'campaign_preview',
      };
      await args.env.SCAN_QUEUE.send(JSON.stringify(payload));
      queued += 1;
      structuredLog('campaign_preview_audit_queued', { contactId: contact.id, scanId: scan.id, domain }, 'info');
    } catch (error) {
      failed += 1;
      errors.push(`${contact.email}: ${error instanceof Error ? error.message : 'unknown_error'}`);
    }
  }
  return { alreadyReady, queued, failed, errors };
}
