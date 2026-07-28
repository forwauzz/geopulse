import type { SupabaseClient } from '@supabase/supabase-js';
import { buildGpmReportPayload } from './geo-performance-report-data';
import { buildGpmReportPdf } from './geo-performance-report-pdf';
import { generateGpmNarrative } from './geo-performance-report-narrative';
import { structuredLog, structuredError } from './structured-log';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import { sendGpmReportEmail } from '../../workers/report/gpm-email-delivery';
import type { GpmReportPayload } from './geo-performance-report-payload';
import { recipientsFromMetadata } from '../shared/report-recipients';
import { resolveReportBrand } from '../../workers/report/resolve-report-brand';
import { detectImageType } from '../../workers/scan-engine/parse-brand-signals';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GpmReportStoreEnvLike = {
  readonly ANTHROPIC_API_KEY?: string;
  readonly GPM_NARRATIVE_MODEL?: string;
  readonly GPM_REPORT_R2_PUBLIC_BASE?: string;
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
};

export type GpmR2BucketLike = {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
  get?(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

export type GpmReportStoreResult = {
  readonly reportId: string;
  readonly pdfUrl: string | null;
  readonly pdfR2Key: string | null;
  readonly narrativeGenerated: boolean;
  readonly payload: GpmReportPayload;
};

const platformLogoCache = new Map<string, Uint8Array>();

async function fetchPlatformLogo(
  platform: string,
  appUrl: string | undefined
): Promise<Uint8Array | null> {
  if (!['chatgpt', 'gemini', 'perplexity'].includes(platform)) return null;
  const cached = platformLogoCache.get(platform);
  if (cached) return cached;
  const base = appUrl?.trim().replace(/\/+$/, '');
  if (!base) return null;
  try {
    const response = await fetch(`${base}/ai-engines/${platform}.jpg`);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > 100_000) return null;
    const bytes = new Uint8Array(buffer);
    if (detectImageType(bytes) !== 'image/jpeg') return null;
    platformLogoCache.set(platform, bytes);
    return bytes;
  } catch {
    return null;
  }
}

// ── Core store function ───────────────────────────────────────────────────────

export async function storeGpmReport(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
  readonly runGroupId: string;
  readonly platform: string;
  readonly windowDate: string;
  readonly measuredCanonicalDomain: string;
  readonly bucket?: GpmR2BucketLike;
  readonly env: GpmReportStoreEnvLike;
}): Promise<GpmReportStoreResult> {
  const { config, runGroupId, platform, windowDate, measuredCanonicalDomain } = args;
  const brandResolution = await resolveReportBrand({
    supabase: args.supabase as any,
    scan: {
      agency_client_id: null,
      agency_account_id: config.agency_account_id,
      startup_workspace_id: config.startup_workspace_id,
    },
    bucket:
      args.bucket && typeof args.bucket.get === 'function'
        ? (args.bucket as any)
        : undefined,
  });
  const { brand, logoBytes } = brandResolution;

  structuredLog('gpm_report_store_started', {
    config_id: config.id,
    run_group_id: runGroupId,
    platform,
    window_date: windowDate,
  });

  // 1. Build structured payload from DB
  const payload = await buildGpmReportPayload({
    supabase: args.supabase,
    runGroupId,
    configId: config.id,
    domain: measuredCanonicalDomain,
    topic: config.topic,
    location: config.location,
    windowDate,
    platform,
    measuredCanonicalDomain,
  });

  // 2. Optionally generate Claude narrative (non-fatal if API key missing)
  let narrative: string | undefined;
  let narrativeGenerated = false;
  const apiKey = args.env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    try {
      narrative = await generateGpmNarrative(payload, {
        ANTHROPIC_API_KEY: apiKey,
        GPM_NARRATIVE_MODEL: args.env.GPM_NARRATIVE_MODEL,
      });
      narrativeGenerated = true;
    } catch (err) {
      structuredError('gpm_narrative_generation_failed', {
        config_id: config.id,
        run_group_id: runGroupId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // 3. Render PDF
  const platformLogoBytes = await fetchPlatformLogo(platform, args.env.NEXT_PUBLIC_APP_URL);
  const pdfBytes = await buildGpmReportPdf(payload, {
    narrative,
    brand,
    logoBytes,
    platformLogoBytes,
  });

  // 4. Upload to R2 if bucket is available
  let pdfR2Key: string | null = null;
  let pdfUrl: string | null = null;

  if (args.bucket) {
    try {
      const key = `gpm-reports/${config.id}/${windowDate}-${platform}-${runGroupId}.pdf`;
      await args.bucket.put(key, pdfBytes, {
        httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, max-age=3600' },
      });
      pdfR2Key = key;

      const publicBase = args.env.GPM_REPORT_R2_PUBLIC_BASE?.trim();
      if (publicBase) {
        const base = publicBase.replace(/\/$/, '');
        pdfUrl = `${base}/${key}`;
      }
    } catch (err) {
      structuredError('gpm_report_r2_upload_failed', {
        config_id: config.id,
        run_group_id: runGroupId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // 5. Persist a versioned record. Including the immutable run id in the stored window key
  // preserves every recheck while the payload keeps the clean customer-facing cadence window.
  const storedWindowKey = `${windowDate}@${runGroupId}`;
  const recipients = recipientsFromMetadata(config.report_email, config.metadata);
  const reportMetadata: Record<string, unknown> = {
    model_id: payload.modelId,
    citation_rate: payload.citationRate,
    visibility_pct: payload.visibilityPct,
    industry_rank: payload.industryRank,
    prompt_count: payload.prompts.length,
    cadence_window: windowDate,
    report_run_group_id: runGroupId,
    email_status: recipients.length > 0 ? 'pending' : 'not_configured',
    recipient_count: recipients.length,
  };
  const { data: inserted, error: insertErr } = await args.supabase
    .from('gpm_reports')
    .insert(
      {
        config_id: config.id,
        run_group_id: runGroupId,
        startup_workspace_id: config.startup_workspace_id ?? null,
        agency_account_id: config.agency_account_id ?? null,
        platform,
        window_date: storedWindowKey,
        pdf_r2_key: pdfR2Key,
        pdf_url: pdfUrl,
        report_payload_version: '1',
        narrative_generated: narrativeGenerated,
        generated_at: new Date().toISOString(),
        metadata: reportMetadata,
      }
    )
    .select('id')
    .single();

  if (insertErr) throw new Error(`gpm_reports insert failed: ${insertErr.message}`);

  const reportId = (inserted as { id: string }).id;

  // 6. Send email report if configured (non-fatal)
  const resendKey  = args.env.RESEND_API_KEY?.trim();
  const resendFrom = args.env.RESEND_FROM_EMAIL?.trim();
  let emailStatus = recipients.length > 0 ? 'not_sent_provider_unconfigured' : 'not_configured';
  if (recipients.length > 0 && resendKey && resendFrom) {
    try {
      const idempotencyKey = `gpm-report/${config.id}/${platform}/${windowDate}/${runGroupId}`;
      const emailResult = await sendGpmReportEmail({
        apiKey: resendKey,
        from: resendFrom,
        to: recipients[0]!,
        recipients,
        replyTo: brand.replyToEmail,
        brand,
        payload,
        narrative,
        pdfBytes: pdfUrl ? undefined : pdfBytes,
        pdfUrl: pdfUrl ?? null,
        idempotencyKey,
      });
      if (!emailResult.ok) {
        emailStatus = 'failed';
        structuredError('gpm_report_email_failed', {
          config_id: config.id,
          report_id: reportId,
          message: emailResult.message,
        });
      } else {
        emailStatus = 'sent';
        structuredLog('gpm_report_email_sent', { config_id: config.id, report_id: reportId, recipient_count: recipients.length });
      }
    } catch (err) {
      emailStatus = 'failed';
      structuredError('gpm_report_email_exception', {
        config_id: config.id,
        report_id: reportId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
  const reportTable = args.supabase.from('gpm_reports') as unknown as {
    update?: (payload: Record<string, unknown>) => {
      eq(column: string, value: string): Promise<unknown>;
    };
  };
  if (typeof reportTable.update === 'function') {
    await reportTable
      .update({
        metadata: {
          ...reportMetadata,
          email_status: emailStatus,
          email_status_at: new Date().toISOString(),
        },
      })
      .eq('id', reportId);
  }

  structuredLog('gpm_report_store_done', {
    config_id: config.id,
    report_id: reportId,
    run_group_id: runGroupId,
    platform,
    window_date: windowDate,
    pdf_r2_key: pdfR2Key,
    narrative_generated: narrativeGenerated,
  });

  return { reportId, pdfUrl, pdfR2Key, narrativeGenerated, payload };
}
