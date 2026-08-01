import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import { buildGpmReportPayload } from './geo-performance-report-data';
import { buildAgencyReportPdf } from './agency-report-pdf';
import {
  buildAgencyReportSnapshot,
  attachComparableAgencyReportHistory,
  readAgencyReportSnapshot,
  type AgencyReportSnapshotV2,
  type GpmReportPlatform,
} from './agency-report-snapshot';
import { parseReportSettings, resolveReportSettings } from './report-settings';
import { recipientsFromMetadata } from '../shared/report-recipients';
import { structuredError, structuredLog } from './structured-log';
import { resolveReportBrand } from '../../workers/report/resolve-report-brand';
import { sendAgencyReportEmail } from '../../workers/report/agency-report-email-delivery';
import type { GpmR2BucketLike } from './geo-performance-report-store';
import { isReportQuarantined } from './report-quarantine';

export type AgencyReportStoreEnvLike = {
  readonly RESEND_API_KEY?: string;
  readonly RESEND_FROM_EMAIL?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
  /** Fail closed. A deployment can be verified without emailing a client. */
  readonly GPM_REPORT_DELIVERY_ENABLED?: string;
};

export type AgencyReportPlatformRun = {
  readonly platform: GpmReportPlatform;
  readonly runGroupId: string;
};

export type AgencyReportStoreResult = {
  readonly created: boolean;
  readonly reportId: string;
  readonly pdfR2Key: string | null;
  readonly secureReportUrl: string | null;
  readonly snapshot: AgencyReportSnapshotV2;
};

type MetadataRow = { readonly id: string; readonly metadata: Record<string, unknown> | null };
type ClientRow = MetadataRow & {
  readonly name: string | null;
  readonly display_name: string | null;
};

function canonical(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function shortFingerprint(value: string): string {
  let checksum = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    checksum ^= value.charCodeAt(index);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return (checksum >>> 0).toString(16).padStart(8, '0');
}

export function buildAgencyReportArtifactVersion(args: {
  readonly profileVersion: string;
  readonly brandVersion: string;
  readonly platformRuns: readonly AgencyReportPlatformRun[];
}): string {
  const sources = [...args.platformRuns]
    .sort((a, b) => a.platform.localeCompare(b.platform))
    .map((run) => `${run.platform}:${run.runGroupId}`)
    .join('|');
  return `${args.profileVersion}-${shortFingerprint(`${sources}|brand:${args.brandVersion}`)}`;
}

async function loadProfile(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
  readonly domain: string;
}): Promise<{
  readonly client: ClientRow | null;
  readonly settings: ReturnType<typeof resolveReportSettings>;
}> {
  let agency: MetadataRow | null = null;
  if (args.config.agency_account_id) {
    const { data } = await args.supabase
      .from('agency_accounts')
      .select('id,metadata')
      .eq('id', args.config.agency_account_id)
      .maybeSingle();
    agency = data as MetadataRow | null;
  }

  let client: ClientRow | null = null;
  if (args.config.agency_account_id) {
    const { data } = await args.supabase
      .from('agency_clients')
      .select('id,name,display_name,metadata')
      .eq('agency_account_id', args.config.agency_account_id)
      .eq('canonical_domain', canonical(args.domain))
      .maybeSingle();
    client = data as ClientRow | null;
  }

  return {
    client,
    settings: resolveReportSettings(
      parseReportSettings(agency?.metadata?.['report']),
      parseReportSettings(client?.metadata?.['report'])
    ),
  };
}

function shareUrl(args: {
  readonly appUrl?: string;
  readonly client: ClientRow | null;
}): string | null {
  const token = args.client?.metadata?.['client_summary_share_token'];
  const base = args.appUrl?.trim().replace(/\/+$/, '');
  if (!base || !args.client?.id || typeof token !== 'string' || !token.trim()) return null;
  return `${base}/client-summary/${encodeURIComponent(args.client.id)}?share=${encodeURIComponent(token)}`;
}

export async function storeAgencyReport(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
  readonly platformRuns: readonly AgencyReportPlatformRun[];
  readonly windowDate: string;
  readonly measuredCanonicalDomain: string;
  readonly bucket?: GpmR2BucketLike;
  readonly env: AgencyReportStoreEnvLike;
}): Promise<AgencyReportStoreResult> {
  if (args.platformRuns.length === 0) throw new Error('agency_report_has_no_platform_runs');
  const profile = await loadProfile({
    supabase: args.supabase,
    config: args.config,
    domain: args.measuredCanonicalDomain,
  });
  const payloads = await Promise.all(args.platformRuns.map((run) => buildGpmReportPayload({
    supabase: args.supabase,
    runGroupId: run.runGroupId,
    configId: args.config.id,
    domain: args.measuredCanonicalDomain,
    topic: args.config.topic,
    location: args.config.location,
    windowDate: args.windowDate,
    platform: run.platform,
    measuredCanonicalDomain: args.measuredCanonicalDomain,
  })));
  const reportedAt = payloads.map((payload) => payload.reportedAt).sort().at(-1);
  const baseSnapshot = buildAgencyReportSnapshot({
    configId: args.config.id,
    clientName: profile.client?.display_name || profile.client?.name,
    domain: args.measuredCanonicalDomain,
    topic: args.config.topic,
    location: args.config.location,
    windowDate: args.windowDate,
    reportedAt,
    payloads,
    sourceRunGroupIds: Object.fromEntries(args.platformRuns.map((run) => [run.platform, run.runGroupId])),
    settings: profile.settings,
  });
  const brandResolution = await resolveReportBrand({
    supabase: args.supabase as any,
    scan: {
      agency_client_id: profile.client?.id ?? null,
      agency_account_id: args.config.agency_account_id,
      startup_workspace_id: args.config.startup_workspace_id,
    },
    bucket: args.bucket && typeof args.bucket.get === 'function' ? args.bucket as any : undefined,
  });
  const brandVersion = shortFingerprint(JSON.stringify(brandResolution.brand));
  const artifactVersion = buildAgencyReportArtifactVersion({
    profileVersion: baseSnapshot.profileVersion,
    brandVersion,
    platformRuns: args.platformRuns,
  });
  const storedWindowKey = `${args.windowDate}@${artifactVersion}`;

  let existingQuery = args.supabase
    .from('gpm_reports')
    .select('id,pdf_r2_key,metadata')
    .eq('config_id', args.config.id)
    .eq('platform', 'combined')
    .eq('window_date', storedWindowKey);
  if (profile.client?.id) existingQuery = existingQuery.eq('agency_client_id', profile.client.id);
  const { data: existing } = await existingQuery.maybeSingle();
  const secureReportUrl = shareUrl({ appUrl: args.env.NEXT_PUBLIC_APP_URL, client: profile.client });
  if (existing?.id) {
    if (isReportQuarantined(existing.metadata)) throw new Error('agency_report_artifact_quarantined');
    const storedSnapshot = readAgencyReportSnapshot(existing.metadata?.['snapshot']);
    return {
      created: false,
      reportId: String(existing.id),
      pdfR2Key: typeof existing.pdf_r2_key === 'string' ? existing.pdf_r2_key : null,
      secureReportUrl,
      snapshot: storedSnapshot ?? baseSnapshot,
    };
  }

  let historicalQuery = args.supabase
    .from('gpm_reports')
    .select('metadata')
    .eq('config_id', args.config.id)
    .eq('platform', 'combined')
    .eq('report_payload_version', '2');
  if (profile.client?.id) historicalQuery = historicalQuery.eq('agency_client_id', profile.client.id);
  const { data: historicalRows } = await historicalQuery
    .order('generated_at', { ascending: false })
    .limit(24);
  const historicalSnapshots = Array.isArray(historicalRows)
    ? historicalRows.filter((row) => !isReportQuarantined(row?.metadata)).flatMap((row) => {
      const parsed = readAgencyReportSnapshot(row?.metadata?.snapshot);
      return parsed ? [parsed] : [];
    })
    : [];
  const snapshot = attachComparableAgencyReportHistory(baseSnapshot, historicalSnapshots);

  const pdfBytes = await buildAgencyReportPdf(snapshot, brandResolution);
  let pdfR2Key: string | null = null;
  if (args.bucket) {
    pdfR2Key = `gpm-reports/${args.config.id}/${args.windowDate}-combined-${artifactVersion}.pdf`;
    await args.bucket.put(pdfR2Key, pdfBytes, {
      httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
    });
  }

  const recipients = recipientsFromMetadata(args.config.report_email, args.config.metadata);
  const deliveryEnabled = args.env.GPM_REPORT_DELIVERY_ENABLED?.trim().toLowerCase() === 'true';
  const reportMetadata: Record<string, unknown> = {
    artifact_kind: 'agency_report_v2',
    artifact_version: artifactVersion,
    cadence_window: args.windowDate,
    profile_version: snapshot.profileVersion,
    source_run_group_ids: Object.fromEntries(args.platformRuns.map((run) => [run.platform, run.runGroupId])),
    snapshot,
    email_status: recipients.length === 0
      ? 'not_configured'
      : deliveryEnabled ? 'pending' : 'held_delivery_disabled',
    recipient_count: recipients.length,
    delivery_url_kind: secureReportUrl ? 'revocable_client_summary' : 'attachment_only',
  };
  const anchorRunGroupId = args.platformRuns[0]!.runGroupId;
  const { data: inserted, error } = await args.supabase.from('gpm_reports').insert({
    config_id: args.config.id,
    run_group_id: anchorRunGroupId,
    startup_workspace_id: args.config.startup_workspace_id ?? null,
    agency_account_id: args.config.agency_account_id ?? null,
    agency_client_id: profile.client?.id ?? null,
    platform: 'combined',
    window_date: storedWindowKey,
    pdf_r2_key: pdfR2Key,
    pdf_url: null,
    report_payload_version: '2',
    narrative_generated: false,
    generated_at: snapshot.reportedAt,
    metadata: reportMetadata,
  }).select('id').single();
  if (error) throw new Error(`gpm_reports combined insert failed: ${error.message}`);
  const reportId = String(inserted.id);

  let emailStatus = reportMetadata['email_status'] as string;
  if (recipients.length > 0 && deliveryEnabled) {
    const resendKey = args.env.RESEND_API_KEY?.trim();
    const resendFrom = args.env.RESEND_FROM_EMAIL?.trim();
    if (!resendKey || !resendFrom) {
      emailStatus = 'not_sent_provider_unconfigured';
    } else {
      try {
        const result = await sendAgencyReportEmail({
          apiKey: resendKey,
          from: resendFrom,
          recipients,
          replyTo: brandResolution.brand.replyToEmail,
          brand: brandResolution.brand,
          snapshot,
          pdfBytes: secureReportUrl ? undefined : pdfBytes,
          secureReportUrl,
          idempotencyKey: `agency-report/${args.config.id}/${artifactVersion}`,
        });
        emailStatus = result.ok ? 'sent' : 'failed';
        if (!result.ok) structuredError('agency_report_email_failed', { config_id: args.config.id, report_id: reportId, message: result.message });
      } catch (caught) {
        emailStatus = 'failed';
        structuredError('agency_report_email_exception', {
          config_id: args.config.id,
          report_id: reportId,
          error: caught instanceof Error ? caught.message : 'unknown',
        });
      }
    }
    await args.supabase.from('gpm_reports').update({
      metadata: { ...reportMetadata, email_status: emailStatus, email_status_at: new Date().toISOString() },
    }).eq('id', reportId);
  }

  structuredLog('agency_report_store_done', {
    config_id: args.config.id,
    report_id: reportId,
    artifact_version: artifactVersion,
    engine_count: snapshot.engines.length,
    question_count: snapshot.questionsTracked,
    email_status: emailStatus,
  });
  return { created: true, reportId, pdfR2Key, secureReportUrl, snapshot };
}
