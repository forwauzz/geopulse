import type { SupabaseClient } from '@supabase/supabase-js';
import { runAndPersistReadinessScan } from './agency-client-baseline';
import { ensureAgencyClientBuyerIntelligenceSnapshot } from './buyer-intelligence-snapshot-assembly';
import { createSupabaseBuyerIntelligenceGenerationRepository } from './buyer-intelligence-generation-repository';
import { generateBuyerIntelligenceArtifact } from './buyer-intelligence-generation-service';
import { readBuyerIntelligenceHeroRef } from './buyer-intelligence-hero';
import { enqueueLifecycleEmail, type LifecycleEmailEnv } from './lifecycle-email';
import { resolveReportBrand } from '../../workers/report/resolve-report-brand';
import { structuredError, structuredLog } from './structured-log';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_MS = 24 * 60 * 60 * 1000;

type MonthlyEnv = LifecycleEmailEnv & {
  readonly MONTHLY_BUYER_INTELLIGENCE_ENABLED?: string;
  readonly BREVO_PARTNER_TEST_RECIPIENTS?: string;
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
};

type ReportBucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: Uint8Array | ArrayBuffer, options?: {
    httpMetadata?: { contentType?: string; cacheControl?: string };
  }): Promise<unknown>;
};

type ConfigRow = {
  readonly id: string;
  readonly agency_account_id: string;
  readonly report_email: string | null;
  readonly metadata: Record<string, unknown> | null;
};

export type MonthlyBuyerIntelligenceSweepResult = {
  readonly eligible: number;
  readonly attempted: number;
  readonly completed: number;
  readonly failed: number;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function monthlyBuyerIntelligenceDue(
  metadata: Record<string, unknown> | null,
  now: Date,
): boolean {
  const next = text(metadata?.['buyer_intelligence_next_at']);
  if (!next) return true;
  const timestamp = Date.parse(next);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

export function isMonthlyBuyerIntelligenceCandidate(args: {
  readonly metadata: Record<string, unknown> | null;
  readonly reportEmail: string | null;
  readonly allowedRecipients: ReadonlySet<string>;
  readonly now: Date;
}): boolean {
  const metadata = args.metadata ?? {};
  return text(metadata['agency_client_id']) !== null
    && metadata['baseline_status'] === 'measured'
    && args.allowedRecipients.has(text(args.reportEmail)?.toLowerCase() ?? '')
    && monthlyBuyerIntelligenceDue(metadata, args.now);
}

function nextAt(now: Date, delayMs = MONTH_MS): string {
  return new Date(now.getTime() + delayMs).toISOString();
}

async function updateState(args: {
  supabase: SupabaseClient<any, 'public', any>;
  config: ConfigRow;
  values: Record<string, unknown>;
  now: Date;
}): Promise<void> {
  const { error } = await args.supabase.from('client_benchmark_configs').update({
    metadata: { ...(args.config.metadata ?? {}), ...args.values },
    updated_at: args.now.toISOString(),
  }).eq('id', args.config.id).eq('agency_account_id', args.config.agency_account_id);
  if (error) throw error;
}

/**
 * Convert due agency measurements into canonical monthly intelligence. This coordinator reuses the
 * existing scanner, snapshot contract, renderer, R2 bucket, and lifecycle outbox.
 */
export async function runMonthlyBuyerIntelligenceSweep(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly env: MonthlyEnv;
  readonly reportBucket: ReportBucket;
  readonly now?: Date;
  readonly limit?: number;
}): Promise<MonthlyBuyerIntelligenceSweepResult> {
  const now = args.now ?? new Date();
  if (args.env.MONTHLY_BUYER_INTELLIGENCE_ENABLED?.trim().toLowerCase() !== 'true') {
    return { eligible: 0, attempted: 0, completed: 0, failed: 0 };
  }
  const canaryEmails = new Set((args.env.BREVO_PARTNER_TEST_RECIPIENTS ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter((value) => value.includes('@')));
  if (canaryEmails.size === 0) {
    structuredError('monthly_buyer_intelligence_disabled_missing_canary', {});
    return { eligible: 0, attempted: 0, completed: 0, failed: 0 };
  }
  const limit = Math.max(1, Math.min(args.limit ?? 1, 3));
  const { data, error } = await args.supabase.from('client_benchmark_configs')
    .select('id,agency_account_id,report_email,metadata')
    .not('agency_account_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  const eligible = ((data ?? []) as ConfigRow[]).filter((config) =>
    isMonthlyBuyerIntelligenceCandidate({
      metadata: config.metadata,
      reportEmail: config.report_email,
      allowedRecipients: canaryEmails,
      now,
    }));

  let attempted = 0;
  let completed = 0;
  let failed = 0;
  for (const config of eligible.slice(0, limit)) {
    attempted += 1;
    const agencyClientId = text(config.metadata?.['agency_client_id'])!;
    try {
      const [{ data: client }, { data: members }] = await Promise.all([
        args.supabase.from('agency_clients')
          .select('id,name,display_name,canonical_domain,website_domain,metadata')
          .eq('id', agencyClientId).eq('agency_account_id', config.agency_account_id)
          .eq('status', 'active').maybeSingle(),
        args.supabase.from('agency_users').select('user_id,role')
          .eq('agency_account_id', config.agency_account_id).eq('status', 'active')
          .in('role', ['owner', 'manager']).order('created_at').limit(1),
      ]);
      const domain = text(client?.canonical_domain) ?? text(client?.website_domain);
      const userId = text(members?.[0]?.user_id);
      if (!client?.id || !domain || !userId) {
        throw new Error('monthly_intelligence_scope_unavailable');
      }

      const scan = await runAndPersistReadinessScan({
        supabase: args.supabase,
        env: args.env,
        clientId: agencyClientId,
        agencyAccountId: config.agency_account_id,
        userId,
        domain,
      });
      if (!scan?.id) throw new Error('monthly_intelligence_scan_failed');
      const { snapshot } = await ensureAgencyClientBuyerIntelligenceSnapshot({
        supabase: args.supabase,
        agencyAccountId: config.agency_account_id,
        agencyClientId,
        canonicalDomain: domain,
      });
      const viewKind = snapshot.change.comparable
        ? 'monthly_brief' as const
        : 'full_baseline' as const;
      const { brand } = await resolveReportBrand({
        supabase: args.supabase as never,
        scan: {
          agency_client_id: agencyClientId,
          agency_account_id: config.agency_account_id,
          startup_workspace_id: null,
        },
        bucket: args.reportBucket as never,
      });
      const hero = readBuyerIntelligenceHeroRef(client.metadata);
      const heroObject = hero ? await args.reportBucket.get(hero.key) : null;
      const generated = await generateBuyerIntelligenceArtifact({
        request: {
          agencyAccountId: config.agency_account_id,
          agencyClientId,
          snapshotId: snapshot.snapshotId,
          viewKind,
          idempotencyKey: `monthly:${agencyClientId}:${snapshot.snapshotId}`.slice(0, 160),
          requestedByUserId: userId,
          branding: brand,
          heroR2Key: hero?.key ?? null,
        },
        snapshot,
        brand,
        heroImageBytes: heroObject ? new Uint8Array(await heroObject.arrayBuffer()) : null,
        heroImageMime: hero?.mime,
        repository: createSupabaseBuyerIntelligenceGenerationRepository(args.supabase),
        bucket: args.reportBucket,
      });
      const recipient = text(config.report_email);
      const delivery = recipient ? await enqueueLifecycleEmail({
        supabase: args.supabase,
        idempotencyKey: `monthly-intelligence/${generated.generation.id}`,
        eventType: 'monthly_intelligence_ready',
        templateKey: 'monthly_intelligence_ready',
        to: recipient,
        userId,
        subjectId: agencyClientId,
        variables: {
          company_name: text(client.display_name) ?? text(client.name) ?? domain,
          cta_url: `${(args.env.NEXT_PUBLIC_APP_URL ?? 'https://getgeopulse.com').replace(/\/$/, '')}/dashboard/clients/${agencyClientId}/buyer-intelligence?agencyAccount=${config.agency_account_id}&snapshot=${encodeURIComponent(snapshot.snapshotId)}&view=${viewKind}`,
        },
      }) : { ok: false, status: 'missing_recipient', reason: 'missing_recipient' };
      const verifications = snapshot.recommendations.map((item) => item.verification.result);
      await updateState({
        supabase: args.supabase,
        config,
        now,
        values: {
          buyer_intelligence_last_run_at: now.toISOString(),
          buyer_intelligence_next_at: nextAt(now),
          buyer_intelligence_last_error: null,
          buyer_intelligence_last_scan_id: scan.id,
          buyer_intelligence_last_snapshot_id: snapshot.snapshotId,
          buyer_intelligence_previous_snapshot_id: snapshot.period.previousSnapshotId,
          buyer_intelligence_comparable: snapshot.change.comparable,
          buyer_intelligence_improved_count: snapshot.change.changes
            .filter((item) => item.direction === 'improved').length,
          buyer_intelligence_regressed_count: snapshot.change.changes
            .filter((item) => item.direction === 'regressed').length,
          buyer_intelligence_verified_fix_count: verifications
            .filter((item) => item === 'verified_improved').length,
          buyer_intelligence_generation_id: generated.generation.id,
          buyer_intelligence_generation_status: generated.generation.status,
          buyer_intelligence_view_kind: viewKind,
          buyer_intelligence_delivery_id: delivery.id ?? null,
          buyer_intelligence_delivery_status: delivery.status ?? delivery.reason ?? null,
        },
      });
      structuredLog('monthly_buyer_intelligence_completed', {
        config_id: config.id,
        agency_account_id: config.agency_account_id,
        agency_client_id: agencyClientId,
        snapshot_id: snapshot.snapshotId,
        previous_snapshot_id: snapshot.period.previousSnapshotId,
        generation_id: generated.generation.id,
        view_kind: viewKind,
        delivery_status: delivery.status ?? delivery.reason ?? null,
      });
      completed += 1;
    } catch (cause) {
      failed += 1;
      const message = cause instanceof Error ? cause.message : 'unknown_error';
      await updateState({
        supabase: args.supabase,
        config,
        now,
        values: {
          buyer_intelligence_last_attempt_at: now.toISOString(),
          buyer_intelligence_next_at: nextAt(now, RETRY_MS),
          buyer_intelligence_last_error: message.slice(0, 200),
        },
      }).catch(() => undefined);
      structuredError('monthly_buyer_intelligence_failed', {
        config_id: config.id,
        reason: message,
      });
    }
  }
  return { eligible: eligible.length, attempted, completed, failed };
}
