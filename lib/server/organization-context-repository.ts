import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessEvidence } from '../intelligence/evidence';
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
    factCandidate({ field: 'category', value: first(domainContext['category'], rows.domain.subvertical, rows.domain.vertical), sourceTier: 'structured_website', confidence: 0.8 }),
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
      collectedAt: evidence.collected_at,
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
