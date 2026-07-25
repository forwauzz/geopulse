import { z } from 'zod';

export const REASONING_CONTRACT_VERSION = 'intelligence-reasoning-v1';
export const REASONING_POLICY_VERSION = 'evidence-gate-v1';

export const reasoningCapabilitySchema = z.enum([
  'domain_timeline',
  'lane_window_health',
  'compare_windows',
  'uncited_buyer_questions',
  'evidence_lineage',
  'intervention_outcomes',
  'explain_anomaly',
  'recommend_next_action',
]);
export type ReasoningCapability = z.infer<typeof reasoningCapabilitySchema>;

export const reasoningAccessSchema = z.object({
  actorId: z.string().min(1),
  isPlatformAdmin: z.boolean().default(false),
  tenantType: z.string().min(1).nullable().default(null),
  tenantId: z.string().min(1).nullable().default(null),
}).strict();
export type ReasoningAccess = z.infer<typeof reasoningAccessSchema>;

export const reasoningRequestSchema = z.object({
  capability: reasoningCapabilitySchema,
  canonicalDomainId: z.string().uuid().optional(),
  laneId: z.string().uuid().optional(),
  windowIds: z.array(z.string().min(1)).max(2).optional(),
  evidenceId: z.string().min(1).optional(),
  recommendationId: z.string().uuid().optional(),
  anomalyCode: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(100).default(25),
}).strict().superRefine((input, ctx) => {
  const requireField = (field: keyof typeof input, message: string) => {
    if (!input[field]) ctx.addIssue({ code: 'custom', path: [field], message });
  };
  if (['domain_timeline', 'uncited_buyer_questions', 'recommend_next_action'].includes(input.capability)) {
    requireField('canonicalDomainId', 'canonicalDomainId is required for this capability');
  }
  if (input.capability === 'lane_window_health') requireField('laneId', 'laneId is required');
  if (input.capability === 'compare_windows' && input.windowIds?.length !== 2) {
    ctx.addIssue({ code: 'custom', path: ['windowIds'], message: 'Exactly two windowIds are required' });
  }
  if (input.capability === 'evidence_lineage') requireField('evidenceId', 'evidenceId is required');
  if (input.capability === 'intervention_outcomes') {
    requireField('recommendationId', 'recommendationId is required');
  }
  if (input.capability === 'explain_anomaly') requireField('anomalyCode', 'anomalyCode is required');
});
export type ReasoningRequest = z.infer<typeof reasoningRequestSchema>;

export const reasoningFactSchema = z.object({
  factId: z.string().min(1),
  factType: z.string().min(1),
  summary: z.string().min(1),
  value: z.unknown(),
  evidenceIds: z.array(z.string().min(1)),
  compatibleRunIds: z.array(z.string().min(1)),
  qualityState: z.enum(['valid', 'valid_partial']),
  comparisonLabel: z.enum(['exact', 'exact_lane_version', 'not_applicable']),
  causalityLabel: z.enum(['not_applicable', 'observational_association_not_causation']),
  tenantType: z.string().nullable(),
  tenantId: z.string().nullable(),
  policyVersion: z.string().min(1),
  promptVersion: z.string().min(1).nullable(),
  modelVersion: z.string().min(1).nullable(),
}).strict();
export type ReasoningFact = z.infer<typeof reasoningFactSchema>;

export const reasoningInsightSchema = z.object({
  contractVersion: z.literal(REASONING_CONTRACT_VERSION),
  capability: reasoningCapabilitySchema,
  status: z.enum(['ready', 'insufficient_evidence']),
  finding: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)),
  compatibleRunIds: z.array(z.string().min(1)),
  policyVersion: z.string().min(1),
  promptVersion: z.string().min(1).nullable(),
  provider: z.string().min(1),
  modelVersion: z.string().min(1).nullable(),
  limitations: z.array(z.string().min(1)).min(1),
  recommendedAction: z.enum([
    'collect_more_evidence',
    'repeat_compatible_measurement',
    'inspect_source_evidence',
    'review_approved_intervention',
    'no_action',
  ]),
}).strict();
export type ReasoningInsight = z.infer<typeof reasoningInsightSchema>;

export const reasoningErrorSchema = z.object({
  contractVersion: z.literal(REASONING_CONTRACT_VERSION),
  error: z.enum([
    'unauthorized',
    'rate_limited',
    'validation_error',
    'insufficient_evidence',
    'unsupported_claim',
    'tenant_scope_violation',
    'migration_pending',
    'internal_error',
  ]),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type ReasoningError = z.infer<typeof reasoningErrorSchema>;

export const reasoningToolSchema = z.object({
  name: reasoningCapabilitySchema,
  description: z.string().min(1),
  readOnly: z.literal(true),
  inputContractVersion: z.literal(REASONING_CONTRACT_VERSION),
  outputContractVersion: z.literal(REASONING_CONTRACT_VERSION),
}).strict();

export const REASONING_TOOLS = reasoningCapabilitySchema.options.map((name) => ({
  name,
  description: `Read-only ${name.replaceAll('_', ' ')} intelligence capability.`,
  readOnly: true as const,
  inputContractVersion: REASONING_CONTRACT_VERSION,
  outputContractVersion: REASONING_CONTRACT_VERSION,
}));

/** Portable boundary description for future /api/v1 wrappers; database shapes stay private. */
export const reasoningContractJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://getgeopulse.com/schemas/intelligence-reasoning-v1.json',
  title: 'GEO-Pulse intelligence reasoning request',
  type: 'object',
  additionalProperties: false,
  required: ['capability'],
  properties: {
    capability: { type: 'string', enum: reasoningCapabilitySchema.options },
    canonicalDomainId: { type: 'string', format: 'uuid' },
    laneId: { type: 'string', format: 'uuid' },
    windowIds: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
    evidenceId: { type: 'string' },
    recommendationId: { type: 'string', format: 'uuid' },
    anomalyCode: { type: 'string', maxLength: 100 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
} as const;
