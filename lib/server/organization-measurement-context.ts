import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveOrganizationMeasurementBinding,
  type OrganizationMeasurementBinding,
  type OrganizationMeasurementBindingReason,
} from '../intelligence/organization-measurement-context';
import type { OrganizationContext, OrganizationOwnerType } from '../intelligence/organization-context';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import { createOrganizationContextRepository } from './organization-context-repository';

export type ActiveOrganizationMeasurementContext =
  | {
      readonly status: 'ready';
      readonly context: OrganizationContext;
      readonly binding: OrganizationMeasurementBinding;
    }
  | {
      readonly status: 'blocked';
      readonly reasons: readonly (
        | OrganizationMeasurementBindingReason
        | 'identity_mapping_missing'
        | 'identity_mapping_needs_review'
        | 'owner_scope_missing'
        | 'organization_context_missing'
      )[];
    };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function ownerForConfig(config: ClientBenchmarkConfigRow): {
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string | null;
} | null {
  if (config.startup_workspace_id) {
    return { ownerType: 'startup_workspace', ownerId: config.startup_workspace_id };
  }
  const agencyClientId = record(config.metadata)['agency_client_id'];
  if (typeof agencyClientId === 'string' && agencyClientId.trim()) {
    return { ownerType: 'agency_client', ownerId: agencyClientId.trim() };
  }
  if (config.agency_account_id) {
    return { ownerType: 'agency_account', ownerId: config.agency_account_id };
  }
  return null;
}

/** Resolve the current context from the canonical intelligence plane, never from a stale config copy. */
export async function loadActiveOrganizationMeasurementContext(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
}): Promise<ActiveOrganizationMeasurementContext> {
  const owner = ownerForConfig(args.config);
  if (!owner) return { status: 'blocked', reasons: ['owner_scope_missing'] };

  const { data: mapping, error: mappingError } = await args.supabase
    .from('intelligence_source_identity_maps')
    .select('canonical_domain_id,mapping_status')
    .eq('source_kind', 'benchmark_domain')
    .eq('source_id', args.config.benchmark_domain_id)
    .maybeSingle();
  if (mappingError) throw mappingError;
  if (!mapping?.canonical_domain_id) {
    return { status: 'blocked', reasons: [mapping?.mapping_status === 'needs_review'
      ? 'identity_mapping_needs_review'
      : 'identity_mapping_missing'] };
  }

  const lookup = await createOrganizationContextRepository(args.supabase).getByOwnerAndDomain({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    domainId: String(mapping.canonical_domain_id),
  });
  if (lookup.status !== 'ready') {
    return {
      status: 'blocked',
      reasons: [lookup.status === 'unauthorized' ? 'owner_scope_missing' : 'organization_context_missing'],
    };
  }
  const derived = deriveOrganizationMeasurementBinding(lookup.context);
  return derived.ok
    ? { status: 'ready', context: lookup.context, binding: derived.binding }
    : { status: 'blocked', reasons: derived.reasons };
}
