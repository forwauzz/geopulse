import { z } from 'zod';
import { organizationOwnerSchema } from './organization-context';

export const ORGANIZATION_CAPABILITY_CONTRACT_VERSION = 'organization-capability-v1';

export const organizationCapabilitySchema = z.enum([
  'detect_context',
  'read_context',
  'list_markets',
  'retrieve_evidence',
  'explain_measurement',
  'generate_artifact',
  'preview_artifact',
]);
export type OrganizationCapability = z.infer<typeof organizationCapabilitySchema>;

const auditSchema = z.object({
  requestId: z.string().min(1).max(200),
  actorId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  purpose: z.string().min(1).max(300),
}).strict();

const targetSchema = organizationOwnerSchema;

const common = {
  contractVersion: z.literal(ORGANIZATION_CAPABILITY_CONTRACT_VERSION),
  audit: auditSchema,
  target: targetSchema,
};

export const organizationCapabilityRequestSchema = z.discriminatedUnion('capability', [
  z.object({
    ...common,
    capability: z.literal('detect_context'),
    url: z.string().url(),
    approvedAliasHosts: z.array(z.string().min(1)).max(20).default([]),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('read_context'),
    domainId: z.string().uuid(),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('list_markets'),
    domainId: z.string().uuid(),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('retrieve_evidence'),
    domainHost: z.string().min(1),
    sourceKinds: z.array(z.string().min(1)).max(20).optional(),
    observedAfter: z.string().datetime().optional(),
    limit: z.number().int().min(1).max(50).default(20),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('explain_measurement'),
    agencyClientId: z.string().uuid(),
    claim: z.enum(['observed_visibility', 'provider_availability', 'leading_opportunity']),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('generate_artifact'),
    agencyClientId: z.string().uuid(),
    artifactKind: z.literal('agency_visibility_report'),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('preview_artifact'),
    agencyClientId: z.string().uuid(),
    artifactKind: z.literal('agency_visibility_report'),
  }).strict(),
]).superRefine((request, context) => {
  if (request.capability === 'explain_measurement'
    || request.capability === 'generate_artifact'
    || request.capability === 'preview_artifact') {
    if (request.target.type !== 'agency_client' || request.target.id !== request.agencyClientId) {
      context.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'Artifact and measurement capabilities require the exact agency client target.',
      });
    }
  }
});
export type OrganizationCapabilityRequest = z.infer<typeof organizationCapabilityRequestSchema>;

export const organizationCapabilityAccessSchema = z.object({
  actorId: z.string().uuid(),
  isPlatformAdmin: z.boolean().default(false),
  scopes: z.array(targetSchema).max(500).default([]),
  permissions: z.object({
    read: z.boolean(),
    generateArtifact: z.boolean(),
    previewArtifact: z.boolean(),
    externalDelivery: z.boolean(),
  }).strict(),
}).strict();
export type OrganizationCapabilityAccess = z.infer<typeof organizationCapabilityAccessSchema>;

export type OrganizationCapabilityAuditEvent = {
  readonly contractVersion: typeof ORGANIZATION_CAPABILITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly actorId: string;
  readonly capability: OrganizationCapability;
  readonly targetType: OrganizationCapabilityRequest['target']['type'];
  readonly targetId: string | null;
  readonly outcome: 'ready' | 'denied' | 'invalid' | 'insufficient_evidence' | 'failed';
  readonly occurredAt: string;
};

export type OrganizationCapabilityErrorCode =
  | 'invalid_request'
  | 'actor_mismatch'
  | 'tenant_scope_violation'
  | 'permission_denied'
  | 'context_unavailable'
  | 'incompatible_measurement'
  | 'insufficient_evidence'
  | 'unsupported_claim'
  | 'capability_failed';

export type OrganizationCapabilityFailure = {
  readonly contractVersion: typeof ORGANIZATION_CAPABILITY_CONTRACT_VERSION;
  readonly status: 'denied' | 'invalid' | 'insufficient_evidence' | 'failed';
  readonly error: OrganizationCapabilityErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly externalDeliveryAuthorized: false;
};

export type OrganizationMarketContract = {
  readonly contextId: string;
  readonly contextVersion: string;
  readonly organizationIdentityId: string;
  readonly canonicalDomain: string;
  readonly scope: 'local' | 'regional' | 'national' | 'global' | 'online';
  readonly countryCode: string;
  readonly subdivisionCode: string | null;
  readonly locality: string | null;
  readonly serviceAreas: readonly string[];
  readonly languages: readonly string[];
  readonly timezone: string;
  readonly buyer: string | null;
  readonly approvedCompetitorDomains: readonly string[];
};

export const ORGANIZATION_CAPABILITY_DEFINITIONS = organizationCapabilitySchema.options.map((name) => ({
  name,
  readOnly: name !== 'generate_artifact',
  producesExternalEffect: false as const,
  permitsExternalDelivery: false as const,
  inputContractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
  outputContractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
}));

/**
 * Portable input boundary for a future API, SDK, or chat adapter. The adapter must authenticate
 * independently, construct access from server-side membership data, and call the same executor.
 * Database rows, delivery controls, and provider credentials are intentionally absent.
 */
export const organizationCapabilityJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://getgeopulse.com/schemas/organization-capability-v1.json',
  title: 'GEO-Pulse Organization Context capability request',
  type: 'object',
  additionalProperties: false,
  required: ['contractVersion', 'capability', 'audit', 'target'],
  properties: {
    contractVersion: { const: ORGANIZATION_CAPABILITY_CONTRACT_VERSION },
    capability: { enum: organizationCapabilitySchema.options },
    audit: {
      type: 'object', additionalProperties: false,
      required: ['requestId', 'actorId', 'requestedAt', 'purpose'],
      properties: {
        requestId: { type: 'string', minLength: 1, maxLength: 200 },
        actorId: { type: 'string', format: 'uuid' },
        requestedAt: { type: 'string', format: 'date-time' },
        purpose: { type: 'string', minLength: 1, maxLength: 300 },
      },
    },
    target: {
      type: 'object', additionalProperties: false, required: ['type', 'id'],
      properties: {
        type: { enum: ['agency_account', 'agency_client', 'startup_workspace', 'user', 'internal_benchmark'] },
        id: { type: ['string', 'null'], format: 'uuid' },
      },
    },
    domainId: { type: 'string', format: 'uuid' },
    domainHost: { type: 'string', minLength: 1 },
    url: { type: 'string', format: 'uri' },
    approvedAliasHosts: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1 } },
    sourceKinds: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1 } },
    observedAfter: { type: 'string', format: 'date-time' },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    agencyClientId: { type: 'string', format: 'uuid' },
    claim: { enum: ['observed_visibility', 'provider_availability', 'leading_opportunity'] },
    artifactKind: { const: 'agency_visibility_report' },
  },
  allOf: [
    { if: { properties: { capability: { const: 'detect_context' } } }, then: { required: ['url'] } },
    { if: { properties: { capability: { const: 'read_context' } } }, then: { required: ['domainId'] } },
    { if: { properties: { capability: { const: 'list_markets' } } }, then: { required: ['domainId'] } },
    { if: { properties: { capability: { const: 'retrieve_evidence' } } }, then: { required: ['domainHost'] } },
    { if: { properties: { capability: { const: 'explain_measurement' } } }, then: { required: ['agencyClientId', 'claim'] } },
    { if: { properties: { capability: { const: 'generate_artifact' } } }, then: { required: ['agencyClientId', 'artifactKind'] } },
    { if: { properties: { capability: { const: 'preview_artifact' } } }, then: { required: ['agencyClientId', 'artifactKind'] } },
  ],
} as const;
