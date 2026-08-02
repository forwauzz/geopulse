import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveOrganizationMeasurementBinding,
  type OrganizationMeasurementBinding,
  type OrganizationMeasurementBindingReason,
} from '../intelligence/organization-measurement-context';
import type { OrganizationContext, OrganizationOwnerType } from '../intelligence/organization-context';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';

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
        | 'organization_context_owner_mismatch'
        | 'organization_context_identity_mismatch'
      )[];
    };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function organizationOwnerForMeasurementConfig(config: ClientBenchmarkConfigRow): {
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

export function storedOrganizationContext(metadata: unknown): OrganizationContext | null {
  const ownerMetadata = record(metadata);
  const candidate = ownerMetadata['organization_context_snapshot']
    ?? ownerMetadata['organization_context'];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const context = candidate as Partial<OrganizationContext>;
  if (!context.owner || !context.organization || !context.market) return null;
  if (typeof context.contextId !== 'string'
    || typeof context.contextVersion !== 'string'
    || typeof context.contentHash !== 'string'
    || typeof context.organization.identityId !== 'string'
    || typeof context.organization.canonicalDomain !== 'string'
    || !Array.isArray(context.organization.services)
    || typeof context.market.scope !== 'string'
    || typeof context.market.countryCode !== 'string'
    || !Array.isArray(context.market.serviceAreas)
    || !Array.isArray(context.market.languages)
    || typeof context.market.timezone !== 'string'
    || !Array.isArray(context.market.approvedCompetitorDomains)) return null;
  return candidate as OrganizationContext;
}

/**
 * Load a confirmed tenant context for baseline activation without importing the Next-only
 * Organization Context repository into the shared Cloudflare Worker graph.
 */
export async function loadConfirmedOrganizationContextByHost(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string;
  readonly canonicalDomain: string;
}): Promise<OrganizationContext | null> {
  const host = args.canonicalDomain.trim().toLowerCase().replace(/^www\./, '');
  const { data: domain, error: domainError } = await args.supabase
    .from('intelligence_domains')
    .select('id')
    .eq('normalized_host', host)
    .maybeSingle();
  if (domainError) throw domainError;
  if (!domain?.id) return null;

  const { data: owner, error: ownerError } = await args.supabase
    .from('intelligence_domain_owners')
    .select('owner_type,owner_id,metadata')
    .eq('domain_id', String(domain.id))
    .eq('owner_type', args.ownerType)
    .eq('owner_id', args.ownerId)
    .maybeSingle();
  if (ownerError) throw ownerError;
  const context = storedOrganizationContext(owner?.metadata);
  if (!context || context.status !== 'confirmed') return null;
  if (context.owner.type !== args.ownerType || context.owner.id !== args.ownerId) return null;
  if (context.organization.identityId !== String(domain.id)) return null;
  if (context.organization.canonicalDomain.replace(/^www\./, '') !== host) return null;
  return context;
}

/** Resolve the current context from the canonical intelligence plane, never from a stale config copy. */
export async function loadActiveOrganizationMeasurementContext(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly config: ClientBenchmarkConfigRow;
}): Promise<ActiveOrganizationMeasurementContext> {
  const owner = organizationOwnerForMeasurementConfig(args.config);
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

  let ownerQuery = args.supabase
    .from('intelligence_domain_owners')
    .select('owner_type,owner_id,metadata')
    .eq('domain_id', String(mapping.canonical_domain_id))
    .eq('owner_type', owner.ownerType);
  ownerQuery = owner.ownerId === null
    ? ownerQuery.is('owner_id', null)
    : ownerQuery.eq('owner_id', owner.ownerId);
  const { data: ownerData, error: ownerError } = await ownerQuery.maybeSingle();
  if (ownerError) throw ownerError;
  if (!ownerData) return { status: 'blocked', reasons: ['owner_scope_missing'] };

  const context = storedOrganizationContext(ownerData.metadata);
  if (!context) return { status: 'blocked', reasons: ['organization_context_missing'] };
  if (context.owner.type !== owner.ownerType || context.owner.id !== owner.ownerId) {
    return { status: 'blocked', reasons: ['organization_context_owner_mismatch'] };
  }
  if (context.organization.identityId !== String(mapping.canonical_domain_id)) {
    return { status: 'blocked', reasons: ['organization_context_identity_mismatch'] };
  }

  const derived = deriveOrganizationMeasurementBinding(context);
  return derived.ok
    ? { status: 'ready', context, binding: derived.binding }
    : { status: 'blocked', reasons: derived.reasons };
}
