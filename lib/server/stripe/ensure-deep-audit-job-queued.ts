import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import type { ReportQueueMessageV2 } from '@/lib/queue/report-job';
import type { PaymentApiEnv } from '@/lib/server/cf-env';
import { resolveDefaultDeepAuditPageLimit } from '@/lib/server/deep-audit-page-limit';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

export type PaymentRow = { id: string; scan_id: string | null };

export type EnsureDeepAuditJobResult =
  | { ok: true; duplicate: true }
  | { ok: true; duplicate: false }
  | { ok: false; reason: string; status: number };

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

/**
 * Ensure a scan_run row exists and a queue message is sent when no deep_audit report row yet.
 */
export async function ensureDeepAuditJobQueued(
  supabase: SupabaseClient,
  env: PaymentApiEnv,
  session: Stripe.Checkout.Session,
  customerEmail: string,
  payment: PaymentRow,
  duplicateEvent: boolean
): Promise<EnsureDeepAuditJobResult> {
  if (!env.SCAN_QUEUE) {
    return { ok: false, reason: 'queue_not_configured', status: 503 };
  }

  if (!payment.scan_id) {
    return { ok: false, reason: 'payment_missing_scan_id', status: 500 };
  }

  const { data: report } = await supabase
    .from('reports')
    .select('id')
    .eq('scan_id', payment.scan_id)
    .eq('type', 'deep_audit')
    .maybeSingle();

  if (report?.id) {
    structuredLog('deep_audit_queue_skipped_existing_report', {
      scanId: payment.scan_id,
      paymentId: payment.id,
      duplicateEvent,
    }, 'info');
    return { ok: true, duplicate: true };
  }

  const { data: scanRow, error: scanErr } = await supabase
    .from('scans')
    .select('id,domain')
    .eq('id', payment.scan_id)
    .maybeSingle();

  if (scanErr || !scanRow?.domain) {
    return { ok: false, reason: scanErr?.message ?? 'scan_not_found', status: 500 };
  }

  const { data: existingRun } = await supabase
    .from('scan_runs')
    .select('id')
    .eq('scan_id', payment.scan_id)
    .maybeSingle();

  let scanRunId: string | undefined = existingRun?.id;

  if (!scanRunId) {
    const pageLimit = resolveDefaultDeepAuditPageLimit(env.DEEP_AUDIT_DEFAULT_PAGE_LIMIT);
    const { data: inserted, error: insertErr } = await supabase
      .from('scan_runs')
      .insert({
        scan_id: payment.scan_id,
        domain: scanRow.domain,
        mode: 'deep',
        config: {
          page_limit: pageLimit,
          render_mode: env.DEEP_AUDIT_BROWSER_RENDER_MODE || 'off',
        },
      })
      .select('id')
      .single();

    if (insertErr) {
      if (isUniqueViolation(insertErr)) {
        const { data: row } = await supabase
          .from('scan_runs')
          .select('id')
          .eq('scan_id', payment.scan_id)
          .maybeSingle();
        scanRunId = row?.id;
      } else {
        return { ok: false, reason: insertErr.message, status: 500 };
      }
    } else {
      scanRunId = inserted?.id;
    }
  }

  if (!scanRunId) {
    return { ok: false, reason: 'scan_run_missing', status: 500 };
  }

  const payload: ReportQueueMessageV2 = {
    v: 2,
    scanId: payment.scan_id,
    scanRunId,
    customerEmail,
    paymentId: payment.id,
    stripeSessionId: session.id,
  };

  try {
    await env.SCAN_QUEUE.send(JSON.stringify(payload));
  } catch {
    structuredError('deep_audit_queue_send_failed', {
      scanId: payment.scan_id,
      paymentId: payment.id,
      scanRunId,
      duplicateEvent,
    });
    return { ok: false, reason: 'queue_send_failed', status: 500 };
  }

  structuredLog('deep_audit_queue_enqueued', {
    scanId: payment.scan_id,
    paymentId: payment.id,
    scanRunId,
    duplicateEvent,
  }, 'info');

  return { ok: true, duplicate: duplicateEvent };
}

