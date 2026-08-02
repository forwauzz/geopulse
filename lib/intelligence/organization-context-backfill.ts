import { z } from 'zod';
import {
  materialContextChanges,
  organizationContextSchema,
  organizationOwnerTypeSchema,
  type OrganizationContext,
  type OrganizationVersionReason,
} from './organization-context';

export const ORGANIZATION_CONTEXT_BACKFILL_VERSION = 'organization-context-backfill-v1';
export const ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION = 'APPLY_ORGANIZATION_CONTEXT_BACKFILL_V1';

export const organizationContextBackfillClassificationSchema = z.enum([
  'ready',
  'ambiguous',
  'conflicted',
  'unmapped',
]);
export type OrganizationContextBackfillClassification = z.infer<
  typeof organizationContextBackfillClassificationSchema
>;

export const organizationContextBackfillReasonSchema = z.enum([
  'confirmed_context_ready',
  'tenant_confirmation_required',
  'material_context_conflict',
  'owner_scope_missing',
  'owner_scope_invalid',
  'owner_shape_invalid',
  'authorized_user_missing',
  'identity_mapping_missing',
  'identity_mapping_needs_review',
  'domain_missing',
  'domain_retired',
  'country_code_missing',
  'country_code_invalid',
  'subdivision_code_invalid',
  'language_missing',
  'language_invalid',
  'timezone_missing',
  'timezone_invalid',
  'market_scope_missing',
  'market_scope_invalid',
  'confirmation_invalid',
  'projection_time_invalid',
  'context_status_not_active',
]);
export type OrganizationContextBackfillReason = z.infer<typeof organizationContextBackfillReasonSchema>;

export type OrganizationContextBackfillSource = {
  readonly configId: string;
  readonly ownerType: z.infer<typeof organizationOwnerTypeSchema> | null;
  readonly ownerId: string | null;
  readonly domainId: string | null;
  readonly mappingStatus: 'mapped' | 'needs_review' | 'unmapped' | null;
  readonly lookup:
    | { readonly status: 'ready'; readonly context: OrganizationContext }
    | { readonly status: 'unauthorized'; readonly reason: 'owner_scope_missing' | 'owner_shape_invalid' }
    | { readonly status: 'not_found'; readonly reason: 'domain_missing' | 'domain_retired' }
    | {
        readonly status: 'needs_review';
        readonly reason:
          | 'owner_scope_invalid'
          | 'country_code_missing'
          | 'country_code_invalid'
          | 'subdivision_code_invalid'
          | 'language_missing'
          | 'language_invalid'
          | 'timezone_missing'
          | 'timezone_invalid'
          | 'market_scope_missing'
          | 'market_scope_invalid'
          | 'confirmation_invalid'
          | 'projection_time_invalid';
      }
    | null;
  readonly previousContext: OrganizationContext | null;
  readonly routedUserId: string | null;
  readonly alreadyAppliedVersion: string | null;
};

export type OrganizationContextBackfillPlan = {
  readonly configId: string;
  readonly classification: OrganizationContextBackfillClassification;
  readonly reasons: readonly OrganizationContextBackfillReason[];
  readonly ownerType: OrganizationContextBackfillSource['ownerType'];
  readonly ownerId: string | null;
  readonly domainId: string | null;
  readonly routedUserId: string | null;
  readonly context: OrganizationContext | null;
  readonly previousContext: OrganizationContext | null;
  readonly alreadyApplied: boolean;
};

function plan(
  source: OrganizationContextBackfillSource,
  classification: OrganizationContextBackfillClassification,
  reasons: readonly OrganizationContextBackfillReason[],
  context: OrganizationContext | null = null,
): OrganizationContextBackfillPlan {
  return {
    configId: source.configId,
    classification,
    reasons: [...new Set(reasons)].sort(),
    ownerType: source.ownerType,
    ownerId: source.ownerId,
    domainId: source.domainId,
    routedUserId: source.routedUserId,
    context,
    previousContext: source.previousContext,
    alreadyApplied: source.alreadyAppliedVersion === ORGANIZATION_CONTEXT_BACKFILL_VERSION,
  };
}

/** Classify one existing measurement config without writing or inferring missing market facts. */
export function classifyOrganizationContextBackfill(
  source: OrganizationContextBackfillSource,
): OrganizationContextBackfillPlan {
  if (!source.ownerType || !source.ownerId) {
    return plan(source, 'unmapped', ['owner_scope_missing']);
  }
  if (!organizationOwnerTypeSchema.safeParse(source.ownerType).success) {
    return plan(source, 'unmapped', ['owner_shape_invalid']);
  }
  if (!source.domainId) {
    return plan(source, 'unmapped', [source.mappingStatus === 'needs_review'
      ? 'identity_mapping_needs_review'
      : 'identity_mapping_missing']);
  }
  if (!source.lookup) return plan(source, 'unmapped', ['identity_mapping_missing']);
  if (source.lookup.status !== 'ready') {
    if (source.lookup.status === 'unauthorized' || source.lookup.status === 'not_found') {
      return plan(source, 'unmapped', [source.lookup.reason]);
    }
    return source.routedUserId
      ? plan(source, 'ambiguous', [source.lookup.reason])
      : plan(source, 'unmapped', [source.lookup.reason, 'authorized_user_missing']);
  }

  const context = organizationContextSchema.parse(source.lookup.context);
  if (context.status === 'conflicted') {
    return plan(source, 'conflicted', ['material_context_conflict'], context);
  }
  if (context.status !== 'confirmed') {
    if (context.status === 'draft' || context.status === 'detected') {
      return source.routedUserId
        ? plan(source, 'ambiguous', ['tenant_confirmation_required'], context)
        : plan(source, 'unmapped', ['tenant_confirmation_required', 'authorized_user_missing'], context);
    }
    return plan(source, 'unmapped', ['context_status_not_active'], context);
  }
  return plan(source, 'ready', ['confirmed_context_ready'], context);
}

export type OrganizationContextChangePlan =
  | { readonly status: 'unchanged'; readonly reasons: readonly [] }
  | {
      readonly status: 'material_change';
      readonly reasons: readonly OrganizationVersionReason[];
      readonly blocksDelivery: boolean;
    };

/** Ignore timestamps and immaterial presentation changes; act only on context compatibility changes. */
export function planOrganizationContextChange(args: {
  readonly previous: OrganizationContext | null;
  readonly next: OrganizationContext;
}): OrganizationContextChangePlan {
  if (!args.previous) return { status: 'unchanged', reasons: [] };
  const reasons = materialContextChanges(args.previous, args.next);
  if (reasons.length === 0) return { status: 'unchanged', reasons: [] };
  return {
    status: 'material_change',
    reasons,
    blocksDelivery: args.next.status !== 'confirmed'
      || args.previous.contextVersion !== args.next.contextVersion,
  };
}

export function summarizeOrganizationContextBackfill(
  plans: readonly OrganizationContextBackfillPlan[],
): Record<OrganizationContextBackfillClassification | 'total', number> {
  return plans.reduce((summary, item) => {
    summary[item.classification] += 1;
    summary.total += 1;
    return summary;
  }, { total: 0, ready: 0, ambiguous: 0, conflicted: 0, unmapped: 0 });
}
