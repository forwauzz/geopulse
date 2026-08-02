import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ORGANIZATION_CONTEXT_BACKFILL_VERSION,
  planOrganizationContextChange,
} from '../intelligence/organization-context-backfill';
import type { OrganizationContext, OrganizationOwnerType } from '../intelligence/organization-context';
import {
  deriveOrganizationMeasurementBinding,
  organizationMeasurementMetadata,
} from '../intelligence/organization-measurement-context';

type SupabaseLike = SupabaseClient<any, 'public', any>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function resolveOrganizationContextOwnerUserId(args: {
  readonly supabase: SupabaseLike;
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string | null;
}): Promise<string | null> {
  if (!args.ownerId) return null;
  if (args.ownerType === 'user') return args.ownerId;
  if (args.ownerType === 'startup_workspace') {
    const { data, error } = await args.supabase
      .from('startup_workspace_users')
      .select('user_id,role')
      .eq('startup_workspace_id', args.ownerId)
      .eq('status', 'active');
    if (error) throw error;
    const priority = ['founder', 'admin', 'member', 'viewer'];
    return ((data ?? []) as Array<{ user_id: string; role: string }>)
      .sort((left, right) => priority.indexOf(left.role) - priority.indexOf(right.role))[0]?.user_id ?? null;
  }

  let agencyAccountId = args.ownerId;
  if (args.ownerType === 'agency_client') {
    const { data, error } = await args.supabase
      .from('agency_clients')
      .select('agency_account_id')
      .eq('id', args.ownerId)
      .maybeSingle();
    if (error) throw error;
    agencyAccountId = typeof data?.agency_account_id === 'string' ? data.agency_account_id : '';
  }
  if (!agencyAccountId) return null;
  const { data, error } = await args.supabase
    .from('agency_users')
    .select('user_id,role')
    .eq('agency_account_id', agencyAccountId)
    .eq('status', 'active');
  if (error) throw error;
  const priority = ['owner', 'manager', 'member', 'viewer'];
  return ((data ?? []) as Array<{ user_id: string; role: string }>)
    .sort((left, right) => priority.indexOf(left.role) - priority.indexOf(right.role))[0]?.user_id ?? null;
}

/**
 * Record an already-detected material context change. Historical runs and artifacts remain untouched;
 * future measurement/delivery is paused until the tenant confirms the new context and a fresh baseline runs.
 */
export async function recordMaterialOrganizationContextChange(args: {
  readonly supabase: SupabaseLike;
  readonly previous: OrganizationContext | null;
  readonly next: OrganizationContext;
  readonly now?: Date;
}): Promise<{ readonly changed: boolean; readonly affectedConfigs: number; readonly reasons: readonly string[] }> {
  const change = planOrganizationContextChange({ previous: args.previous, next: args.next });
  if (change.status === 'unchanged') return { changed: false, affectedConfigs: 0, reasons: [] };
  const now = (args.now ?? new Date()).toISOString();
  const { data: mappings, error: mappingError } = await args.supabase
    .from('intelligence_source_identity_maps')
    .select('source_id')
    .eq('source_kind', 'benchmark_domain')
    .eq('canonical_domain_id', args.next.organization.identityId)
    .eq('mapping_status', 'mapped');
  if (mappingError) throw mappingError;
  const benchmarkDomainIds = [...new Set((mappings ?? [])
    .map((item: { source_id?: unknown }) => typeof item.source_id === 'string' ? item.source_id : null)
    .filter((item: string | null): item is string => Boolean(item)))];
  if (benchmarkDomainIds.length === 0) {
    return { changed: true, affectedConfigs: 0, reasons: change.reasons };
  }

  const { data: configs, error: configsError } = await args.supabase
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,agency_account_id,metadata')
    .in('benchmark_domain_id', benchmarkDomainIds);
  if (configsError) throw configsError;
  let affectedConfigs = 0;
  const routedUserId = await resolveOrganizationContextOwnerUserId({
    supabase: args.supabase,
    ownerType: args.next.owner.type,
    ownerId: args.next.owner.id,
  });
  for (const config of (configs ?? []) as Array<Record<string, unknown>>) {
    const metadata = record(config['metadata']);
    const configOwnerType: OrganizationOwnerType | null = typeof config['startup_workspace_id'] === 'string'
      ? 'startup_workspace'
      : typeof metadata['agency_client_id'] === 'string'
        ? 'agency_client'
        : typeof config['agency_account_id'] === 'string'
          ? 'agency_account'
          : null;
    const configOwnerId = typeof config['startup_workspace_id'] === 'string'
      ? config['startup_workspace_id']
      : typeof metadata['agency_client_id'] === 'string'
        ? metadata['agency_client_id']
        : typeof config['agency_account_id'] === 'string'
          ? config['agency_account_id']
          : null;
    if (configOwnerType !== args.next.owner.type || configOwnerId !== args.next.owner.id) continue;
    const configId = String(config['id']);
    const nextMetadata = {
      ...metadata,
      baseline_status: 'queued',
      baseline_required_reason: 'organization_context_changed',
      report_delivery_state: 'blocked_pending_context_confirmation',
      organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
      organization_context_change: {
        previous_context_version: args.previous?.contextVersion ?? null,
        proposed_context_version: args.next.contextVersion,
        reasons: change.reasons,
        detected_at: now,
      },
    };
    const { error: updateError } = await args.supabase
      .from('client_benchmark_configs')
      .update({ metadata: nextMetadata, updated_at: now })
      .eq('id', configId);
    if (updateError) throw updateError;
    const { error: loopError } = await args.supabase.from('agent_work_loops').upsert({
      source_type: 'organization_context_change',
      source_key: configId,
      lane: 'intelligence',
      owner: routedUserId ? `user:${routedUserId}` : 'Maya',
      state: 'assigned',
      severity: 'today',
      title: 'Confirm changed organization context',
      detail: 'A material market, service, buyer, language, alias, or competitor change requires tenant confirmation before future delivery.',
      next_action: routedUserId
        ? 'Review and confirm the proposed organization context, then run a fresh baseline.'
        : 'Restore an authorized workspace member, then route context confirmation to that user.',
      due_at: new Date(Date.parse(now) + 48 * 60 * 60 * 1_000).toISOString(),
      attempt_count: 0,
      max_attempts: 3,
      founder_required: false,
      blocker: 'organization_context_confirmation_required',
      evidence: {
        previous_context_version: args.previous?.contextVersion ?? null,
        proposed_context_version: args.next.contextVersion,
        reasons: change.reasons,
      },
      metadata: {
        organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
        routed_user_id: routedUserId,
        retry_policy: 'retry_on_new_evidence_or_user_confirmation_only',
      },
    }, { onConflict: 'source_type,source_key' });
    if (loopError) throw loopError;
    affectedConfigs += 1;
  }
  return { changed: true, affectedConfigs, reasons: change.reasons };
}

/** Close context-confirmation work after an exact tenant confirmation, but keep delivery paused for a fresh baseline. */
export async function reconcileConfirmedOrganizationContext(args: {
  readonly supabase: SupabaseLike;
  readonly context: OrganizationContext;
  readonly now?: Date;
}): Promise<{ readonly affectedConfigs: number; readonly changedConfigs: number }> {
  const binding = deriveOrganizationMeasurementBinding(args.context);
  if (!binding.ok) throw new Error(`organization_context_not_measurement_ready:${binding.reasons.join(',')}`);
  const now = (args.now ?? new Date()).toISOString();
  const { data: mappings, error: mappingError } = await args.supabase
    .from('intelligence_source_identity_maps')
    .select('source_id')
    .eq('source_kind', 'benchmark_domain')
    .eq('canonical_domain_id', args.context.organization.identityId)
    .eq('mapping_status', 'mapped');
  if (mappingError) throw mappingError;
  const benchmarkDomainIds = [...new Set((mappings ?? [])
    .map((item: { source_id?: unknown }) => typeof item.source_id === 'string' ? item.source_id : null)
    .filter((item: string | null): item is string => Boolean(item)))];
  if (benchmarkDomainIds.length === 0) return { affectedConfigs: 0, changedConfigs: 0 };
  const { data: configs, error: configsError } = await args.supabase
    .from('client_benchmark_configs')
    .select('id,startup_workspace_id,agency_account_id,metadata')
    .in('benchmark_domain_id', benchmarkDomainIds);
  if (configsError) throw configsError;
  let affectedConfigs = 0;
  let changedConfigs = 0;
  for (const config of (configs ?? []) as Array<Record<string, unknown>>) {
    const metadata = record(config['metadata']);
    const ownerType: OrganizationOwnerType | null = typeof config['startup_workspace_id'] === 'string'
      ? 'startup_workspace'
      : typeof metadata['agency_client_id'] === 'string'
        ? 'agency_client'
        : typeof config['agency_account_id'] === 'string'
          ? 'agency_account'
          : null;
    const ownerId = typeof config['startup_workspace_id'] === 'string'
      ? config['startup_workspace_id']
      : typeof metadata['agency_client_id'] === 'string'
        ? metadata['agency_client_id']
        : typeof config['agency_account_id'] === 'string'
          ? config['agency_account_id']
          : null;
    if (ownerType !== args.context.owner.type || ownerId !== args.context.owner.id) continue;
    const configId = String(config['id']);
    const contextChanged = metadata['organization_context_version'] !== binding.binding.contextVersion;
    const nextMetadata = {
      ...metadata,
      ...organizationMeasurementMetadata(binding.binding),
      organization_context_backfill_version: ORGANIZATION_CONTEXT_BACKFILL_VERSION,
      organization_context_backfill_classification: 'ready',
      organization_context_backfilled_at: metadata['organization_context_backfill_version'] === ORGANIZATION_CONTEXT_BACKFILL_VERSION
        ? metadata['organization_context_backfilled_at']
        : now,
      report_delivery_state: contextChanged ? 'blocked_pending_fresh_baseline' : 'ready',
      baseline_status: contextChanged ? 'queued' : metadata['baseline_status'],
      baseline_required_reason: contextChanged ? 'organization_context_confirmed' : metadata['baseline_required_reason'],
    };
    if (JSON.stringify(metadata) !== JSON.stringify(nextMetadata)) {
      const { error: updateError } = await args.supabase.from('client_benchmark_configs').update({
        metadata: nextMetadata,
        updated_at: now,
      }).eq('id', configId);
      if (updateError) throw updateError;
      changedConfigs += 1;
    }
    const { error: loopError } = await args.supabase.from('agent_work_loops').update({
      state: 'completed', blocker: null, next_action: null, verified_at: now, resolved_at: now,
      evidence: { context_version: args.context.contextVersion, closure: 'confirmed_context_backfilled' },
    }).in('source_type', ['organization_context_backfill', 'organization_context_change'])
      .eq('source_key', configId)
      .in('state', ['discovered', 'assigned', 'executing', 'verifying', 'blocked']);
    if (loopError) throw loopError;
    affectedConfigs += 1;
  }
  return { affectedConfigs, changedConfigs };
}
