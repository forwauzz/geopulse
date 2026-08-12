import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  reconcileConfirmedOrganizationContext,
  recordMaterialOrganizationContextChange,
} from './organization-context-change';
import { IDENTITY_NORMALIZATION_VERSION } from '../intelligence/identity';
import { canAccessEvidence } from '../intelligence/evidence';
import { loadConfirmedOrganizationContextByHost } from './organization-measurement-context';
import {
  ORGANIZATION_CONTEXT_CONTRACT_VERSION,
  ORGANIZATION_CONTEXT_POLICY_VERSION,
  organizationContextContentHash,
  organizationContextSchema,
  organizationContextVersion,
  organizationFactCandidateSchema,
  organizationMarketScopeSchema,
  organizationOwnerSchema,
  organizationSourceTierSchema,
  organizationVersionReasonSchema,
  resolveOrganizationFact,
  type OrganizationContext,
  type OrganizationFactCandidate,
  type OrganizationFactKey,
  type OrganizationOwnerType,
  type OrganizationSourceTier,
  type OrganizationVersionReason,
} from '../intelligence/organization-context';

type DomainRow = {
  readonly id: string;
  readonly normalized_host: string;
  readonly display_name: string | null;
  readonly vertical: string | null;
  readonly subvertical: string | null;
  readonly geography: Record<string, unknown> | null;
  readonly review_state: 'verified' | 'needs_review' | 'retired';
  readonly normalization_version: string;
  readonly metadata: Record<string, unknown> | null;
};

type OwnerRow = {
  readonly domain_id: string;
  readonly owner_type: OrganizationOwnerType;
  readonly owner_id: string | null;
  readonly visibility: 'tenant' | 'internal' | 'shared';
  readonly metadata: Record<string, unknown> | null;
};

type AliasRow = {
  readonly alias_host: string;
  readonly relationship: 'canonical' | 'observed_alias' | 'redirect' | 'rebrand';
  readonly review_state: 'verified' | 'needs_review' | 'rejected';
};

type EvidenceRow = {
  readonly stable_evidence_id: string;
  readonly source_kind: string;
  readonly source_id: string;
  readonly evidence_kind: string;
  readonly artifact_status: 'present' | 'missing' | 'unverified';
  readonly privacy: 'private_tenant' | 'internal' | 'shared' | 'public';
  readonly tenant_type: string | null;
  readonly tenant_id: string | null;
  readonly collected_at: string | null;
  readonly metadata: Record<string, unknown> | null;
};

export type OrganizationContextProjectionRows = {
  readonly domain: DomainRow;
  readonly owner: OwnerRow;
  readonly aliases: readonly AliasRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly projectedAt: string;
};

export type OrganizationContextProjectionFailure =
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

export type OrganizationContextProjection =
  | { readonly ok: true; readonly context: OrganizationContext }
  | { readonly ok: false; readonly reason: OrganizationContextProjectionFailure };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) => clean(item) ? [clean(item)!] : []))].sort()
    : [];
}

function first(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = clean(value);
    if (candidate) return candidate;
  }
  return null;
}

function contextMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
  return record(metadata?.['organization_context']);
}

function sourceTier(value: unknown, fallback: OrganizationSourceTier): OrganizationSourceTier {
  const parsed = organizationSourceTierSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function factCandidate(args: {
  field: OrganizationFactKey;
  value: string | readonly string[] | null;
  sourceTier: OrganizationSourceTier;
  confidence: number;
  evidenceId?: string | null;
}): OrganizationFactCandidate | null {
  if (args.value === null || (Array.isArray(args.value) && args.value.length === 0)) return null;
  const parsed = organizationFactCandidateSchema.safeParse({
    ...args,
    value: Array.isArray(args.value) ? [...args.value] : args.value,
    evidenceId: args.evidenceId ?? null,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Postgres returns `timestamptz` with a numeric offset (`...+00:00`), which the
 * context schema rejects — it accepts only the canonical `Z` form. Normalising
 * here rather than loosening the schema also keeps the content hash stable,
 * since the hash would otherwise vary with the serialisation the driver chose.
 * `projectedAt` is normalised the same way where the projection is assembled.
 */
function canonicalInstant(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function evidenceFacts(row: EvidenceRow): OrganizationFactCandidate[] {
  const metadata = record(row.metadata);
  const facts = record(metadata['organization_facts']);
  const tier = sourceTier(metadata['source_tier'], row.evidence_kind.includes('official')
    ? 'exact_official_website'
    : 'trusted_public');
  const confidence = typeof metadata['confidence'] === 'number'
    ? Math.max(0, Math.min(1, metadata['confidence']))
    : 0.7;
  return Object.entries(facts).flatMap(([field, value]) => {
    const parsedField = organizationFactCandidateSchema.shape.field.safeParse(field);
    if (!parsedField.success) return [];
    const candidate = factCandidate({
      field: parsedField.data,
      value: Array.isArray(value) ? list(value) : clean(value),
      sourceTier: tier,
      confidence,
      evidenceId: row.stable_evidence_id,
    });
    return candidate ? [candidate] : [];
  });
}

function confirmation(ownerContext: Record<string, unknown>): OrganizationContext['confirmation'] {
  const stored = record(ownerContext['confirmation']);
  const confirmedAt = clean(stored['confirmedAt'] ?? stored['confirmed_at']);
  if (!confirmedAt || !Number.isFinite(Date.parse(confirmedAt))) return null;
  const actorId = clean(stored['actorId'] ?? stored['actor_id']);
  return {
    actorType: stored['actorType'] === 'system' || stored['actor_type'] === 'system' ? 'system' : 'user',
    actorId,
    confirmedAt: new Date(confirmedAt).toISOString(),
  };
}

function hasStoredConfirmation(ownerContext: Record<string, unknown>): boolean {
  return Object.keys(record(ownerContext['confirmation'])).length > 0;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function contextFactCandidates(rows: OrganizationContextProjectionRows): OrganizationFactCandidate[] {
  const ownerContext = contextMetadata(rows.owner.metadata);
  const domainContext = contextMetadata(rows.domain.metadata);
  const ownerConfirmed = confirmation(ownerContext);
  const ownerTier: OrganizationSourceTier = ownerConfirmed ? 'confirmed_tenant' : 'grounded_suggestion';
  const geography = record(rows.domain.geography);
  const candidates: Array<OrganizationFactCandidate | null> = [
    factCandidate({ field: 'display_name', value: clean(ownerContext['displayName'] ?? ownerContext['display_name']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'canonical_domain', value: clean(ownerContext['canonicalDomain'] ?? ownerContext['canonical_domain']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'category', value: clean(ownerContext['category']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'services', value: list(ownerContext['services']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'buyer', value: clean(ownerContext['buyer'] ?? ownerContext['audience']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'market_scope', value: clean(ownerContext['marketScope'] ?? ownerContext['market_scope']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'country_code', value: clean(ownerContext['countryCode'] ?? ownerContext['country_code']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'subdivision_code', value: clean(ownerContext['subdivisionCode'] ?? ownerContext['subdivision_code']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'locality', value: clean(ownerContext['locality'] ?? ownerContext['city']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'service_areas', value: list(ownerContext['serviceAreas'] ?? ownerContext['service_areas']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'languages', value: list(ownerContext['languages']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'timezone', value: clean(ownerContext['timezone']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'approved_competitors', value: list(ownerContext['approvedCompetitorDomains'] ?? ownerContext['approved_competitor_domains']), sourceTier: ownerTier, confidence: ownerConfirmed ? 1 : 0.7 }),
    factCandidate({ field: 'display_name', value: clean(domainContext['displayName'] ?? domainContext['display_name'] ?? rows.domain.display_name), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'canonical_domain', value: rows.domain.normalized_host, sourceTier: 'structured_website', confidence: 1 }),
    // A canonical domain can be shared by multiple owners and can carry a broader
    // classification than a tenant's confirmed measurement category (for example,
    // `saas` globally and `b2b_saas` for one client). Once the tenant confirms its
    // category, the shared domain hint must not turn that valid refinement into a
    // material conflict. Evidence-backed category facts below still participate in
    // conflict detection.
    factCandidate({ field: 'category', value: ownerConfirmed ? null : first(domainContext['category'], rows.domain.subvertical, rows.domain.vertical), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'services', value: list(domainContext['services']), sourceTier: 'exact_official_website', confidence: 0.9 }),
    factCandidate({ field: 'buyer', value: clean(domainContext['buyer'] ?? domainContext['audience']), sourceTier: 'exact_official_website', confidence: 0.9 }),
    factCandidate({ field: 'market_scope', value: first(domainContext['marketScope'], domainContext['market_scope'], geography['scope']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'country_code', value: first(domainContext['countryCode'], domainContext['country_code'], geography['countryCode'], geography['country_code']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'subdivision_code', value: first(domainContext['subdivisionCode'], domainContext['subdivision_code'], geography['subdivisionCode'], geography['subdivision_code']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'locality', value: first(domainContext['locality'], domainContext['city'], geography['locality'], geography['city']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'service_areas', value: list(domainContext['serviceAreas'] ?? domainContext['service_areas'] ?? geography['serviceAreas'] ?? geography['service_areas']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'languages', value: list(domainContext['languages'] ?? geography['languages']), sourceTier: 'structured_website', confidence: 0.8 }),
    factCandidate({ field: 'timezone', value: first(domainContext['timezone'], geography['timezone']), sourceTier: 'structured_website', confidence: 0.8 }),
  ];
  return [...candidates.filter((candidate): candidate is OrganizationFactCandidate => Boolean(candidate)), ...rows.evidence.flatMap(evidenceFacts)];
}

function selectedString(candidates: readonly OrganizationFactCandidate[], field: OrganizationFactKey): string | null {
  const value = resolveOrganizationFact(field, candidates).selected?.value;
  return typeof value === 'string' ? value : null;
}

function selectedList(candidates: readonly OrganizationFactCandidate[], field: OrganizationFactKey): string[] {
  const value = resolveOrganizationFact(field, candidates).selected?.value;
  return Array.isArray(value) ? [...new Set(value)].sort() : [];
}

const CONFLICT_FIELDS: readonly OrganizationFactKey[] = [
  'canonical_domain', 'category', 'buyer', 'country_code', 'subdivision_code', 'locality',
  'service_areas', 'approved_competitors',
];

/** Project stable domain objects from existing rows without creating a parallel storage model. */
export function projectOrganizationContext(rows: OrganizationContextProjectionRows): OrganizationContextProjection {
  if (!organizationOwnerSchema.safeParse({ type: rows.owner.owner_type, id: rows.owner.owner_id }).success) {
    return { ok: false, reason: 'owner_scope_invalid' };
  }
  const ownerContext = contextMetadata(rows.owner.metadata);
  const confirmed = confirmation(ownerContext);
  if (hasStoredConfirmation(ownerContext) && !confirmed) return { ok: false, reason: 'confirmation_invalid' };
  const candidates = contextFactCandidates(rows);
  const countryCode = selectedString(candidates, 'country_code')?.toUpperCase() ?? null;
  const languages = selectedList(candidates, 'languages');
  const timezone = selectedString(candidates, 'timezone');
  const scope = selectedString(candidates, 'market_scope');
  const subdivisionCode = selectedString(candidates, 'subdivision_code')?.toUpperCase() ?? null;
  if (!countryCode) return { ok: false, reason: 'country_code_missing' };
  if (!/^[A-Z]{2}$/.test(countryCode)) return { ok: false, reason: 'country_code_invalid' };
  if (subdivisionCode && !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(subdivisionCode)) {
    return { ok: false, reason: 'subdivision_code_invalid' };
  }
  if (languages.length === 0) return { ok: false, reason: 'language_missing' };
  if (languages.some((language) => !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language))) {
    return { ok: false, reason: 'language_invalid' };
  }
  if (!timezone) return { ok: false, reason: 'timezone_missing' };
  if (!isValidTimeZone(timezone)) return { ok: false, reason: 'timezone_invalid' };
  if (!scope) return { ok: false, reason: 'market_scope_missing' };
  const parsedScope = organizationMarketScopeSchema.safeParse(scope);
  if (!parsedScope.success) return { ok: false, reason: 'market_scope_invalid' };
  if (!Number.isFinite(Date.parse(rows.projectedAt))) return { ok: false, reason: 'projection_time_invalid' };

  const conflicts = CONFLICT_FIELDS.flatMap((field) => resolveOrganizationFact(field, candidates).conflicts);
  if (rows.domain.review_state === 'needs_review') {
    conflicts.push({
      code: 'identity_review_required', field: 'canonical_domain',
      retainedValue: rows.domain.normalized_host, proposedValue: null,
      retainedSourceTier: 'structured_website', proposedSourceTier: null,
      evidenceIds: [], material: true,
    });
  }
  const base = {
    contractVersion: ORGANIZATION_CONTEXT_CONTRACT_VERSION,
    policyVersion: ORGANIZATION_CONTEXT_POLICY_VERSION,
    contextId: `oc:${rows.domain.id}:${rows.owner.owner_type}:${rows.owner.owner_id ?? 'internal'}`,
    owner: { type: rows.owner.owner_type, id: rows.owner.owner_id },
    organization: {
      identityId: rows.domain.id,
      displayName: selectedString(candidates, 'display_name') ?? rows.domain.normalized_host,
      canonicalDomain: selectedString(candidates, 'canonical_domain') ?? rows.domain.normalized_host,
      aliases: rows.aliases
        .filter((alias) => alias.review_state === 'verified')
        .map((alias) => ({ host: alias.alias_host, relationship: alias.relationship, reviewState: 'verified' as const }))
        .sort((left, right) => left.host.localeCompare(right.host)),
      category: selectedString(candidates, 'category'),
      services: selectedList(candidates, 'services'),
    },
    market: {
      scope: parsedScope.data,
      countryCode,
      subdivisionCode,
      locality: selectedString(candidates, 'locality'),
      serviceAreas: selectedList(candidates, 'service_areas'),
      languages,
      timezone,
      buyer: selectedString(candidates, 'buyer'),
      approvedCompetitorDomains: selectedList(candidates, 'approved_competitors'),
    },
    status: conflicts.length > 0 ? 'conflicted' as const : confirmed ? 'confirmed' as const : 'detected' as const,
    evidence: rows.evidence.map((evidence) => ({
      evidenceId: evidence.stable_evidence_id,
      sourceKind: evidence.source_kind,
      sourceId: evidence.source_id,
      sourceTier: sourceTier(evidence.metadata?.['source_tier'], evidence.evidence_kind.includes('official') ? 'exact_official_website' : 'trusted_public'),
      confidence: typeof evidence.metadata?.['confidence'] === 'number'
        ? Math.max(0, Math.min(1, evidence.metadata['confidence']))
        : 0.7,
      collectedAt: canonicalInstant(evidence.collected_at),
    })).sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    conflicts,
    confirmation: confirmed,
    versionReasonCodes: (() => {
      const stored = list(ownerContext['versionReasonCodes'] ?? ownerContext['version_reason_codes'])
        .flatMap((reason) => {
          const parsed = organizationVersionReasonSchema.safeParse(reason);
          return parsed.success ? [parsed.data] : [];
        });
      const reasons = new Set<OrganizationVersionReason>(stored.length > 0 ? stored : ['initial_projection']);
      if (confirmed) reasons.add('tenant_confirmation');
      if (conflicts.length > 0) reasons.add('material_conflict_detected');
      return [...reasons].sort();
    })(),
      projectedAt: new Date(rows.projectedAt).toISOString(),
  };
  const contentHash = organizationContextContentHash({ ...base, projectedAt: undefined });
  return {
    ok: true,
    context: organizationContextSchema.parse({
      ...base,
      contextVersion: organizationContextVersion(contentHash),
      contentHash,
    }),
  };
}

export type OrganizationContextAccess = {
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string | null;
  readonly domainId: string;
  readonly isPlatformAdmin?: boolean;
};

export type OrganizationContextLookup =
  | { readonly status: 'ready'; readonly context: OrganizationContext }
  | { readonly status: 'unauthorized'; readonly reason: 'owner_scope_missing' | 'owner_shape_invalid' }
  | { readonly status: 'not_found'; readonly reason: 'domain_missing' | 'domain_retired' }
  | { readonly status: 'needs_review'; readonly reason: OrganizationContextProjectionFailure };

export type ConfirmedOrganizationContextWrite = {
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string;
  readonly actorId: string;
  readonly canonicalDomain: string;
  readonly aliases?: readonly string[];
  readonly displayName: string;
  readonly category: string;
  readonly services: readonly string[];
  readonly buyer: string | null;
  readonly marketScope: OrganizationContext['market']['scope'];
  readonly countryCode: string;
  readonly subdivisionCode: string | null;
  readonly locality: string | null;
  readonly serviceAreas: readonly string[];
  readonly languages: readonly string[];
  readonly timezone: string;
  readonly approvedCompetitorDomains?: readonly string[];
  readonly confirmedAt?: string;
  readonly source?: string;
};

export function confirmedOrganizationContextMetadata(
  input: ConfirmedOrganizationContextWrite,
  confirmedAt: string,
): Record<string, unknown> {
  return {
    displayName: input.displayName.trim(),
    canonicalDomain: input.canonicalDomain.trim().toLowerCase().replace(/^www\./, ''),
    category: input.category.trim(),
    services: [...new Set(input.services.map((item) => item.trim()).filter(Boolean))].sort(),
    buyer: input.buyer?.trim() || null,
    marketScope: input.marketScope,
    countryCode: input.countryCode.trim().toUpperCase(),
    subdivisionCode: input.subdivisionCode?.trim().toUpperCase() || null,
    locality: input.locality?.trim() || null,
    serviceAreas: [...new Set(input.serviceAreas.map((item) => item.trim()).filter(Boolean))].sort(),
    languages: [...new Set(input.languages.map((item) => item.trim()).filter(Boolean))].sort(),
    timezone: input.timezone.trim(),
    approvedCompetitorDomains: [...new Set((input.approvedCompetitorDomains ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean))].sort(),
    confirmation: {
      actorType: 'user',
      actorId: input.actorId,
      confirmedAt,
    },
    versionReasonCodes: ['initial_projection', 'tenant_confirmation'],
  };
}

/**
 * Persist one auditable tenant confirmation into the existing identity plane, then project the
 * canonical context back from storage. Retries update the same domain/owner rows and never create a
 * second profile for the same tenant and domain.
 */
/** Whether two cohorts describe the same set, ignoring order and casing. */
export function sameCompetitorCohort(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const normalize = (values: readonly string[]) =>
    [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Bring a confirmed context's competitor cohort in line with the tenant's current one.
 *
 * The cohort is measurement input, but `schedule_run_key` is versioned by the
 * context — so a cohort saved anywhere else is silently deduped away and the
 * client keeps being measured against the old set. Re-confirming with the new
 * cohort moves the context version, which is what lets the next baseline run.
 *
 * Returns null when there is nothing to do: no confirmed context, or a cohort that
 * already matches. Re-confirming an unchanged cohort would churn the version and
 * force a needless re-measurement.
 */
export async function syncConfirmedCompetitorCohort(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly ownerType: OrganizationOwnerType;
  readonly ownerId: string;
  readonly canonicalDomain: string;
  readonly actorId: string;
  readonly competitorDomains: readonly string[];
  readonly now?: Date;
}): Promise<OrganizationContext | null> {
  const current = await loadConfirmedOrganizationContextByHost({
    supabase: args.supabase,
    ownerType: args.ownerType,
    ownerId: args.ownerId,
    canonicalDomain: args.canonicalDomain,
  }).catch(() => null);
  if (!current) return null;
  if (sameCompetitorCohort(current.market.approvedCompetitorDomains, args.competitorDomains)) {
    return null;
  }
  // A confirmed context without a category cannot be re-confirmed without inventing
  // one, and a guessed category would change what gets measured. Leave it alone.
  if (!current.organization.category) return null;

  return persistConfirmedOrganizationContext({
    supabase: args.supabase,
    now: args.now,
    input: {
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      actorId: args.actorId,
      canonicalDomain: current.organization.canonicalDomain,
      displayName: current.organization.displayName,
      category: current.organization.category,
      services: current.organization.services,
      buyer: current.market.buyer,
      marketScope: current.market.scope,
      countryCode: current.market.countryCode,
      subdivisionCode: current.market.subdivisionCode,
      locality: current.market.locality,
      serviceAreas: current.market.serviceAreas,
      languages: current.market.languages,
      timezone: current.market.timezone,
      approvedCompetitorDomains: args.competitorDomains,
      source: 'agency_client_competitor_cohort_change',
    },
  });
}

export async function persistConfirmedOrganizationContext(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly input: ConfirmedOrganizationContextWrite;
  readonly now?: Date;
}): Promise<OrganizationContext> {
  const { input } = args;
  const confirmedAt = (args.now ?? new Date(input.confirmedAt ?? Date.now())).toISOString();
  const canonicalDomain = input.canonicalDomain.trim().toLowerCase().replace(/^www\./, '');
  const organizationContext = confirmedOrganizationContextMetadata({ ...input, canonicalDomain }, confirmedAt);
  const { data: existingDomain, error: existingDomainError } = await args.supabase
    .from('intelligence_domains')
    .select('id,metadata,vertical,subvertical')
    .eq('normalized_host', canonicalDomain)
    .maybeSingle();
  if (existingDomainError) throw existingDomainError;

  const domainMetadata = record(existingDomain?.metadata);
  const domainPayload = {
    normalized_host: canonicalDomain,
    display_name: input.displayName.trim(),
    vertical: existingDomain?.vertical ?? null,
    subvertical: existingDomain?.subvertical ?? input.category.trim(),
    geography: {
      scope: input.marketScope,
      countryCode: input.countryCode.trim().toUpperCase(),
      subdivisionCode: input.subdivisionCode?.trim().toUpperCase() || null,
      locality: input.locality?.trim() || null,
      serviceAreas: [...input.serviceAreas],
      languages: [...input.languages],
      timezone: input.timezone.trim(),
    },
    review_state: 'verified',
    normalization_version: IDENTITY_NORMALIZATION_VERSION,
    // Tenant confirmation belongs on the exact owner row below. Keep the global identity metadata
    // free of user ids, approved competitors, and other tenant-private context.
    metadata: domainMetadata,
  };
  const { data: domain, error: domainError } = await args.supabase
    .from('intelligence_domains')
    .upsert(existingDomain?.id ? { ...domainPayload, id: existingDomain.id } : domainPayload, {
      onConflict: 'normalized_host',
    })
    .select('id')
    .single();
  if (domainError || !domain?.id) throw domainError ?? new Error('organization_identity_write_failed');

  const aliases = [...new Set([canonicalDomain, ...(input.aliases ?? [])]
    .map((host) => host.trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean))];
  const { error: aliasError } = await args.supabase.from('intelligence_domain_aliases').upsert(
    aliases.map((host) => ({
      domain_id: domain.id,
      alias_host: host,
      relationship: host === canonicalDomain ? 'canonical' : 'observed_alias',
      review_state: 'verified',
      observed_from: input.source ?? 'value_first_onboarding',
      normalization_version: IDENTITY_NORMALIZATION_VERSION,
      metadata: { confirmed_at: confirmedAt },
    })),
    { onConflict: 'domain_id,alias_host' },
  );
  if (aliasError) throw aliasError;

  const { data: existingOwner, error: existingOwnerError } = await args.supabase
    .from('intelligence_domain_owners')
    .select('id,metadata')
    .eq('domain_id', domain.id)
    .eq('owner_type', input.ownerType)
    .eq('owner_id', input.ownerId)
    .maybeSingle();
  if (existingOwnerError) throw existingOwnerError;
  const ownerMetadata = record(existingOwner?.metadata);
  const previousSnapshot = organizationContextSchema.safeParse(ownerMetadata['organization_context_snapshot']);
  const ownerPayload = {
    domain_id: domain.id,
    owner_type: input.ownerType,
    owner_id: input.ownerId,
    visibility: 'tenant',
    metadata: {
      ...ownerMetadata,
      organization_context: {
        ...record(ownerMetadata['organization_context']),
        ...organizationContext,
      },
      onboarding_source: input.source ?? 'value_first_onboarding',
      onboarding_confirmed_at: confirmedAt,
    },
  };
  const { data: owner, error: ownerError } = await args.supabase
    .from('intelligence_domain_owners')
    .upsert(existingOwner?.id ? { ...ownerPayload, id: existingOwner.id } : ownerPayload, {
      onConflict: 'domain_id,owner_type,owner_id',
    })
    .select('id')
    .single();
  if (ownerError || !owner?.id) throw ownerError ?? new Error('organization_owner_write_failed');

  const lookup = await createOrganizationContextRepository(args.supabase).getByOwnerAndDomain({
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    domainId: String(domain.id),
  });
  if (lookup.status !== 'ready' || lookup.context.status !== 'confirmed') {
    throw new Error(`organization_context_projection_${lookup.status === 'ready' ? lookup.context.status : lookup.reason}`);
  }
  const nextOwnerMetadata = {
    ...ownerPayload.metadata,
    organization_context_snapshot: lookup.context,
  };
  await recordMaterialOrganizationContextChange({
    supabase: args.supabase,
    previous: previousSnapshot.success ? previousSnapshot.data : null,
    next: lookup.context,
    now: new Date(confirmedAt),
  });
  const { error: snapshotError } = await args.supabase
    .from('intelligence_domain_owners')
    .update({ metadata: nextOwnerMetadata })
    .eq('id', owner.id);
  if (snapshotError) throw snapshotError;
  await reconcileConfirmedOrganizationContext({
    supabase: args.supabase,
    context: lookup.context,
    now: new Date(confirmedAt),
  });
  return lookup.context;
}

export function createOrganizationContextRepository(supabase: SupabaseClient<any, 'public', any>) {
  return {
    async getByOwnerAndDomain(access: OrganizationContextAccess): Promise<OrganizationContextLookup> {
      if (!organizationOwnerSchema.safeParse({ type: access.ownerType, id: access.ownerId }).success) {
        return { status: 'unauthorized', reason: 'owner_shape_invalid' };
      }

      let ownerQuery = supabase
        .from('intelligence_domain_owners')
        .select('domain_id,owner_type,owner_id,visibility,metadata')
        .eq('domain_id', access.domainId)
        .eq('owner_type', access.ownerType);
      ownerQuery = access.ownerId === null
        ? ownerQuery.is('owner_id', null)
        : ownerQuery.eq('owner_id', access.ownerId);
      const { data: ownerData, error: ownerError } = await ownerQuery.maybeSingle();
      if (ownerError) throw ownerError;
      if (!ownerData) return { status: 'unauthorized', reason: 'owner_scope_missing' };

      const [{ data: domainData, error: domainError }, { data: aliasData, error: aliasError }, { data: evidenceData, error: evidenceError }] = await Promise.all([
        supabase.from('intelligence_domains')
          .select('id,normalized_host,display_name,vertical,subvertical,geography,review_state,normalization_version,metadata')
          .eq('id', access.domainId)
          .maybeSingle(),
        supabase.from('intelligence_domain_aliases')
          .select('alias_host,relationship,review_state')
          .eq('domain_id', access.domainId)
          .eq('review_state', 'verified'),
        supabase.from('intelligence_evidence_objects')
          .select('stable_evidence_id,source_kind,source_id,evidence_kind,artifact_status,privacy,tenant_type,tenant_id,collected_at,metadata')
          .eq('canonical_domain_id', access.domainId)
          .eq('artifact_status', 'present'),
      ]);
      if (domainError) throw domainError;
      if (aliasError) throw aliasError;
      if (evidenceError) throw evidenceError;
      if (!domainData) return { status: 'not_found', reason: 'domain_missing' };
      if (domainData.review_state === 'retired') return { status: 'not_found', reason: 'domain_retired' };

      const accessibleEvidence = ((evidenceData ?? []) as EvidenceRow[]).filter((evidence) => canAccessEvidence({
        privacy: evidence.privacy,
        tenantType: evidence.tenant_type,
        tenantId: evidence.tenant_id,
      }, {
        isPlatformAdmin: access.isPlatformAdmin,
        tenantType: access.ownerType,
        tenantId: access.ownerId,
      }));
      const projection = projectOrganizationContext({
        domain: domainData as DomainRow,
        owner: ownerData as OwnerRow,
        aliases: (aliasData ?? []) as AliasRow[],
        evidence: accessibleEvidence,
        projectedAt: new Date().toISOString(),
      });
      return projection.ok
        ? { status: 'ready', context: projection.context }
        : { status: 'needs_review', reason: projection.reason };
    },
  };
}
