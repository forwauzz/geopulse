'use server';

import { z } from 'zod';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { createGpmAdminData } from '@/lib/server/geo-performance-admin-data';
import { StubBenchmarkExecutionAdapter } from '@/lib/server/benchmark-execution';
import {
  executeGpmClientRun,
  resolveGpmPlatformModelMap,
  type GpmRunSummary,
} from '@/lib/server/geo-performance-schedule';
import { buildGpmEntitlementsMap } from '@/lib/server/geo-performance-entitlements';
import type { ClientBenchmarkConfigRow } from '@/lib/server/benchmark-repository';

export type GpmDryRunActionState =
  | { ok: true; message: string; summary: GpmRunSummary }
  | { ok: false; message: string; summary: null };

const schema = z.object({
  configId: z.string().uuid('Invalid config ID.'),
});

export async function triggerGpmDryRunAction(
  _prev: GpmDryRunActionState | null,
  formData: FormData
): Promise<GpmDryRunActionState> {
  const context = await loadAdminActionContext();
  if (!context.ok) return { ok: false, message: context.message, summary: null };

  const parsed = schema.safeParse({ configId: formData.get('configId') });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.flatten().fieldErrors['configId']?.[0] ?? 'Invalid input.', summary: null };
  }

  const { configId } = parsed.data;

  try {
    const gpmData = createGpmAdminData(context.adminDb);
    const config = await gpmData.getConfig(configId);
    if (!config) return { ok: false, message: 'Config not found.', summary: null };

    const configRow: ClientBenchmarkConfigRow = {
      id: config.id,
      startup_workspace_id: config.startup_workspace_id,
      agency_account_id: config.agency_account_id,
      benchmark_domain_id: config.benchmark_domain_id,
      topic: config.topic,
      location: config.location,
      query_set_id: config.query_set_id,
      competitor_list: config.competitor_list,
      cadence: config.cadence,
      platforms_enabled: config.platforms_enabled,
      report_email: config.report_email,
      metadata: config.metadata,
      created_at: config.created_at,
      updated_at: config.updated_at,
    };

    const entitlementsMap = await buildGpmEntitlementsMap(context.adminDb, [configRow]);
    const entitlement = entitlementsMap.get(configId);

    if (!entitlement || !entitlement.enabled) {
      return {
        ok: false,
        message: `GPM not enabled for this workspace. Entitlement source: ${entitlement?.source ?? 'none'}. Ensure the workspace has an active startup_dev, agency_core, or agency_pro subscription.`,
        summary: null,
      };
    }

    const platformModelMap = resolveGpmPlatformModelMap({});

    const summary = await executeGpmClientRun({
      supabase: context.adminDb,
      config: configRow,
      entitlement,
      platformModelMap,
      adapter: new StubBenchmarkExecutionAdapter(),
      triggerSource: 'admin_dry_run',
    });

    const launched = summary.platformResults.filter((r) => r.status === 'launched').length;
    const skipped = summary.platformResults.filter((r) => r.status === 'skipped_existing').length;
    const blocked = summary.entitlementBlocked;
    const noQuerySet = summary.skippedMissingConfig;

    let message: string;
    if (noQuerySet) {
      message = `Dry run skipped — config has no query set assigned. Assign a query set before triggering.`;
    } else if (blocked) {
      message = `Dry run blocked by entitlement — check cadence and platforms against plan limits.`;
    } else {
      message = `Dry run complete. Window: ${summary.windowDate}. Platforms launched: ${launched}, already existed: ${skipped}.`;
    }

    return { ok: true, message, summary };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Dry run failed unexpectedly.',
      summary: null,
    };
  }
}
