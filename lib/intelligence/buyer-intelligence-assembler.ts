import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  BUYER_INTELLIGENCE_SNAPSHOT_VERSION,
  buyerIntelligenceSnapshotSchema,
  type BuyerIntelligenceSnapshot,
} from './buyer-intelligence-contract';
import type { BuyerIntelligenceEvidenceProjection } from './buyer-intelligence-projector';
import { organizationContextSchema, type OrganizationContext } from './organization-context';
import type { AgencyReportIntegrityRecord } from './agency-report-integrity';
import {
  evaluateBuyerIntelligenceChange,
  evaluateRecommendationVerification,
} from './buyer-intelligence-snapshot-change';

export const BUYER_INTELLIGENCE_ASSEMBLER_VERSION = 'buyer-intelligence-assembler-v1';

const nonEmpty = z.string().trim().min(1);
const datetime = z.string().datetime();

const providerSchema = z.object({
  key: nonEmpty,
  status: z.enum(['measured', 'unavailable', 'failed']),
  runIds: z.array(nonEmpty),
}).strict();

const recommendationDefinitionSchema = z.object({
  recommendationId: nonEmpty,
  buyerQuestionKeys: z.array(nonEmpty).min(1),
  title: nonEmpty,
  action: nonEmpty,
  ownerClass: z.enum(['leadership', 'marketing', 'sales', 'development', 'operations']),
  priority: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['small', 'medium', 'large']),
  state: z.enum(['proposed', 'accepted', 'in_progress', 'fixed', 'fixed_no_measured_gain', 'regressed', 'dismissed']),
  ruleVersion: nonEmpty,
  kind: z.enum(['audit_check', 'buyer_question', 'benchmark_metric', 'manual_evidence']),
  expectedCondition: nonEmpty,
}).strict();

export const buyerIntelligenceAssemblyInputSchema = z.object({
  context: organizationContextSchema,
  projection: z.custom<BuyerIntelligenceEvidenceProjection>((value) => Boolean(value && typeof value === 'object')),
  period: z.object({ start: datetime, end: datetime }).strict(),
  measurement: z.object({
    querySetId: nonEmpty,
    querySetVersion: nonEmpty,
    qualityPolicyVersion: nonEmpty,
    evaluatorVersion: nonEmpty,
    providerQualityVersion: nonEmpty,
    providers: z.array(providerSchema).min(1),
  }).strict(),
  recommendations: z.array(recommendationDefinitionSchema),
  previousSnapshot: buyerIntelligenceSnapshotSchema.nullable(),
  generatedAt: datetime,
}).strict();

export type BuyerIntelligenceAssemblyInput = z.infer<typeof buyerIntelligenceAssemblyInputSchema>;
export type BuyerIntelligenceMeasurementInput = BuyerIntelligenceAssemblyInput['measurement'];

/**
 * Compatibility bridge only. Agency report v2 remains a presentation artifact; its integrity
 * record may supply versioned measurement lineage but never organization or observation truth.
 */
export function adaptAgencySnapshotV2Compatibility(args: {
  readonly version: '2';
  readonly integrity: AgencyReportIntegrityRecord;
  readonly context: OrganizationContext;
  readonly qualityPolicyVersion: string;
  readonly evaluatorVersion: string;
}): BuyerIntelligenceMeasurementInput {
  const context = organizationContextSchema.parse(args.context);
  const integrity = args.integrity;
  if (context.status !== 'confirmed') throw new Error('organization_context_unconfirmed');
  if (integrity.organizationIdentityId !== context.organization.identityId
    || integrity.contextId !== context.contextId
    || integrity.contextVersion !== context.contextVersion
    || integrity.contextHash !== context.contentHash
    || integrity.canonicalDomain !== context.organization.canonicalDomain) {
    throw new Error('agency_snapshot_context_mismatch');
  }
  if (!integrity.fingerprint.trim()) throw new Error('agency_snapshot_integrity_missing');
  const measured = new Set(integrity.measuredEngines);
  const unavailable = new Set(integrity.unavailableEngines);
  const providers = unique(integrity.configuredEngines).map((key) => ({
    key,
    status: measured.has(key) ? 'measured' as const : unavailable.has(key) ? 'unavailable' as const : 'failed' as const,
    runIds: measured.has(key) && integrity.sourceRunGroupIds[key] ? [integrity.sourceRunGroupIds[key]!] : [],
  }));
  return {
    querySetId: integrity.querySetId,
    querySetVersion: integrity.querySetVersion,
    qualityPolicyVersion: nonEmpty.parse(args.qualityPolicyVersion),
    evaluatorVersion: nonEmpty.parse(args.evaluatorVersion),
    providerQualityVersion: integrity.providerQualityVersion,
    providers: z.array(providerSchema).min(1).parse(providers),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function fingerprint(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function assembleBuyerIntelligenceSnapshot(rawInput: BuyerIntelligenceAssemblyInput): BuyerIntelligenceSnapshot {
  const input = buyerIntelligenceAssemblyInputSchema.parse(rawInput);
  if (input.context.status !== 'confirmed') throw new Error('organization_context_unconfirmed');
  if (!input.context.organization.category) throw new Error('organization_category_missing');
  if (Date.parse(input.period.start) >= Date.parse(input.period.end)) throw new Error('snapshot_period_invalid');
  if (input.projection.observations.some((item) => item.contextVersion !== input.context.contextVersion)) {
    throw new Error('projection_context_mismatch');
  }
  if (input.projection.provenance.runIds.length === 0) throw new Error('projection_run_lineage_missing');

  const previousSnapshotId = input.previousSnapshot?.snapshotId ?? null;
  const assemblyFingerprint = fingerprint({
    contextVersion: input.context.contextVersion,
    contextHash: input.context.contentHash,
    projection: input.projection,
    period: input.period,
    measurement: input.measurement,
    recommendations: input.recommendations,
    previousSnapshotId,
    generatedAt: input.generatedAt,
    assemblerVersion: BUYER_INTELLIGENCE_ASSEMBLER_VERSION,
  });
  const snapshotId = `bis_${assemblyFingerprint.slice('sha256:'.length, 'sha256:'.length + 24)}`;
  const organization: BuyerIntelligenceSnapshot['organization'] = {
    identityId: input.context.organization.identityId,
    contextId: input.context.contextId,
    contextVersion: input.context.contextVersion,
    contextHash: input.context.contentHash,
    status: input.context.status,
    displayName: input.context.organization.displayName,
    canonicalDomain: input.context.organization.canonicalDomain,
    category: input.context.organization.category,
    market: {
      scope: input.context.market.scope,
      countryCode: input.context.market.countryCode,
      subdivisionCode: input.context.market.subdivisionCode,
      locality: input.context.market.locality,
      languages: input.context.market.languages,
      buyer: input.context.market.buyer,
    },
  };
  const measurement: BuyerIntelligenceSnapshot['measurement'] = {
    ...input.measurement,
    runIds: unique(input.projection.provenance.runIds),
    providers: [...input.measurement.providers].sort((left, right) => left.key.localeCompare(right.key)),
  };
  const current = {
    organization,
    measurement,
    observations: [...input.projection.observations],
    reportEligibility: input.projection.reportEligibility,
  };
  const change = evaluateBuyerIntelligenceChange(input.previousSnapshot, current, previousSnapshotId);
  const recommendations = [...input.recommendations]
    .sort((left, right) => left.recommendationId.localeCompare(right.recommendationId))
    .flatMap((definition) => {
      const observations = current.observations.filter((item) => definition.buyerQuestionKeys.includes(item.buyerQuestionKey));
      const evidenceIds = unique(observations.flatMap((item) => item.evidenceIds));
      if (observations.length === 0 || evidenceIds.length === 0) return [];
      const calculated = evaluateRecommendationVerification(snapshotId, definition.buyerQuestionKeys, current.observations, change);
      return [{
        recommendationId: definition.recommendationId,
        contextVersion: input.context.contextVersion,
        observationIds: observations.map((item) => item.observationId).sort(),
        title: definition.title,
        action: definition.action,
        ownerClass: definition.ownerClass,
        priority: definition.priority,
        effort: definition.effort,
        state: definition.state,
        evidenceIds,
        verification: {
          ...calculated,
          ruleVersion: definition.ruleVersion,
          kind: definition.kind,
          expectedCondition: definition.expectedCondition,
        },
      }];
    });
  const snapshot: BuyerIntelligenceSnapshot = {
    contractVersion: BUYER_INTELLIGENCE_SNAPSHOT_VERSION,
    snapshotId,
    owner: input.context.owner,
    organization,
    period: { ...input.period, previousSnapshotId },
    measurement,
    observations: current.observations,
    benchmark: input.projection.benchmark,
    recommendations,
    change,
    reportEligibility: input.projection.reportEligibility,
    limitations: unique(input.projection.limitations),
    provenance: {
      generatedAt: input.generatedAt,
      generatorVersion: BUYER_INTELLIGENCE_ASSEMBLER_VERSION,
      inputFingerprint: assemblyFingerprint,
      evidenceIds: unique([
        ...input.projection.provenance.evidenceIds,
        ...recommendations.flatMap((item) => item.evidenceIds),
        ...recommendations.flatMap((item) => item.verification.evidenceIds),
      ]),
      runIds: unique([
        ...input.projection.provenance.runIds,
        ...recommendations.flatMap((item) => item.verification.runIds),
      ]),
    },
  };
  return buyerIntelligenceSnapshotSchema.parse(snapshot);
}
