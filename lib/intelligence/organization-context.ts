import { z } from 'zod';

export const ORGANIZATION_CONTEXT_CONTRACT_VERSION = 'organization-context-v1';
export const ORGANIZATION_CONTEXT_POLICY_VERSION = 'organization-context-precedence-v1';

export const organizationOwnerTypeSchema = z.enum([
  'agency_account',
  'agency_client',
  'startup_workspace',
  'user',
  'internal_benchmark',
]);
export type OrganizationOwnerType = z.infer<typeof organizationOwnerTypeSchema>;

export const organizationSourceTierSchema = z.enum([
  'confirmed_tenant',
  'exact_official_website',
  'structured_website',
  'trusted_public',
  'grounded_suggestion',
  'heuristic_default',
]);
export type OrganizationSourceTier = z.infer<typeof organizationSourceTierSchema>;

export const organizationContextStatusSchema = z.enum([
  'draft',
  'detected',
  'confirmed',
  'conflicted',
  'superseded',
  'retired',
]);
export const organizationMarketScopeSchema = z.enum([
  'local',
  'regional',
  'national',
  'global',
  'online',
]);

export const organizationFactKeySchema = z.enum([
  'display_name',
  'canonical_domain',
  'category',
  'services',
  'buyer',
  'market_scope',
  'country_code',
  'subdivision_code',
  'locality',
  'service_areas',
  'languages',
  'timezone',
  'approved_competitors',
]);
export type OrganizationFactKey = z.infer<typeof organizationFactKeySchema>;

export const organizationConflictCodeSchema = z.enum([
  'country_conflict',
  'canonical_domain_conflict',
  'category_conflict',
  'buyer_conflict',
  'market_location_conflict',
  'name_collision',
  'competitor_market_conflict',
  'context_version_mismatch',
  'identity_review_required',
]);
export type OrganizationConflictCode = z.infer<typeof organizationConflictCodeSchema>;

export const organizationVersionReasonSchema = z.enum([
  'initial_projection',
  'tenant_confirmation',
  'official_evidence_changed',
  'alias_changed',
  'market_changed',
  'services_changed',
  'buyer_changed',
  'language_changed',
  'competitor_cohort_changed',
  'material_conflict_detected',
  'conflict_resolved',
]);
export type OrganizationVersionReason = z.infer<typeof organizationVersionReasonSchema>;

export const organizationOwnerSchema = z.object({
  type: organizationOwnerTypeSchema,
  id: z.string().uuid().nullable(),
}).strict().superRefine((owner, context) => {
  if (owner.type === 'internal_benchmark' && owner.id !== null) {
    context.addIssue({ code: 'custom', path: ['id'], message: 'Internal benchmark ownership cannot carry a tenant ID.' });
  }
  if (owner.type !== 'internal_benchmark' && owner.id === null) {
    context.addIssue({ code: 'custom', path: ['id'], message: 'Tenant ownership requires an owner ID.' });
  }
});

export const organizationEvidenceReferenceSchema = z.object({
  evidenceId: z.string().min(1),
  sourceKind: z.string().min(1),
  sourceId: z.string().min(1),
  sourceTier: organizationSourceTierSchema,
  confidence: z.number().min(0).max(1),
  collectedAt: z.string().datetime().nullable(),
}).strict();

export const organizationConflictSchema = z.object({
  code: organizationConflictCodeSchema,
  field: organizationFactKeySchema,
  retainedValue: z.union([z.string(), z.array(z.string())]).nullable(),
  proposedValue: z.union([z.string(), z.array(z.string())]).nullable(),
  retainedSourceTier: organizationSourceTierSchema.nullable(),
  proposedSourceTier: organizationSourceTierSchema.nullable(),
  evidenceIds: z.array(z.string().min(1)),
  material: z.literal(true),
}).strict();

const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
const subdivisionCodeSchema = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/);
const languageTagSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/);

export const organizationContextSchema = z.object({
  contractVersion: z.literal(ORGANIZATION_CONTEXT_CONTRACT_VERSION),
  policyVersion: z.literal(ORGANIZATION_CONTEXT_POLICY_VERSION),
  contextId: z.string().min(1),
  contextVersion: z.string().min(1),
  contentHash: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
  owner: organizationOwnerSchema,
  organization: z.object({
    identityId: z.string().uuid(),
    displayName: z.string().min(1),
    canonicalDomain: z.string().min(1),
    aliases: z.array(z.object({
      host: z.string().min(1),
      relationship: z.enum(['canonical', 'observed_alias', 'redirect', 'rebrand']),
      reviewState: z.literal('verified'),
    }).strict()),
    category: z.string().min(1).nullable(),
    services: z.array(z.string().min(1)),
  }).strict(),
  market: z.object({
    scope: organizationMarketScopeSchema,
    countryCode: countryCodeSchema,
    subdivisionCode: subdivisionCodeSchema.nullable(),
    locality: z.string().min(1).nullable(),
    serviceAreas: z.array(z.string().min(1)),
    languages: z.array(languageTagSchema).min(1),
    timezone: z.string().min(1),
    buyer: z.string().min(1).nullable(),
    approvedCompetitorDomains: z.array(z.string().min(1)),
  }).strict(),
  status: organizationContextStatusSchema,
  evidence: z.array(organizationEvidenceReferenceSchema),
  conflicts: z.array(organizationConflictSchema),
  confirmation: z.object({
    actorType: z.enum(['user', 'system']),
    actorId: z.string().uuid().nullable(),
    confirmedAt: z.string().datetime(),
  }).strict().nullable(),
  versionReasonCodes: z.array(organizationVersionReasonSchema).min(1),
  projectedAt: z.string().datetime(),
}).strict().superRefine((context, refinement) => {
  if (context.status === 'confirmed' && !context.confirmation) {
    refinement.addIssue({ code: 'custom', path: ['confirmation'], message: 'Confirmed context requires confirmation evidence.' });
  }
  if (context.conflicts.length > 0 && context.status !== 'conflicted') {
    refinement.addIssue({ code: 'custom', path: ['status'], message: 'Material conflicts require conflicted status.' });
  }
  if (context.status === 'conflicted' && context.conflicts.length === 0) {
    refinement.addIssue({ code: 'custom', path: ['conflicts'], message: 'Conflicted context requires a material conflict.' });
  }
});
export type OrganizationContext = z.infer<typeof organizationContextSchema>;

export const organizationFactCandidateSchema = z.object({
  field: organizationFactKeySchema,
  value: z.union([z.string(), z.array(z.string())]),
  sourceTier: organizationSourceTierSchema,
  confidence: z.number().min(0).max(1),
  evidenceId: z.string().min(1).nullable(),
}).strict();
export type OrganizationFactCandidate = z.infer<typeof organizationFactCandidateSchema>;

const SOURCE_PRIORITY: Readonly<Record<OrganizationSourceTier, number>> = {
  confirmed_tenant: 600,
  exact_official_website: 500,
  structured_website: 400,
  trusted_public: 300,
  grounded_suggestion: 200,
  heuristic_default: 100,
};

const MATERIAL_CONFLICTS: Readonly<Partial<Record<OrganizationFactKey, OrganizationConflictCode>>> = {
  canonical_domain: 'canonical_domain_conflict',
  category: 'category_conflict',
  buyer: 'buyer_conflict',
  country_code: 'country_conflict',
  subdivision_code: 'market_location_conflict',
  locality: 'market_location_conflict',
  service_areas: 'market_location_conflict',
  approved_competitors: 'competitor_market_conflict',
};

function stableValue(value: OrganizationFactCandidate['value']): string {
  return JSON.stringify(Array.isArray(value) ? [...new Set(value)].sort() : value.trim());
}

export type OrganizationFactResolution = {
  readonly selected: OrganizationFactCandidate | null;
  readonly proposals: readonly OrganizationFactCandidate[];
  readonly conflicts: readonly z.infer<typeof organizationConflictSchema>[];
};

/** Resolve one fact without allowing a lower-trust source to silently replace a higher one. */
export function resolveOrganizationFact(
  field: OrganizationFactKey,
  candidates: readonly OrganizationFactCandidate[],
): OrganizationFactResolution {
  const valid = candidates
    .filter((candidate) => candidate.field === field)
    .map((candidate) => organizationFactCandidateSchema.parse(candidate))
    .sort((left, right) =>
      SOURCE_PRIORITY[right.sourceTier] - SOURCE_PRIORITY[left.sourceTier]
      || right.confidence - left.confidence
      || stableValue(left.value).localeCompare(stableValue(right.value))
    );
  const selected = valid[0] ?? null;
  if (!selected) return { selected: null, proposals: [], conflicts: [] };
  const proposals = valid.slice(1).filter((candidate) => stableValue(candidate.value) !== stableValue(selected.value));
  const conflictCode = MATERIAL_CONFLICTS[field];
  const conflicts = conflictCode
    ? proposals.map((proposal) => ({
      code: conflictCode,
      field,
      retainedValue: selected.value,
      proposedValue: proposal.value,
      retainedSourceTier: selected.sourceTier,
      proposedSourceTier: proposal.sourceTier,
      evidenceIds: [selected.evidenceId, proposal.evidenceId].filter((id): id is string => Boolean(id)),
      material: true as const,
    }))
    : [];
  return { selected, proposals, conflicts };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalize(item)]));
}

/** Portable non-cryptographic content identity; not used for security decisions. */
export function organizationContextContentHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  let checksum = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    checksum ^= serialized.charCodeAt(index);
    checksum = Math.imul(checksum, 0x01000193);
  }
  return `fnv1a32:${(checksum >>> 0).toString(16).padStart(8, '0')}`;
}

export function organizationContextVersion(contentHash: string): string {
  return `ocv1-${contentHash.replace(/^fnv1a32:/, '')}`;
}

export function materialContextChanges(
  previous: OrganizationContext,
  next: OrganizationContext,
): readonly OrganizationVersionReason[] {
  const reasons = new Set<OrganizationVersionReason>();
  if (previous.organization.canonicalDomain !== next.organization.canonicalDomain
    || previous.market.countryCode !== next.market.countryCode
    || previous.market.subdivisionCode !== next.market.subdivisionCode
    || previous.market.locality !== next.market.locality
    || previous.market.scope !== next.market.scope
    || stableValue(previous.market.serviceAreas) !== stableValue(next.market.serviceAreas)) reasons.add('market_changed');
  if (stableValue(previous.organization.services) !== stableValue(next.organization.services)) reasons.add('services_changed');
  if (previous.market.buyer !== next.market.buyer) reasons.add('buyer_changed');
  if (stableValue(previous.market.languages) !== stableValue(next.market.languages)) reasons.add('language_changed');
  if (stableValue(previous.market.approvedCompetitorDomains) !== stableValue(next.market.approvedCompetitorDomains)) {
    reasons.add('competitor_cohort_changed');
  }
  if (stableValue(previous.organization.aliases.map((alias) => `${alias.relationship}:${alias.host}`))
    !== stableValue(next.organization.aliases.map((alias) => `${alias.relationship}:${alias.host}`))) reasons.add('alias_changed');
  if (previous.conflicts.length === 0 && next.conflicts.length > 0) reasons.add('material_conflict_detected');
  if (previous.conflicts.length > 0 && next.conflicts.length === 0) reasons.add('conflict_resolved');
  return [...reasons].sort();
}

/** Portable schema for future API/SDK adapters. Database row shapes are intentionally absent. */
export const organizationContextJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://getgeopulse.com/schemas/organization-context-v1.json',
  title: 'GEO-Pulse Organization Context',
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion', 'policyVersion', 'contextId', 'contextVersion', 'contentHash', 'owner',
    'organization', 'market', 'status', 'evidence', 'conflicts', 'confirmation',
    'versionReasonCodes', 'projectedAt',
  ],
  properties: {
    contractVersion: { const: ORGANIZATION_CONTEXT_CONTRACT_VERSION },
    policyVersion: { const: ORGANIZATION_CONTEXT_POLICY_VERSION },
    contextId: { type: 'string', minLength: 1 },
    contextVersion: { type: 'string', minLength: 1 },
    contentHash: { type: 'string', pattern: '^fnv1a32:[0-9a-f]{8}$' },
    owner: {
      type: 'object', additionalProperties: false, required: ['type', 'id'],
      properties: { type: { enum: organizationOwnerTypeSchema.options }, id: { type: ['string', 'null'], format: 'uuid' } },
      allOf: [
        {
          if: { properties: { type: { const: 'internal_benchmark' } }, required: ['type'] },
          then: { properties: { id: { type: 'null' } } },
          else: { properties: { id: { type: 'string', format: 'uuid' } } },
        },
      ],
    },
    organization: {
      type: 'object', additionalProperties: false,
      required: ['identityId', 'displayName', 'canonicalDomain', 'aliases', 'category', 'services'],
      properties: {
        identityId: { type: 'string', format: 'uuid' }, displayName: { type: 'string', minLength: 1 },
        canonicalDomain: { type: 'string', minLength: 1 }, category: { type: ['string', 'null'] },
        services: { type: 'array', items: { type: 'string', minLength: 1 } },
        aliases: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['host', 'relationship', 'reviewState'],
            properties: {
              host: { type: 'string', minLength: 1 },
              relationship: { enum: ['canonical', 'observed_alias', 'redirect', 'rebrand'] },
              reviewState: { const: 'verified' },
            },
          },
        },
      },
    },
    market: {
      type: 'object', additionalProperties: false,
      required: ['scope', 'countryCode', 'subdivisionCode', 'locality', 'serviceAreas', 'languages', 'timezone', 'buyer', 'approvedCompetitorDomains'],
      properties: {
        scope: { enum: organizationMarketScopeSchema.options }, countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
        subdivisionCode: { type: ['string', 'null'], pattern: '^[A-Z]{2}-[A-Z0-9]{1,3}$' },
        locality: { type: ['string', 'null'], minLength: 1 },
        serviceAreas: { type: 'array', items: { type: 'string', minLength: 1 } },
        languages: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^[a-z]{2,3}(?:-[A-Z]{2})?$' } },
        timezone: { type: 'string', minLength: 1 },
        buyer: { type: ['string', 'null'], minLength: 1 },
        approvedCompetitorDomains: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
    status: { enum: organizationContextStatusSchema.options },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['evidenceId', 'sourceKind', 'sourceId', 'sourceTier', 'confidence', 'collectedAt'],
        properties: {
          evidenceId: { type: 'string', minLength: 1 }, sourceKind: { type: 'string', minLength: 1 },
          sourceId: { type: 'string', minLength: 1 }, sourceTier: { enum: organizationSourceTierSchema.options },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          collectedAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
    conflicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['code', 'field', 'retainedValue', 'proposedValue', 'retainedSourceTier', 'proposedSourceTier', 'evidenceIds', 'material'],
        properties: {
          code: { enum: organizationConflictCodeSchema.options }, field: { enum: organizationFactKeySchema.options },
          retainedValue: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, { type: 'null' }] },
          proposedValue: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }, { type: 'null' }] },
          retainedSourceTier: { anyOf: [{ enum: organizationSourceTierSchema.options }, { type: 'null' }] },
          proposedSourceTier: { anyOf: [{ enum: organizationSourceTierSchema.options }, { type: 'null' }] },
          evidenceIds: { type: 'array', items: { type: 'string', minLength: 1 } }, material: { const: true },
        },
      },
    },
    confirmation: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object', additionalProperties: false, required: ['actorType', 'actorId', 'confirmedAt'],
          properties: {
            actorType: { enum: ['user', 'system'] }, actorId: { type: ['string', 'null'], format: 'uuid' },
            confirmedAt: { type: 'string', format: 'date-time' },
          },
        },
      ],
    },
    versionReasonCodes: { type: 'array', minItems: 1, items: { enum: organizationVersionReasonSchema.options } },
    projectedAt: { type: 'string', format: 'date-time' },
  },
  allOf: [
    {
      if: { properties: { status: { const: 'confirmed' } }, required: ['status'] },
      then: { properties: { confirmation: { type: 'object' } } },
    },
    {
      if: { properties: { status: { const: 'conflicted' } }, required: ['status'] },
      then: { properties: { conflicts: { minItems: 1 } } },
      else: { properties: { conflicts: { maxItems: 0 } } },
    },
  ],
} as const;
