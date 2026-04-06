import type { ReportQueueMessage } from '../../lib/queue/report-job';
import { parseReportQueueMessage } from '../../lib/queue/report-job';
import { rewriteLayerOneReportInternal } from '../../lib/server/layer-one-report-internal-rewrite';
import { createServiceRoleClient } from '../../lib/supabase/service-role';
import { writeGeneratedReportEval } from '../../lib/server/report-eval-writer';
import { structuredLog } from '../../lib/server/structured-log';
import { buildDeepAuditMarkdown } from '../report/build-deep-audit-markdown';
import { buildDeepAuditPdfFromPayload } from '../report/build-deep-audit-pdf';
import { buildDeepAuditReportPayload } from '../report/deep-audit-report-payload';
import { DEEP_AUDIT_ATTACH_MAX_BYTES } from '../report/deep-audit-delivery-policy';
import {
  publicObjectUrl,
  uploadDeepAuditReportFiles,
  uploadDeepAuditRewrittenMarkdown,
} from '../report/r2-report-storage';
import type { DeepAuditDownloadLinks } from '../report/resend-delivery';
import { sendDeepAuditEmail } from '../report/resend-delivery';
import { GeminiProvider } from '../providers/gemini';
import { MAX_DEEP_AUDIT_PAGE_LIMIT } from '../../lib/server/deep-audit-page-limit';
import { browserRenderConfigFromEnv } from '../scan-engine/browser-rendering';
import { parseCrawlPending, runDeepAuditCrawl } from '../scan-engine/deep-audit-crawl';
import { computeCategoryScores, letterGrade, type WeightedResult } from '../scan-engine/scoring';
import { replayReportJobFromDlq } from './dlq-replay';
import { resolveStartupRolloutFlagsFromMetadata } from '../../lib/server/startup-rollout-flags';
import { resolveStartupWorkspaceBundleKey } from '../../lib/server/startup-github-integration';
import { resolveServiceEntitlement } from '../../lib/server/service-entitlements';
import { resolveServiceBillingGuard } from '../../lib/server/service-billing-guard';
import {
  createStartupSlackDeliveryEvent,
  getStartupSlackDestination,
  listStartupSlackDestinations,
  sendStartupSlackMessage,
  updateStartupSlackDeliveryEventStatus,
} from '../../lib/server/startup-slack-integration';
import { formatStartupSlackMessage, type StartupSlackMessagePayload } from '../../lib/server/startup-slack-message';

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

function extractBrowserRenderMode(config: unknown): string {
  if (!config || typeof config !== 'object') return 'off';
  const mode = (config as Record<string, unknown>)['render_mode'];
  return typeof mode === 'string' && mode.length > 0 ? mode : 'off';
}

function extractEffectiveModel(config: unknown, fallbackModel: string): string {
  if (!config || typeof config !== 'object') return fallbackModel;
  const modelPolicy = (config as Record<string, unknown>)['model_policy'];
  if (!modelPolicy || typeof modelPolicy !== 'object') return fallbackModel;
  const effectiveModel = (modelPolicy as Record<string, unknown>)['effective_model'];
  return typeof effectiveModel === 'string' && effectiveModel.length > 0
    ? effectiveModel
    : fallbackModel;
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

function statusRank(status: string | undefined): number {
  switch (status) {
    case 'FAIL':
      return 5;
    case 'BLOCKED':
      return 4;
    case 'LOW_CONFIDENCE':
      return 3;
    case 'WARNING':
      return 2;
    case 'PASS':
      return 1;
    case 'NOT_EVALUATED':
      return 0;
    default:
      return 0;
  }
}

function buildSitewideIssueSummaryFromPages(
  pages: readonly { issues_json: unknown }[]
): Record<string, unknown>[] {
  const byCheck = new Map<string, Record<string, unknown>>();

  for (const p of pages) {
    if (!Array.isArray(p.issues_json)) continue;
    for (const x of p.issues_json) {
      if (x === null || typeof x !== 'object') continue;
      const rec = x as Record<string, unknown>;
      const key = String(rec['checkId'] ?? rec['check'] ?? '');
      if (!key) continue;

      const current = byCheck.get(key);
      if (!current) {
        byCheck.set(key, rec);
        continue;
      }

      const nextRank = statusRank(
        typeof rec['status'] === 'string'
          ? (rec['status'] as string)
          : rec['passed'] === true
            ? 'PASS'
            : 'FAIL'
      );
      const currentRank = statusRank(
        typeof current['status'] === 'string'
          ? (current['status'] as string)
          : current['passed'] === true
            ? 'PASS'
            : 'FAIL'
      );

      const nextWeight = typeof rec['weight'] === 'number' ? rec['weight'] : 0;
      const currentWeight = typeof current['weight'] === 'number' ? current['weight'] : 0;

      if (nextRank > currentRank || (nextRank === currentRank && nextWeight > currentWeight)) {
        byCheck.set(key, rec);
      }
    }
  }

  return [...byCheck.values()].sort(
    (a, b) =>
      statusRank(String(b['status'] ?? '')) - statusRank(String(a['status'] ?? '')) ||
      (((b['weight'] as number) ?? 0) - ((a['weight'] as number) ?? 0))
  );
}

function appendixSummaryForCheck(
  issues: readonly Record<string, unknown>[],
  checkIds: readonly string[]
): string | null {
  const matches = issues.filter((issue) => {
    const id = String(issue['checkId'] ?? issue['check'] ?? '');
    return checkIds.includes(id);
  });
  if (matches.length === 0) return null;
  return matches
    .map((issue) => {
      const name = String(issue['check'] ?? issue['checkId'] ?? 'Check');
      const status = String(issue['status'] ?? (issue['passed'] === true ? 'PASS' : 'FAIL'));
      const finding = String(issue['finding'] ?? '').trim();
      return finding ? `${name} [${status}]: ${finding}` : `${name} [${status}]`;
    })
    .join(' | ');
}

async function maybeAutoPostStartupSlack(args: {
  readonly supabase: ReturnType<typeof createServiceRoleClient>;
  readonly env: CloudflareEnv;
  readonly startupWorkspaceId: string;
  readonly scanId: string;
  readonly reportId: string;
  readonly domain: string;
  readonly score: number;
  readonly pdfUrl: string | null;
  readonly markdownUrl: string | null;
}): Promise<void> {
  const { data: workspace, error: workspaceError } = await args.supabase
    .from('startup_workspaces')
    .select('id,metadata')
    .eq('id', args.startupWorkspaceId)
    .maybeSingle();
  if (workspaceError) throw workspaceError;
  if (!workspace?.id) return;

  const rollout = resolveStartupRolloutFlagsFromMetadata({
    metadata: (workspace.metadata as Record<string, unknown> | null) ?? {},
    env: args.env as any,
  });
  if (!rollout.startupDashboard || !rollout.slackAgent || !rollout.slackAutoPost) {
    return;
  }

  const bundleKey = await resolveStartupWorkspaceBundleKey({
    memberSupabase: args.supabase as any,
    serviceSupabase: args.supabase as any,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  const [slackIntegrationEntitlement, slackNotificationsEntitlement] = await Promise.all([
    resolveServiceEntitlement({
      supabase: args.supabase as any,
      serviceKey: 'slack_integration',
      bundleKey,
    }),
    resolveServiceEntitlement({
      supabase: args.supabase as any,
      serviceKey: 'slack_notifications',
      bundleKey,
    }),
  ]);
  const [slackIntegrationBilling, slackNotificationsBilling] = await Promise.all([
    resolveServiceBillingGuard({
      supabase: args.supabase as any,
      startupWorkspaceId: args.startupWorkspaceId,
      bundleKey,
      serviceKey: 'slack_integration',
      entitlement: slackIntegrationEntitlement,
    }),
    resolveServiceBillingGuard({
      supabase: args.supabase as any,
      startupWorkspaceId: args.startupWorkspaceId,
      bundleKey,
      serviceKey: 'slack_notifications',
      entitlement: slackNotificationsEntitlement,
    }),
  ]);
  if (!slackIntegrationBilling.allowed || !slackNotificationsBilling.allowed) {
    return;
  }

  const destinations = await listStartupSlackDestinations({
    supabase: args.supabase as any,
    startupWorkspaceId: args.startupWorkspaceId,
  });
  const activeDestinations = destinations.filter((destination) => destination.status === 'active');
  const selectedDestination = activeDestinations.find((destination) => destination.isDefaultDestination) ?? activeDestinations[0];
  if (!selectedDestination) return;

  const destination = await getStartupSlackDestination({
    supabase: args.supabase as any,
    startupWorkspaceId: args.startupWorkspaceId,
    destinationId: selectedDestination.id,
  });
  if (!destination) return;

  const { data: recommendations, error: recommendationsError } = await args.supabase
    .from('startup_recommendations')
    .select('title')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .or(`report_id.eq.${args.reportId},scan_id.eq.${args.scanId}`)
    .order('created_at', { ascending: false })
    .limit(6);
  if (recommendationsError) throw recommendationsError;
  const recommendationTitles = ((recommendations ?? []) as Array<{ title: string | null }>)
    .map((item) => (item.title ?? '').trim())
    .filter((title) => title.length > 0)
    .slice(0, 3);

  const { data: previousScan, error: previousScanError } = await args.supabase
    .from('scans')
    .select('id,score')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .neq('id', args.scanId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousScanError) throw previousScanError;
  const previousScore = typeof previousScan?.score === 'number' ? previousScan.score : null;
  const scoreDelta = previousScore == null ? null : Math.round(args.score - previousScore);

  const reportUrl = `${(args.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')}/dashboard/startup?startupWorkspace=${args.startupWorkspaceId}`;
  const payload: StartupSlackMessagePayload = {
    startup_workspace_id: args.startupWorkspaceId,
    destination_id: destination.id,
    event_type: 'new_audit_ready',
    site_domain: args.domain,
    score: args.score,
    score_delta: scoreDelta,
    summary_bullets: recommendationTitles,
    report_url: reportUrl,
    markdown_url: args.markdownUrl,
    sent_by_user_id: 'system',
  };
  const text = formatStartupSlackMessage(payload);
  const pdfLine = args.pdfUrl ? `\nPDF: ${args.pdfUrl}` : '';

  const destinationLabel = destination.channelName
    ? `${destination.channelName} (${destination.channelId})`
    : destination.channelId;
  const { id: deliveryEventId } = await createStartupSlackDeliveryEvent({
    supabase: args.supabase as any,
    startupWorkspaceId: args.startupWorkspaceId,
    installationId: destination.installation.id,
    destinationId: destination.id,
    eventType: 'new_audit_ready',
    sentByUserId: null,
    payload: {
      ...payload,
      destination_label: destinationLabel,
      source: 'auto_post',
    },
  });

  try {
    const sendResult = await sendStartupSlackMessage({
      destination,
      text: `${text}${pdfLine}`,
    });
    await updateStartupSlackDeliveryEventStatus({
      supabase: args.supabase as any,
      startupWorkspaceId: args.startupWorkspaceId,
      deliveryEventId,
      status: 'sent',
      response: {
        slack_ts: sendResult.timestamp,
        destination_label: destinationLabel,
      },
    });
    structuredLog(
      'startup_slack_auto_post_succeeded',
      {
        startup_workspace_id: args.startupWorkspaceId,
        report_id: args.reportId,
        scan_id: args.scanId,
        destination_id: destination.id,
        delivery_event_id: deliveryEventId,
      },
      'info'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await updateStartupSlackDeliveryEventStatus({
      supabase: args.supabase as any,
      startupWorkspaceId: args.startupWorkspaceId,
      deliveryEventId,
      status: 'failed',
      response: {
        destination_label: destinationLabel,
      },
      errorMessage,
    });
    structuredLog(
      'startup_slack_auto_post_failed',
      {
        startup_workspace_id: args.startupWorkspaceId,
        report_id: args.reportId,
        scan_id: args.scanId,
        destination_id: destination.id,
        delivery_event_id: deliveryEventId,
        error_message: errorMessage,
      },
      'warning'
    );
  }
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

  structuredLog('report_job_started', {
    scanId: job.scanId,
    paymentId: 'paymentId' in job ? job.paymentId : null,
    stripeSessionId: 'stripeSessionId' in job ? job.stripeSessionId : null,
  }, 'info');

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
    .select(
      'id,url,domain,score,letter_grade,issues_json,full_results_json,user_id,agency_account_id,agency_client_id,startup_workspace_id'
    )
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
  const browserRenderMode = extractBrowserRenderMode(runRow.config);
  const effectiveModel = extractEffectiveModel(runRow.config, env.GEMINI_MODEL);

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
      GEMINI_MODEL: effectiveModel,
      GEMINI_ENDPOINT: env.GEMINI_ENDPOINT,
    });
    const crawl = await runDeepAuditCrawl(supabase, llm, {
      runId: scanRunId,
      seedUrl: scan.url,
      pageLimit,
      chunkSize,
      browserRender: browserRenderConfigFromEnv({
        ...(env as unknown as Record<string, unknown>),
        DEEP_AUDIT_BROWSER_RENDER_MODE: browserRenderMode,
      }),
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
  const allIssuesForReport = buildSitewideIssueSummaryFromPages(pages);

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
    allIssues: allIssuesForReport,
    technicalAppendix: {
      robotsSummary: appendixSummaryForCheck(allIssuesForReport, ['ai-crawler-access']),
      schemaSummary: appendixSummaryForCheck(allIssuesForReport, ['jsonld', 'schema-types']),
      headersSummary: appendixSummaryForCheck(allIssuesForReport, ['security-headers']),
    },
    categoryScores: catScores,
  });

  const fullResults = {
    deepAudit: true,
    reportPayloadVersion: 1 as const,
    payloadGeneratedAt: payload.generatedAt,
    categoryScores: catScores,
    highlightedIssues: issuesForScan,
    allIssues: allIssuesForReport,
    coverageSummary: runCoverage?.coverage_summary ?? null,
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

  const highlightedIssueRows = Array.isArray(issuesForScan) ? issuesForScan : [];
  const allIssueRows = Array.isArray(allIssuesForReport) ? allIssuesForReport : [];
  const failedForEmail = highlightedIssueRows
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
    passedChecks: allIssueRows.filter((r: Record<string, unknown>) => String(r['status'] ?? '') === 'PASS').length,
    scanId: job.scanId,
  });

  if (!emailResult.ok) {
    throw new Error(emailResult.message);
  }

  structuredLog('report_job_email_sent', {
    scanId: job.scanId,
    attachedPdf: attachPdf,
    usedDownloadLinks: !!downloadLinks?.pdfUrl,
  }, 'info');

  const now = new Date().toISOString();
  const { data: insertedReport, error: repErr } = await supabase
    .from('reports')
    .insert({
      scan_id: job.scanId,
      user_id: scan.user_id ?? null,
      agency_account_id: scan.agency_account_id ?? null,
      agency_client_id: scan.agency_client_id ?? null,
      startup_workspace_id: scan.startup_workspace_id ?? null,
      guest_email: job.customerEmail.trim().toLowerCase(),
      pdf_url: pdfUrl,
      markdown_url: downloadLinks?.markdownUrl ?? null,
      report_payload_version: payload.version,
      pdf_generated_at: now,
      email_delivered_at: now,
      type: 'deep_audit',
    })
    .select('id')
    .single();

  if (repErr) {
    throw new Error(repErr.message);
  }
  const reportId = typeof insertedReport?.id === 'string' ? insertedReport.id : null;

  try {
    await writeGeneratedReportEval(supabase as any, {
      markdown: markdownText,
      siteUrl: scan.url,
      reportId: null,
      scanId: job.scanId,
      generatorVersion: 'deep-audit-markdown-v1',
      promptSetName: 'layer-one-default',
      allIssues: allIssueRows,
      reportPayloadVersion: payload.version,
    });
  } catch (error) {
    structuredLog('report_eval_write_failed', {
      scanId: job.scanId,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
  }

  try {
    const rewriteResult = await rewriteLayerOneReportInternal(markdownText, {
      enabled: env.DEEP_AUDIT_INTERNAL_REWRITE_ENABLED,
      apiKey: env.GEMINI_API_KEY,
      model: (env.DEEP_AUDIT_INTERNAL_REWRITE_MODEL ?? '').trim() || env.GEMINI_MODEL,
      endpoint: env.GEMINI_ENDPOINT,
    });

    if (rewriteResult.status === 'completed') {
      let rewrittenArtifactKey: string | null = null;
      let rewrittenArtifactUrl: string | null = null;

      if (bucket) {
        const uploaded = await uploadDeepAuditRewrittenMarkdown(
          bucket,
          job.scanId,
          rewriteResult.rewrittenMarkdown
        );
        rewrittenArtifactKey = uploaded.rewrittenMarkdownKey;
        if (publicBase) {
          rewrittenArtifactUrl = publicObjectUrl(publicBase, uploaded.rewrittenMarkdownKey);
        }
      }

      await writeGeneratedReportEval(supabase as any, {
        markdown: rewriteResult.rewrittenMarkdown,
        siteUrl: scan.url,
        reportId: null,
        scanId: job.scanId,
        generatorVersion: 'deep-audit-markdown-rewrite-v1',
        promptSetName: 'layer-one-rewriter-v1',
        allIssues: allIssueRows,
        reportPayloadVersion: payload.version,
        metadata: {
          artifact_variant: 'internal_rewrite',
          source_generator_version: 'deep-audit-markdown-v1',
          rewrite_model: rewriteResult.modelId,
          rewrite_executed_at: rewriteResult.executedAt,
          rewrite_artifact_key: rewrittenArtifactKey,
          rewrite_artifact_url: rewrittenArtifactUrl,
          rewrite_response_metadata: rewriteResult.responseMetadata,
        },
      });

      structuredLog(
        'report_internal_rewrite_completed',
        {
          scanId: job.scanId,
          rewriteModel: rewriteResult.modelId,
          hasStoredArtifact: !!rewrittenArtifactKey,
        },
        'info'
      );
    } else if (rewriteResult.status === 'failed') {
      structuredLog('report_internal_rewrite_failed', {
        scanId: job.scanId,
        rewriteModel: rewriteResult.modelId,
        message: rewriteResult.errorMessage.slice(0, 200),
      });
    }
  } catch (error) {
    structuredLog('report_internal_rewrite_failed', {
      scanId: job.scanId,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
  }

  if (scan.startup_workspace_id && reportId) {
    try {
      await maybeAutoPostStartupSlack({
        supabase,
        env,
        startupWorkspaceId: String(scan.startup_workspace_id),
        scanId: job.scanId,
        reportId,
        domain: scan.domain,
        score: aggregateScore,
        pdfUrl,
        markdownUrl: downloadLinks?.markdownUrl ?? null,
      });
    } catch (error) {
      structuredLog('startup_slack_auto_post_error', {
        scanId: job.scanId,
        startupWorkspaceId: String(scan.startup_workspace_id),
        message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
    }
  }

  structuredLog('report_job_completed', {
    scanId: job.scanId,
    attachedPdf: attachPdf,
    hasPdfUrl: !!pdfUrl,
    hasMarkdownUrl: !!downloadLinks?.markdownUrl,
  }, 'info');
}

