import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION,
  ORGANIZATION_CONTEXT_BACKFILL_VERSION,
  classifyOrganizationContextBackfill,
  summarizeOrganizationContextBackfill,
  type OrganizationContextBackfillPlan,
  type OrganizationContextBackfillSource,
} from '../intelligence/organization-context-backfill';
import type { OrganizationContext, OrganizationOwnerType } from '../intelligence/organization-context';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import {
  reconcileConfirmedOrganizationContext,
  resolveOrganizationContextOwnerUserId,
} from './organization-context-change';
import { createOrganizationContextRepository } from './organization-context-repository';
import {
  organizationOwnerForMeasurementConfig,
  storedOrganizationContext,
} from './organization-measurement-context';

type SupabaseLike = SupabaseClient<any, 'public', any>;
type Row = Record<string, unknown>;
const BACKFILL_KEY = 'organization-context-v1:client-benchmark-configs';
const PAGE_SIZE = 100;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isOperationsExcludedContextConfig(metadata: unknown): boolean {
  return record(metadata)['operations_excluded'] === true;
}

async function retireOperationsExcludedContextLoop(args: {
  readonly supabase: SupabaseLike;
  readonly configId: string;
  readonly now: string;
}): Promise<boolean | null> {
  const { data: config, error: configError } = await args.supabase
    .from('client_benchmark_configs')
    .select('metadata')
    .eq('id', args.configId)
    .maybeSingle();
  if (configError) throw configError;
  if (!isOperationsExcludedContextConfig(config?.metadata)) return null;

  const { data: openLoops, error: loopReadError } = await args.supabase
    .from('agent_work_loops')
    .select('id,evidence')
    .in('source_type', ['organization_context_backfill', 'organization_context_change'])
    .eq('source_key', args.configId)
    .in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked']);
  if (loopReadError) throw loopReadError;
  for (const loop of openLoops ?? []) {
    const { error: loopError } = await args.supabase.from('agent_work_loops').update({
      state: 'dismissed',
      blocker: null,
      next_action: null,
      founder_required: false,
      evidence: {
        ...record(loop.evidence),
        closure: 'operations_excluded_context_config',
      },
      verified_at: args.now,
      resolved_at: args.now,
    })
      .eq('id', loop.id);
    if (loopError) throw loopError;
  }
  return (openLoops ?? []).length > 0;
}

export type OrganizationContextBackfillPreview = {
  readonly mode: 'preview';
  readonly contractVersion: typeof ORGANIZATION_CONTEXT_BACKFILL_VERSION;
  readonly summary: ReturnType<typeof summarizeOrganizationContextBackfill>;
  readonly records: readonly OrganizationContextBackfillPlan[];
};

export type OrganizationContextBackfillCheckpoint = {
  readonly lastSourceKey: string | null;
  readonly status: 'running' | 'complete' | 'failed' | 'needs_review';
};

export interface OrganizationContextBackfillStore {
  listSources(args: { readonly afterConfigId?: string | null; readonly limit: number }): Promise<readonly OrganizationContextBackfillSource[]>;
  readCheckpoint(): Promise<OrganizationContextBackfillCheckpoint | null>;
  applyReady(plan: OrganizationContextBackfillPlan, now: string): Promise<boolean>;
  applyUnresolved(plan: OrganizationContextBackfillPlan, now: string): Promise<boolean>;
  writeCheckpoint(args: {
    readonly lastSourceKey: string | null;
    readonly status: OrganizationContextBackfillCheckpoint['status'];
    readonly summary: ReturnType<typeof summarizeOrganizationContextBackfill>;
    readonly now: string;
  }): Promise<void>;
}

export async function previewOrganizationContextBackfill(args: {
  readonly store: OrganizationContextBackfillStore;
  readonly pageSize?: number;
}): Promise<OrganizationContextBackfillPreview> {
  const records: OrganizationContextBackfillPlan[] = [];
  let afterConfigId: string | null = null;
  const pageSize = Math.max(1, Math.min(args.pageSize ?? PAGE_SIZE, 1_000));
  for (;;) {
    const sources = await args.store.listSources({ afterConfigId, limit: pageSize });
    if (sources.length === 0) break;
    records.push(...sources.map(classifyOrganizationContextBackfill));
    afterConfigId = sources[sources.length - 1]!.configId;
    if (sources.length < pageSize) break;
  }
  records.sort((left, right) => left.configId.localeCompare(right.configId));
  return {
    mode: 'preview',
    contractVersion: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
    summary: summarizeOrganizationContextBackfill(records),
    records,
  };
}

export async function applyOrganizationContextBackfill(args: {
  readonly store: OrganizationContextBackfillStore;
  readonly confirmation: string;
  readonly now?: Date;
  readonly pageSize?: number;
}): Promise<{
  readonly mode: 'apply';
  readonly summary: OrganizationContextBackfillPreview['summary'];
  readonly changed: number;
  readonly resumedAfter: string | null;
  readonly status: 'complete' | 'needs_review';
}> {
  if (args.confirmation !== ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION) {
    throw new Error(`Apply requires explicit confirmation ${ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION}.`);
  }
  const preview = await previewOrganizationContextBackfill({ store: args.store, pageSize: args.pageSize });
  const checkpoint = await args.store.readCheckpoint();
  const resumedAfter = checkpoint?.lastSourceKey ?? null;
  const pending = resumedAfter
    ? preview.records.filter((item) => item.configId.localeCompare(resumedAfter) > 0)
    : preview.records;
  const now = (args.now ?? new Date()).toISOString();
  let changed = 0;
  for (const item of pending) {
    changed += await (item.classification === 'ready'
      ? args.store.applyReady(item, now)
      : args.store.applyUnresolved(item, now)) ? 1 : 0;
    await args.store.writeCheckpoint({
      lastSourceKey: item.configId,
      status: 'running',
      summary: preview.summary,
      now,
    });
  }
  const status = preview.summary.ambiguous + preview.summary.conflicted + preview.summary.unmapped > 0
    ? 'needs_review' as const
    : 'complete' as const;
  await args.store.writeCheckpoint({
    lastSourceKey: preview.records.at(-1)?.configId ?? resumedAfter,
    status,
    summary: preview.summary,
    now,
  });
  return { mode: 'apply', summary: preview.summary, changed, resumedAfter, status };
}

async function ownerMetadata(args: {
  readonly supabase: SupabaseLike;
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string;
  readonly domainId: string;
}): Promise<{ readonly id: string; readonly metadata: Record<string, unknown> } | null> {
  const { data, error } = await args.supabase
    .from('intelligence_domain_owners')
    .select('id,metadata')
    .eq('domain_id', args.domainId)
    .eq('owner_type', args.ownerType)
    .eq('owner_id', args.ownerId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ? { id: String(data.id), metadata: record(data.metadata) } : null;
}

export function createSupabaseOrganizationContextBackfillStore(
  supabase: SupabaseLike,
): OrganizationContextBackfillStore {
  const repository = createOrganizationContextRepository(supabase);
  return {
    async listSources({ afterConfigId, limit }) {
      let query = supabase
        .from('client_benchmark_configs')
        .select('id,startup_workspace_id,agency_account_id,benchmark_domain_id,topic,location,query_set_id,competitor_list,cadence,platforms_enabled,report_email,metadata,created_at,updated_at')
        .order('id', { ascending: true })
        .limit(limit);
      if (afterConfigId) query = query.gt('id', afterConfigId);
      const { data, error } = await query;
      if (error) throw error;
      return Promise.all(((data ?? []) as ClientBenchmarkConfigRow[]).map(async (config) => {
        const owner = organizationOwnerForMeasurementConfig(config);
        const { data: mapping, error: mappingError } = await supabase
          .from('intelligence_source_identity_maps')
          .select('canonical_domain_id,mapping_status')
          .eq('source_kind', 'benchmark_domain')
          .eq('source_id', config.benchmark_domain_id)
          .maybeSingle();
        if (mappingError) throw mappingError;
        const domainId = string(mapping?.canonical_domain_id);
        const mappingStatus = mapping?.mapping_status === 'mapped'
          || mapping?.mapping_status === 'needs_review'
          || mapping?.mapping_status === 'unmapped'
          ? mapping.mapping_status
          : null;
        const lookup = owner && domainId
          ? await repository.getByOwnerAndDomain({
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              domainId,
            })
          : null;
        const storedOwner = owner?.ownerId && domainId
          ? await ownerMetadata({
              supabase,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              domainId,
            })
          : null;
        const routedUserId = owner
          ? await resolveOrganizationContextOwnerUserId({
              supabase,
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
            })
          : null;
        return {
          configId: config.id,
          ownerType: owner?.ownerType ?? null,
          ownerId: owner?.ownerId ?? null,
          domainId,
          mappingStatus,
          lookup,
          previousContext: storedOrganizationContext(storedOwner?.metadata),
          routedUserId,
          alreadyAppliedVersion: string(config.metadata?.['organization_context_backfill_version']),
        } satisfies OrganizationContextBackfillSource;
      }));
    },

    async readCheckpoint() {
      const { data, error } = await supabase
        .from('intelligence_backfill_checkpoints')
        .select('last_source_key,status')
        .eq('backfill_key', BACKFILL_KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        lastSourceKey: string(data.last_source_key),
        status: data.status as OrganizationContextBackfillCheckpoint['status'],
      };
    },

    async applyReady(plan, now) {
      const excluded = await retireOperationsExcludedContextLoop({
        supabase,
        configId: plan.configId,
        now,
      });
      if (excluded !== null) return excluded;
      if (!plan.context || !plan.ownerType || !plan.ownerId || !plan.domainId) {
        throw new Error(`Ready plan ${plan.configId} is missing its exact context scope.`);
      }
      const owner = await ownerMetadata({
        supabase,
        ownerType: plan.ownerType,
        ownerId: plan.ownerId,
        domainId: plan.domainId,
      });
      if (!owner) throw new Error(`Owner row missing for ready config ${plan.configId}.`);
      let changed = false;
      const previousSnapshot = storedOrganizationContext(owner.metadata);
      if (previousSnapshot?.contentHash !== plan.context.contentHash
        || owner.metadata['organization_context_backfill_version'] !== ORGANIZATION_CONTEXT_BACKFILL_VERSION) {
        const { error } = await supabase.from('intelligence_domain_owners').update({
          metadata: {
            ...owner.metadata,
            organization_context_snapshot: plan.context,
            organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
            organization_context_backfilled_at: now,
          },
        }).eq('id', owner.id);
        if (error) throw error;
        changed = true;
      }
      const reconciled = await reconcileConfirmedOrganizationContext({
        supabase,
        context: plan.context,
        now: new Date(now),
      });
      return changed || reconciled.changedConfigs > 0;
    },

    async applyUnresolved(plan, now) {
      const excluded = await retireOperationsExcludedContextLoop({
        supabase,
        configId: plan.configId,
        now,
      });
      if (excluded !== null) return excluded;
      const { data: config, error: configReadError } = await supabase
        .from('client_benchmark_configs')
        .select('metadata')
        .eq('id', plan.configId)
        .maybeSingle();
      if (configReadError) throw configReadError;
      const metadata = record(config?.metadata);
      const same = metadata['organization_context_backfill_version'] === ORGANIZATION_CONTEXT_BACKFILL_VERSION
        && metadata['organization_context_backfill_classification'] === plan.classification
        && JSON.stringify(metadata['organization_context_backfill_reasons']) === JSON.stringify(plan.reasons);
      if (!same) {
        const { error } = await supabase.from('client_benchmark_configs').update({
          metadata: {
            ...metadata,
            organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
            organization_context_backfill_classification: plan.classification,
            organization_context_backfill_reasons: plan.reasons,
            organization_context_backfilled_at: now,
            report_delivery_state: 'blocked_pending_context_confirmation',
            baseline_required_reason: 'organization_context_confirmation_required',
          },
          updated_at: now,
        }).eq('id', plan.configId);
        if (error) throw error;
      }
      const loopEvidence = {
        classification: plan.classification,
        reasons: plan.reasons,
        context_version: plan.context?.contextVersion ?? null,
      };
      const loopOwner = plan.routedUserId ? `user:${plan.routedUserId}` : 'Maya';
      const loopPayload = {
        source_type: 'organization_context_backfill',
        source_key: plan.configId,
        lane: 'intelligence',
        owner: loopOwner,
        state: 'assigned',
        severity: 'today',
        title: 'Confirm organization context',
        detail: `Existing measurement configuration is ${plan.classification}: ${plan.reasons.join(', ')}.`,
        next_action: plan.routedUserId
          ? 'Open the organization profile, correct any market details, and confirm before a fresh baseline.'
          : 'Restore an authorized workspace member, then route context confirmation to that user.',
        due_at: new Date(Date.parse(now) + 48 * 60 * 60 * 1_000).toISOString(),
        attempt_count: 0,
        max_attempts: 3,
        founder_required: false,
        blocker: 'organization_context_confirmation_required',
        evidence: loopEvidence,
        metadata: {
          organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
          routed_user_id: plan.routedUserId,
          retry_policy: 'retry_on_new_evidence_or_user_confirmation_only',
        },
      };
      const { data: existingLoop, error: loopReadError } = await supabase
        .from('agent_work_loops')
        .select('id,owner,evidence,metadata')
        .eq('source_type', 'organization_context_backfill')
        .eq('source_key', plan.configId)
        .maybeSingle();
      if (loopReadError) throw loopReadError;
      const sameLoop = existingLoop
        && existingLoop.owner === loopOwner
        && JSON.stringify(existingLoop.evidence) === JSON.stringify(loopEvidence)
        && record(existingLoop.metadata)['organization_context_backfill_version'] === ORGANIZATION_CONTEXT_BACKFILL_VERSION;
      if (!sameLoop) {
        const loopWrite = existingLoop?.id
          ? await supabase.from('agent_work_loops').update(loopPayload).eq('id', existingLoop.id)
          : await supabase.from('agent_work_loops').insert(loopPayload);
        if (loopWrite.error) throw loopWrite.error;
      }
      return !same || !sameLoop;
    },

    async writeCheckpoint({ lastSourceKey, status, summary, now }) {
      const { error } = await supabase.from('intelligence_backfill_checkpoints').upsert({
        backfill_key: BACKFILL_KEY,
        contract_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
        last_source_key: lastSourceKey,
        source_count: summary.total,
        indexed_count: summary.ready,
        duplicate_count: summary.ambiguous + summary.conflicted,
        orphan_count: summary.unmapped,
        source_snapshot: `${summary.total}:${summary.ready}:${summary.ambiguous}:${summary.conflicted}:${summary.unmapped}`,
        status,
        completed_at: status === 'running' ? null : now,
        metadata: { classifications: summary, preview_first: true, destructive_writes: false },
      }, { onConflict: 'backfill_key' });
      if (error) throw error;
    },
  };
}
