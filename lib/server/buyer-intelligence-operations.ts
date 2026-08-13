import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGpmMonthSpendUsd } from './gpm-spend-guard';

export const BUYER_INTELLIGENCE_OPERATING_CONTRACT_VERSION = 'buyer-intelligence-operations-v1';

type OperationsEnv = {
  readonly GPM_REPORT_DELIVERY_ENABLED?: string;
  readonly MONTHLY_BUYER_INTELLIGENCE_ENABLED?: string;
};

export type BuyerIntelligenceOperatingReport = {
  readonly contractVersion: typeof BUYER_INTELLIGENCE_OPERATING_CONTRACT_VERSION;
  readonly generatedAt: string;
  readonly periodStart: string;
  readonly jobs: { readonly total: number; readonly succeeded: number; readonly failed: number; readonly retrying: number };
  readonly artifacts: { readonly stored: number; readonly snapshots: number };
  readonly estimatedProviderSpendUsd: number;
  readonly legacyConsumerCount: number;
  readonly boundedExceptions: readonly string[];
  readonly connectorDecisions: {
    readonly brevo: { readonly decision: 'revise'; readonly evidence: string; readonly nextGate: string };
    readonly hubspot: { readonly decision: 'defer'; readonly evidence: string; readonly nextGate: string };
  };
};

type GenerationRow = {
  readonly status: 'queued' | 'rendering' | 'succeeded' | 'failed';
  readonly attempts: number;
  readonly artifact_r2_key: string | null;
};

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

/**
 * Read-only, hands-off operating report. It deliberately aggregates counts only: no contact,
 * tenant payload, signed URL, token, or storage key leaves this boundary.
 */
export async function loadBuyerIntelligenceOperatingReport(args: {
  readonly supabase: SupabaseClient;
  readonly env: OperationsEnv;
  readonly now?: Date;
}): Promise<BuyerIntelligenceOperatingReport> {
  const now = args.now ?? new Date();
  const periodStart = monthStart(now);
  const [{ data: generationData, error: generationError }, snapshotResult, spend] = await Promise.all([
    args.supabase
      .from('buyer_intelligence_generations')
      .select('status,attempts,artifact_r2_key')
      .gte('created_at', periodStart.toISOString())
      .limit(10_000),
    args.supabase
      .from('buyer_intelligence_snapshots')
      .select('snapshot_id', { count: 'exact', head: true })
      .gte('created_at', periodStart.toISOString()),
    loadGpmMonthSpendUsd(args.supabase, now),
  ]);
  if (generationError) throw generationError;
  if (snapshotResult.error) throw snapshotResult.error;
  const rows = (generationData ?? []) as GenerationRow[];
  const boundedExceptions = [
    'monitor_visibility_fallback: only subscriptions without a canonical agency client may use the legacy display-only summary',
  ];
  const legacyConsumerCount = enabled(args.env.GPM_REPORT_DELIVERY_ENABLED) ? 1 : 0;
  if (legacyConsumerCount) {
    boundedExceptions.push('gpm_artifact_delivery: explicitly enabled compatibility path; production must keep this flag false');
  }
  if (!enabled(args.env.MONTHLY_BUYER_INTELLIGENCE_ENABLED)) {
    boundedExceptions.push('monthly_buyer_intelligence: canonical recurring generation is disabled');
  }
  return {
    contractVersion: BUYER_INTELLIGENCE_OPERATING_CONTRACT_VERSION,
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    jobs: {
      total: rows.length,
      succeeded: rows.filter((row) => row.status === 'succeeded').length,
      failed: rows.filter((row) => row.status === 'failed').length,
      retrying: rows.filter((row) => row.status === 'queued' && row.attempts > 1).length,
    },
    artifacts: {
      stored: rows.filter((row) => row.status === 'succeeded' && Boolean(row.artifact_r2_key)).length,
      snapshots: snapshotResult.count ?? 0,
    },
    estimatedProviderSpendUsd: Math.round(spend * 10_000) / 10_000,
    legacyConsumerCount,
    boundedExceptions,
    connectorDecisions: {
      brevo: {
        decision: 'revise',
        evidence: 'The Alie canary proved OAuth, held-contact selection, preview, field sync, and one-contact delivery.',
        nextGate: 'Validate repeat use with one external partner before expanding automation.',
      },
      hubspot: {
        decision: 'defer',
        evidence: 'No external partner has required HubSpot and Brevo has not yet proven repeated paid use.',
        nextGate: 'Build only after explicit external demand or repeated paid Brevo use.',
      },
    },
  };
}
