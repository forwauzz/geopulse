import type { ReportQueueMessage } from '../../lib/queue/report-job';
import { parseReportQueueMessage } from '../../lib/queue/report-job';
import { createServiceRoleClient } from '../../lib/supabase/service-role';
import { structuredLog } from '../../lib/server/structured-log';
import { buildDeepAuditMarkdown } from '../report/build-deep-audit-markdown';
import { buildDeepAuditPdfFromPayload } from '../report/build-deep-audit-pdf';
import { buildDeepAuditReportPayload } from '../report/deep-audit-report-payload';
import { DEEP_AUDIT_ATTACH_MAX_BYTES } from '../report/deep-audit-delivery-policy';
import { publicObjectUrl, uploadDeepAuditReportFiles } from '../report/r2-report-storage';
import type { DeepAuditDownloadLinks } from '../report/resend-delivery';
import { sendDeepAuditEmail } from '../report/resend-delivery';
import { GeminiProvider } from '../providers/gemini';
import { MAX_DEEP_AUDIT_PAGE_LIMIT } from '../../lib/server/deep-audit-page-limit';
import { parseCrawlPending, runDeepAuditCrawl } from '../scan-engine/deep-audit-crawl';
import { computeCategoryScores, letterGrade, type WeightedResult } from '../scan-engine/scoring';
import { replayReportJobFromDlq } from './dlq-replay';

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

function isUniqueViolation(err: { code?: string } | null): boolean {
  return err?.code === '23505';
}

function extractPageLimit(config: unknown): number {
  if (!config || typeof config !== 'object') return 10;
  const pl = (config as Record<string, unknown>)['page_limit'];
  return typeof pl === 'number' && pl > 0 ? Math.min(Math.floor(pl), MAX_DEEP_AUDIT_PAGE_LIMIT) : 10;
}

function extractChunkSize(config: unknown): number | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const c = (config as Record<string, unknown>)['chunk_size'];
  if (typeof c === 'number' && c > 0) return Math.min(Math.floor(c), 40);
  return undefined;
}

function averageScores(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round(sum / scores.length);
}

function issuesAsWeightedResults(pages: readonly { issues_json: unknown }[]): WeightedResult[] {
  const results: WeightedResult[] = [];
  for (const p of pages) {
    if (!Array.isArray(p.issues_json)) continue;
    for (const x of p.issues_json) {
      if (x === null || typeof x !== 'object') continue;
      const rec = x as Record<string, unknown>;
      results.push({
        id: String(rec['checkId'] ?? rec['check'] ?? ''),
        passed: rec['passed'] === true,
        status: (rec['status'] as WeightedResult['status']) ?? (rec['passed'] === true ? 'PASS' : 'FAIL'),
        finding: String(rec['finding'] ?? ''),
        weight: typeof rec['weight'] === 'number' ? rec['weight'] : 0,
        category: (rec['category'] as WeightedResult['category']) ?? 'ai_readiness',
        confidence: rec['confidence'] as WeightedResult['confidence'],
      });
    }
  }
  return results;
}

function topFailedIssuesFromPages(
  pages: readonly { issues_json: unknown }[]
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const allFailed: Record<string, unknown>[] = [];

  for (const p of pages) {
    if (!Array.isArray(p.issues_json)) continue;
    for (const x of p.issues_json) {
      if (x === null || typeof x !== 'object') continue;
      const rec = x as Record<string, unknown>;
      if (rec['passed'] !== false) continue;
      const key = String(rec['checkId'] ?? rec['check'] ?? '');
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      allFailed.push(rec);
    }
  }

  allFailed.sort(
    (a, b) => ((b['weight'] as number) ?? 0) - ((a['weight'] as number) ?? 0)
  );
  return allFailed.slice(0, 3);
}

async function resolveScanRunId(
  supabase: ReturnType<typeof createServiceRoleClient>,
  job: ReportQueueMessage
): Promise<string> {
  if (job.v === 2) return job.scanRunId;

  const { data: existing } = await supabase
    .from('scan_runs')
    .select('id')
    .eq('scan_id', job.scanId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: scan } = await supabase.from('scans').select('domain').eq('id', job.scanId).maybeSingle();
  if (!scan?.domain) {
    throw new Error('scan_not_found_for_legacy_queue');
  }

  const { data: ins, error } = await supabase
    .from('scan_runs')
    .insert({
      scan_id: job.scanId,
      domain: scan.domain,
      mode: 'deep',
      config: { page_limit: 10 },
    })
    .select('id')
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const { data: row } = await supabase.from('scan_runs').select('id').eq('scan_id', job.scanId).maybeSingle();
      if (row?.id) return row.id;
    }
    throw new Error(error.message);
  }
  if (!ins?.id) throw new Error('scan_run_insert_failed');
  return ins.id;
}

export async function dispatchQueueBatch(batch: ReportQueueBatch, env: CloudflareEnv): Promise<void> {
  if (batch.queue === DLQ_NAME) {
    for (const m of batch.messages) {
      try {
        await handleDlqMessage(bodyToString(m.body), env);
        m.ack();
      } catch (err) {
        structuredLog('dlq_handler_failed', {
          message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
        });
        m.retry();
      }
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

async function handleDlqMessage(rawBody: string, env: CloudflareEnv): Promise<void> {
  const job = parseReportQueueMessage(rawBody);
  if (!job) {
    structuredLog('dlq_invalid_payload', { rawLen: String(rawBody.length) });
    return;
  }
  if (!env.SCAN_QUEUE || !env.SCAN_CACHE) {
    throw new Error('dlq_missing_queue_or_kv');
  }
  await replayReportJobFromDlq(job, { SCAN_QUEUE: env.SCAN_QUEUE, SCAN_CACHE: env.SCAN_CACHE });
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
  if (!env.GEMINI_API_KEY || !env.GEMINI_ENDPOINT) {
    throw new Error('gemini_not_configured');
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

  const scanRunId = await resolveScanRunId(supabase, job);

  const { data: runRow, error: runErr } = await supabase
    .from('scan_runs')
    .select('id, config')
    .eq('id', scanRunId)
    .maybeSingle();

  if (runErr) throw new Error(runErr.message);
  if (!runRow?.id) {
    structuredLog('report_job_scan_run_not_found', { scanRunId });
    throw new Error('scan_run_not_found');
  }

  const pageLimit = extractPageLimit(runRow.config);
  const chunkSize = extractChunkSize(runRow.config);

  const crawlPending =
    runRow.config && typeof runRow.config === 'object'
      ? parseCrawlPending((runRow.config as Record<string, unknown>)['crawl_pending'])
      : null;

  const { count: pageCount, error: countErr } = await supabase
    .from('scan_pages')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', scanRunId);

  if (countErr) throw new Error(countErr.message);

  const shouldRunCrawl = (pageCount ?? 0) === 0 || crawlPending !== null;

  if (shouldRunCrawl) {
    const llm = new GeminiProvider({
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      GEMINI_MODEL: env.GEMINI_MODEL,
      GEMINI_ENDPOINT: env.GEMINI_ENDPOINT,
    });
    const crawl = await runDeepAuditCrawl(supabase, llm, {
      runId: scanRunId,
      seedUrl: scan.url,
      pageLimit,
      chunkSize,
    });
    if (!crawl.ok) {
      throw new Error(crawl.reason);
    }
    if (crawl.ok && crawl.phase === 'partial') {
      if (!env.SCAN_QUEUE) {
        throw new Error('scan_queue_not_configured_for_chunked_crawl');
      }
      await env.SCAN_QUEUE.send(rawBody);
      return;
    }
  }

  const { data: pageRows, error: pagesErr } = await supabase
    .from('scan_pages')
    .select('url,score,letter_grade,issues_json,status,section')
    .eq('run_id', scanRunId)
    .eq('status', 'fetched')
    .order('created_at', { ascending: true });

  if (pagesErr) throw new Error(pagesErr.message);

  const pages = pageRows ?? [];
  if (pages.length === 0) {
    structuredLog('deep_audit_no_pages_fetched', { scanRunId });
    throw new Error('deep_audit_no_pages_fetched');
  }

  const scores = pages.map((p) => p.score).filter((s): s is number => typeof s === 'number');
  const aggregateScore = averageScores(scores);
  const aggLetter = letterGrade(aggregateScore);

  const issuesForScan = topFailedIssuesFromPages(pages);

  const { data: runCoverage } = await supabase
    .from('scan_runs')
    .select('coverage_summary')
    .eq('id', scanRunId)
    .maybeSingle();

  const allWeighted = issuesAsWeightedResults(pages);
  const catScores = computeCategoryScores(allWeighted).map((cs) => ({
    category: cs.category,
    score: cs.score,
    letterGrade: cs.letterGrade,
    checkCount: cs.checkCount,
  }));

  const payload = buildDeepAuditReportPayload({
    scanId: job.scanId,
    runId: scanRunId,
    domain: scan.domain,
    seedUrl: scan.url,
    aggregateScore,
    aggregateLetterGrade: aggLetter,
    pages: pages.map((p) => ({
      url: p.url,
      score: p.score,
      letter_grade: p.letter_grade,
      issues_json: p.issues_json,
      section: p.section ?? null,
    })),
    coverageSummary: runCoverage?.coverage_summary ?? null,
    highlightedIssues: issuesForScan,
    categoryScores: catScores,
  });

  const fullResults = {
    deepAudit: true,
    reportPayloadVersion: 1 as const,
    payloadGeneratedAt: payload.generatedAt,
    pages: pages.map((p) => ({
      url: p.url,
      score: p.score,
      letterGrade: p.letter_grade,
      issues: p.issues_json,
    })),
  };

  const { error: scanUpdErr } = await supabase
    .from('scans')
    .update({
      score: aggregateScore,
      letter_grade: aggLetter,
      issues_json: issuesForScan,
      full_results_json: fullResults,
    })
    .eq('id', job.scanId);

  if (scanUpdErr) {
    throw new Error(scanUpdErr.message);
  }

  const pdfBytes = await buildDeepAuditPdfFromPayload(payload);
  const markdownText = buildDeepAuditMarkdown(payload);

  const bucket = env.REPORT_FILES;
  const publicBase = (env.DEEP_AUDIT_R2_PUBLIC_BASE ?? '').trim();

  let downloadLinks: DeepAuditDownloadLinks | undefined;
  let pdfUrl: string | null = null;

  if (bucket) {
    const keys = await uploadDeepAuditReportFiles(bucket, job.scanId, pdfBytes, markdownText);
    if (publicBase) {
      pdfUrl = publicObjectUrl(publicBase, keys.pdfKey);
      downloadLinks = {
        pdfUrl,
        markdownUrl: publicObjectUrl(publicBase, keys.markdownKey),
      };
    }
  }

  const oversize = pdfBytes.byteLength > DEEP_AUDIT_ATTACH_MAX_BYTES;
  const attachPdf = !oversize;
  if (oversize && !downloadLinks?.pdfUrl) {
    throw new Error('deep_audit_pdf_oversize_configure_r2_public_base');
  }

  const allIssueRows = Array.isArray(issuesForScan) ? issuesForScan : [];
  const failedForEmail = allIssueRows
    .filter((r: Record<string, unknown>) => r['passed'] === false)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => ((b['weight'] as number) ?? 0) - ((a['weight'] as number) ?? 0))
    .slice(0, 3)
    .map((r: Record<string, unknown>) => ({
      check: String(r['check'] ?? r['checkId'] ?? 'Check'),
      fix: r['fix'] ? String(r['fix']) : undefined,
      weight: typeof r['weight'] === 'number' ? r['weight'] : undefined,
    }));

  const emailResult = await sendDeepAuditEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM_EMAIL,
    to: job.customerEmail,
    domain: scan.domain,
    url: scan.url,
    pdfBytes,
    filename: `geo-pulse-deep-audit-${job.scanId}.pdf`,
    idempotencyKey: `deep-audit/${job.scanId}/${job.paymentId}`,
    attachPdf,
    downloadLinks,
    score: aggregateScore,
    grade: aggLetter,
    topIssues: failedForEmail,
    appUrl: (env.NEXT_PUBLIC_APP_URL ?? '').trim() || undefined,
    totalChecks: allIssueRows.length,
    passedChecks: allIssueRows.filter((r: Record<string, unknown>) => r['passed'] === true).length,
    scanId: job.scanId,
  });

  if (!emailResult.ok) {
    throw new Error(emailResult.message);
  }

  const now = new Date().toISOString();
  const { error: repErr } = await supabase.from('reports').insert({
    scan_id: job.scanId,
    user_id: null,
    guest_email: job.customerEmail.trim().toLowerCase(),
    pdf_url: pdfUrl,
    markdown_url: downloadLinks?.markdownUrl ?? null,
    report_payload_version: payload.version,
    pdf_generated_at: now,
    email_delivered_at: now,
    type: 'deep_audit',
  });

  if (repErr) {
    throw new Error(repErr.message);
  }
}
