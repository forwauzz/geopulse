import { parseReportQueueMessage } from '../../lib/queue/report-job';
import { createServiceRoleClient } from '../../lib/supabase/service-role';
import { structuredLog } from '../../lib/server/structured-log';
import { buildDeepAuditPdf } from '../report/build-deep-audit-pdf';
import { sendDeepAuditEmail } from '../report/resend-delivery';

const DLQ_NAME = 'geo-pulse-dlq';

type QueueMessage = {
  readonly body: string | ArrayBuffer | Uint8Array;
  ack(): void;
  retry(): void;
};

/** Shape of Cloudflare Queues `MessageBatch` used by `workers/cloudflare-entry.ts`. */
export type ReportQueueBatch = {
  readonly queue: string;
  readonly messages: readonly QueueMessage[];
};

function bodyToString(body: string | ArrayBuffer | Uint8Array): string {
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  return new TextDecoder().decode(body);
}

export async function dispatchQueueBatch(batch: ReportQueueBatch, env: CloudflareEnv): Promise<void> {
  if (batch.queue === DLQ_NAME) {
    for (const m of batch.messages) {
      const len =
        typeof m.body === 'string'
          ? m.body.length
          : m.body instanceof ArrayBuffer
            ? m.body.byteLength
            : m.body.length;
      structuredLog('dlq_message_received', {
        bodyChars: String(len),
        queue: batch.queue,
      });
      m.ack();
    }
    return;
  }

  for (const m of batch.messages) {
    try {
      await processReportJob(bodyToString(m.body), env);
      m.ack();
    } catch (err) {
      structuredLog('report_job_failed', {
        message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
      });
      m.retry();
    }
  }
}

async function processReportJob(rawBody: string, env: CloudflareEnv): Promise<void> {
  const job = parseReportQueueMessage(rawBody);
  if (!job) {
    structuredLog('report_job_invalid_payload', { rawLen: String(rawBody.length) });
    return;
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('supabase_not_configured');
  }
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    throw new Error('resend_not_configured');
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: scan, error: scanErr } = await supabase
    .from('scans')
    .select('id,url,domain,score,letter_grade,issues_json,full_results_json')
    .eq('id', job.scanId)
    .maybeSingle();

  if (scanErr) {
    throw new Error(scanErr.message);
  }
  if (!scan) {
    structuredLog('report_job_scan_not_found', { scanId: job.scanId });
    return;
  }

  const { data: existingReport } = await supabase
    .from('reports')
    .select('id')
    .eq('scan_id', job.scanId)
    .eq('type', 'deep_audit')
    .maybeSingle();

  if (existingReport?.id) {
    structuredLog('report_job_already_delivered', { scanId: job.scanId });
    return;
  }

  const issues = scan.full_results_json ?? scan.issues_json;
  const pdfBytes = await buildDeepAuditPdf({
    url: scan.url,
    domain: scan.domain,
    score: scan.score,
    letterGrade: scan.letter_grade,
    issuesJson: issues,
  });

  const emailResult = await sendDeepAuditEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    to: job.customerEmail,
    domain: scan.domain,
    url: scan.url,
    pdfBytes,
    filename: `geo-pulse-deep-audit-${job.scanId}.pdf`,
  });

  if (!emailResult.ok) {
    throw new Error(emailResult.message);
  }

  const now = new Date().toISOString();
  const { error: repErr } = await supabase.from('reports').insert({
    scan_id: job.scanId,
    user_id: null,
    guest_email: job.customerEmail,
    pdf_generated_at: now,
    email_delivered_at: now,
    type: 'deep_audit',
  });

  if (repErr) {
    throw new Error(repErr.message);
  }
}
