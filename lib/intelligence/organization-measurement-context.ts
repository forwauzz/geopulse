import { z } from 'zod';
import {
  organizationContextContentHash,
  organizationContextVersion,
} from './organization-context-hash';
import type { OrganizationContext } from './organization-context';

export const ORGANIZATION_MEASUREMENT_POLICY_VERSION = 'organization-measurement-v1';
export const ORGANIZATION_QUERY_GENERATOR_VERSION = 'organization-query-v1';

const measurementBindingSchema = z.object({
  policyVersion: z.literal(ORGANIZATION_MEASUREMENT_POLICY_VERSION),
  queryGeneratorVersion: z.literal(ORGANIZATION_QUERY_GENERATOR_VERSION),
  organizationIdentityId: z.string().uuid(),
  contextId: z.string().min(1),
  contextVersion: z.string().min(1),
  contextHash: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
  canonicalDomain: z.string().min(1),
  category: z.string().min(1),
  services: z.array(z.string().min(1)),
  marketScope: z.enum(['local', 'regional', 'national', 'global', 'online']),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  subdivisionCode: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/).nullable(),
  locality: z.string().min(1).nullable(),
  serviceAreas: z.array(z.string().min(1)),
  languages: z.array(z.string().min(1)).min(1),
  timezone: z.string().min(1),
  buyer: z.string().min(1).nullable(),
  querySetVersion: z.string().regex(/^oqs1-[0-9a-f]{8}-g1$/),
  competitorCohortVersion: z.string().regex(/^occ1-[0-9a-f]{8}$/),
  trackedCompetitorDomains: z.array(z.string().min(1)),
});

export type OrganizationMeasurementBinding = z.infer<typeof measurementBindingSchema>;

export type OrganizationMeasurementBindingReason =
  | 'context_not_confirmed'
  | 'context_confirmation_missing'
  | 'context_hash_mismatch'
  | 'category_missing'
  | 'canonical_domain_invalid'
  | 'competitor_self_reference'
  | 'configuration_unbound'
  | 'configuration_context_mismatch'
  | 'query_set_unbound'
  | 'query_set_version_mismatch'
  | 'query_set_context_mismatch'
  | 'competitor_cohort_mismatch'
  | 'market_mismatch'
  | 'language_mismatch'
  | 'run_context_mismatch';

export type OrganizationMeasurementBindingResult =
  | { readonly ok: true; readonly binding: OrganizationMeasurementBinding }
  | { readonly ok: false; readonly reasons: readonly OrganizationMeasurementBindingReason[] };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canonicalDomain(value: string): string | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)
      ? host
      : null;
  } catch {
    return null;
  }
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sortedDomains(values: readonly string[]): string[] {
  return sortedUnique(values.flatMap((value) => {
    const domain = canonicalDomain(value);
    return domain ? [domain] : [];
  }));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function contextHashSuffix(contentHash: string): string {
  return contentHash.replace(/^fnv1a32:/, '');
}

export function deriveOrganizationMeasurementBinding(
  context: OrganizationContext,
): OrganizationMeasurementBindingResult {
  const reasons = new Set<OrganizationMeasurementBindingReason>();
  if (context.status !== 'confirmed') reasons.add('context_not_confirmed');
  if (!context.confirmation) reasons.add('context_confirmation_missing');
  const {
    contentHash: storedContentHash,
    contextVersion: storedContextVersion,
    projectedAt: _projectedAt,
    ...hashableContext
  } = context;
  const computedContentHash = organizationContextContentHash(hashableContext);
  if (computedContentHash !== storedContentHash
    || organizationContextVersion(storedContentHash) !== storedContextVersion) {
    reasons.add('context_hash_mismatch');
  }
  if (!context.organization.category?.trim()) reasons.add('category_missing');
  const measuredDomain = canonicalDomain(context.organization.canonicalDomain);
  if (!measuredDomain) reasons.add('canonical_domain_invalid');
  const competitors = sortedDomains(context.market.approvedCompetitorDomains);
  if (measuredDomain && competitors.includes(measuredDomain)) reasons.add('competitor_self_reference');
  if (reasons.size > 0 || !measuredDomain || !context.organization.category) {
    return { ok: false, reasons: [...reasons].sort() };
  }

  const suffix = contextHashSuffix(storedContentHash);
  return {
    ok: true,
    binding: measurementBindingSchema.parse({
      policyVersion: ORGANIZATION_MEASUREMENT_POLICY_VERSION,
      queryGeneratorVersion: ORGANIZATION_QUERY_GENERATOR_VERSION,
      organizationIdentityId: context.organization.identityId,
      contextId: context.contextId,
      contextVersion: context.contextVersion,
      contextHash: context.contentHash,
      canonicalDomain: measuredDomain,
      category: context.organization.category.trim(),
      services: sortedUnique(context.organization.services),
      marketScope: context.market.scope,
      countryCode: context.market.countryCode,
      subdivisionCode: context.market.subdivisionCode,
      locality: context.market.locality,
      serviceAreas: sortedUnique(context.market.serviceAreas),
      languages: sortedUnique(context.market.languages),
      timezone: context.market.timezone,
      buyer: context.market.buyer,
      querySetVersion: `oqs1-${suffix}-g1`,
      competitorCohortVersion: `occ1-${suffix}`,
      trackedCompetitorDomains: competitors,
    }),
  };
}

export function organizationMeasurementMetadata(
  binding: OrganizationMeasurementBinding,
): Record<string, unknown> {
  return {
    organization_measurement_policy_version: binding.policyVersion,
    query_generator_version: binding.queryGeneratorVersion,
    organization_identity_id: binding.organizationIdentityId,
    organization_context_id: binding.contextId,
    organization_context_version: binding.contextVersion,
    organization_context_hash: binding.contextHash,
    canonical_domain: binding.canonicalDomain,
    category: binding.category,
    services: binding.services,
    market_scope: binding.marketScope,
    market_country_code: binding.countryCode,
    market_subdivision_code: binding.subdivisionCode,
    market_locality: binding.locality,
    market_service_areas: binding.serviceAreas,
    market_languages: binding.languages,
    market_timezone: binding.timezone,
    market_buyer: binding.buyer,
    query_set_version: binding.querySetVersion,
    competitor_cohort_version: binding.competitorCohortVersion,
    tracked_competitor_domains: binding.trackedCompetitorDomains,
  };
}

/** Read the portable binding from existing JSON metadata without exposing database row types. */
export function readOrganizationMeasurementBinding(
  metadata: unknown,
): OrganizationMeasurementBinding | null {
  const value = record(metadata);
  const parsed = measurementBindingSchema.safeParse({
    policyVersion: value['organization_measurement_policy_version'],
    queryGeneratorVersion: value['query_generator_version'],
    organizationIdentityId: value['organization_identity_id'],
    contextId: value['organization_context_id'],
    contextVersion: value['organization_context_version'],
    contextHash: value['organization_context_hash'],
    canonicalDomain: value['canonical_domain'],
    category: value['category'],
    services: value['services'],
    marketScope: value['market_scope'],
    countryCode: value['market_country_code'],
    subdivisionCode: value['market_subdivision_code'] ?? null,
    locality: value['market_locality'] ?? null,
    serviceAreas: value['market_service_areas'],
    languages: value['market_languages'],
    timezone: value['market_timezone'],
    buyer: value['market_buyer'] ?? null,
    querySetVersion: value['query_set_version'],
    competitorCohortVersion: value['competitor_cohort_version'],
    trackedCompetitorDomains: value['tracked_competitor_domains'],
  });
  return parsed.success ? parsed.data : null;
}

function metadataMatchesBinding(
  metadata: unknown,
  binding: OrganizationMeasurementBinding,
): boolean {
  const value = record(metadata);
  return value['organization_measurement_policy_version'] === binding.policyVersion
    && value['organization_identity_id'] === binding.organizationIdentityId
    && value['organization_context_id'] === binding.contextId
    && value['organization_context_version'] === binding.contextVersion
    && value['organization_context_hash'] === binding.contextHash
    && value['canonical_domain'] === binding.canonicalDomain;
}

export function evaluateOrganizationMeasurementCompatibility(args: {
  readonly binding: OrganizationMeasurementBinding;
  readonly configMetadata: unknown;
  readonly querySet: { readonly version: string; readonly metadata: unknown } | null;
  readonly competitorList: readonly string[];
  readonly runMetadata?: unknown;
}): {
  readonly compatible: boolean;
  readonly baselineRequired: boolean;
  readonly reasons: readonly OrganizationMeasurementBindingReason[];
} {
  const reasons = new Set<OrganizationMeasurementBindingReason>();
  const config = record(args.configMetadata);
  const storedContextVersion = text(config['organization_context_version']);
  const baselineRequired = storedContextVersion !== null
    && storedContextVersion !== args.binding.contextVersion;

  if (!metadataMatchesBinding(config, args.binding)) {
    reasons.add(storedContextVersion ? 'configuration_context_mismatch' : 'configuration_unbound');
  }
  if (!args.querySet) {
    reasons.add('query_set_unbound');
  } else {
    if (args.querySet.version !== args.binding.querySetVersion) reasons.add('query_set_version_mismatch');
    if (!metadataMatchesBinding(args.querySet.metadata, args.binding)) reasons.add('query_set_context_mismatch');
    const queryMetadata = record(args.querySet.metadata);
    if (queryMetadata['market_country_code'] !== args.binding.countryCode
      || queryMetadata['market_scope'] !== args.binding.marketScope
      || queryMetadata['market_subdivision_code'] !== args.binding.subdivisionCode) {
      reasons.add('market_mismatch');
    }
    const languages = Array.isArray(queryMetadata['market_languages'])
      ? queryMetadata['market_languages'].filter((value): value is string => typeof value === 'string')
      : [];
    if (!sameStrings(languages, args.binding.languages)) reasons.add('language_mismatch');
  }
  if (!sameStrings(sortedDomains(args.competitorList), args.binding.trackedCompetitorDomains)
    || config['competitor_cohort_version'] !== args.binding.competitorCohortVersion) {
    reasons.add('competitor_cohort_mismatch');
  }
  if (args.runMetadata !== undefined && !metadataMatchesBinding(args.runMetadata, args.binding)) {
    reasons.add('run_context_mismatch');
  }
  return { compatible: reasons.size === 0, baselineRequired, reasons: [...reasons].sort() };
}

export type OrganizationReferenceRole =
  | 'measured_organization'
  | 'tracked_competitor'
  | 'other_brand'
  | 'source';

export function classifyOrganizationReference(args: {
  readonly citedDomain: string | null;
  readonly citationType: 'explicit_url' | 'explicit_domain' | 'brand_mention' | 'paraphrased_reference';
  readonly measuredCanonicalDomain: string;
  readonly trackedCompetitorDomains: readonly string[];
}): OrganizationReferenceRole {
  const cited = args.citedDomain ? canonicalDomain(args.citedDomain) : null;
  const measured = canonicalDomain(args.measuredCanonicalDomain);
  if (cited && measured && cited === measured) return 'measured_organization';
  if (cited && sortedDomains(args.trackedCompetitorDomains).includes(cited)) return 'tracked_competitor';
  return args.citationType === 'brand_mention' ? 'other_brand' : 'source';
}
