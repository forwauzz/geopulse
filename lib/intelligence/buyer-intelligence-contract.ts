import { z } from 'zod';
import {
  organizationContextStatusSchema,
  organizationMarketScopeSchema,
  organizationOwnerSchema,
} from './organization-context';

export const BUYER_INTELLIGENCE_SNAPSHOT_VERSION = 'buyer-intelligence-snapshot-v1';

const nonEmpty = z.string().trim().min(1);
const datetime = z.string().datetime();
const fingerprint = z.string().regex(/^sha256:[0-9a-f]{64}$/);

const marketSchema = z.object({
  scope: organizationMarketScopeSchema,
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  subdivisionCode: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/).nullable(),
  locality: nonEmpty.nullable(),
  languages: z.array(z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/)).min(1),
  buyer: nonEmpty.nullable(),
}).strict();

const providerMeasurementSchema = z.object({
  key: nonEmpty,
  status: z.enum(['measured', 'unavailable', 'failed']),
  runIds: z.array(nonEmpty),
}).strict().superRefine((provider, context) => {
  if (provider.status === 'measured' && provider.runIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['runIds'], message: 'Measured providers require run lineage.' });
  }
  if (provider.status === 'unavailable' && provider.runIds.length > 0) {
    context.addIssue({ code: 'custom', path: ['runIds'], message: 'Unavailable providers cannot claim measured runs.' });
  }
});

const observationSchema = z.object({
  observationId: nonEmpty,
  contextVersion: nonEmpty,
  buyerQuestionKey: nonEmpty,
  buyerQuestion: nonEmpty,
  state: z.enum(['supported', 'partial', 'missing', 'not_available']),
  answerSummary: nonEmpty.nullable(),
  evidenceIds: z.array(nonEmpty),
  runIds: z.array(nonEmpty),
  confidence: z.number().min(0).max(1).nullable(),
  collectedAt: datetime,
}).strict().superRefine((observation, context) => {
  if (observation.state === 'not_available') {
    if (observation.answerSummary !== null || observation.confidence !== null
      || observation.evidenceIds.length > 0 || observation.runIds.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'Unavailable observations cannot contain an answer, confidence, evidence, or run lineage.',
      });
    }
    return;
  }
  if (observation.confidence === null || observation.evidenceIds.length === 0 || observation.runIds.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'Measured observations require confidence, evidence, and run lineage.',
    });
  }
});

const benchmarkComparisonSchema = z.object({
  metricKey: nonEmpty,
  businessValue: z.number(),
  cohortMedian: z.number(),
  denominator: z.number().int().positive(),
  percentile: z.number().min(0).max(100).nullable(),
}).strict();

const eligibleBenchmarkSchema = z.object({
  state: z.literal('eligible'),
  cohortId: nonEmpty,
  cohortVersion: nonEmpty,
  label: nonEmpty,
  sampleSize: z.number().int().positive(),
  methodologyVersion: nonEmpty,
  comparisons: z.array(benchmarkComparisonSchema).min(1),
  evidenceIds: z.array(nonEmpty).min(1),
}).strict().superRefine((benchmark, context) => {
  for (const [index, comparison] of benchmark.comparisons.entries()) {
    if (comparison.denominator > benchmark.sampleSize) {
      context.addIssue({
        code: 'custom',
        path: ['comparisons', index, 'denominator'],
        message: 'A metric denominator cannot exceed the eligible cohort sample size.',
      });
    }
  }
});

const unavailableBenchmarkSchema = z.object({
  state: z.literal('not_available'),
  cohortId: z.null(),
  cohortVersion: z.null(),
  label: z.null(),
  sampleSize: z.null(),
  methodologyVersion: z.null(),
  comparisons: z.array(z.never()).max(0),
  evidenceIds: z.array(z.never()).max(0),
}).strict();

const recommendationSchema = z.object({
  recommendationId: nonEmpty,
  contextVersion: nonEmpty,
  observationIds: z.array(nonEmpty).min(1),
  title: nonEmpty,
  action: nonEmpty,
  ownerClass: z.enum(['leadership', 'marketing', 'sales', 'development', 'operations']),
  priority: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['small', 'medium', 'large']),
  state: z.enum([
    'proposed',
    'accepted',
    'in_progress',
    'fixed',
    'fixed_no_measured_gain',
    'regressed',
    'dismissed',
  ]),
  evidenceIds: z.array(nonEmpty).min(1),
  verification: z.object({
    ruleVersion: nonEmpty,
    kind: z.enum(['audit_check', 'buyer_question', 'benchmark_metric', 'manual_evidence']),
    expectedCondition: nonEmpty,
    lastEvaluatedSnapshotId: nonEmpty.nullable(),
    result: z.enum(['not_evaluated', 'passed', 'failed', 'inconclusive']),
  }).strict(),
}).strict().superRefine((recommendation, context) => {
  if (recommendation.verification.result === 'not_evaluated'
    && recommendation.verification.lastEvaluatedSnapshotId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['verification', 'lastEvaluatedSnapshotId'],
      message: 'Unevaluated recommendations cannot reference an evaluation snapshot.',
    });
  }
  if (recommendation.verification.result !== 'not_evaluated'
    && recommendation.verification.lastEvaluatedSnapshotId === null) {
    context.addIssue({
      code: 'custom',
      path: ['verification', 'lastEvaluatedSnapshotId'],
      message: 'Verification results require the snapshot that produced them.',
    });
  }
});

export const buyerIntelligenceSnapshotSchema = z.object({
  contractVersion: z.literal(BUYER_INTELLIGENCE_SNAPSHOT_VERSION),
  snapshotId: nonEmpty,
  owner: organizationOwnerSchema,
  organization: z.object({
    identityId: z.string().uuid(),
    contextId: nonEmpty,
    contextVersion: nonEmpty,
    contextHash: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
    status: organizationContextStatusSchema,
    displayName: nonEmpty,
    canonicalDomain: nonEmpty,
    category: nonEmpty,
    market: marketSchema,
  }).strict(),
  period: z.object({
    start: datetime,
    end: datetime,
    previousSnapshotId: nonEmpty.nullable(),
  }).strict(),
  measurement: z.object({
    querySetId: nonEmpty,
    querySetVersion: nonEmpty,
    qualityPolicyVersion: nonEmpty,
    evaluatorVersion: nonEmpty,
    providerQualityVersion: nonEmpty,
    runIds: z.array(nonEmpty).min(1),
    providers: z.array(providerMeasurementSchema).min(1),
  }).strict(),
  observations: z.array(observationSchema).min(1),
  benchmark: z.union([eligibleBenchmarkSchema, unavailableBenchmarkSchema]),
  recommendations: z.array(recommendationSchema),
  change: z.object({
    comparable: z.boolean(),
    reasons: z.array(nonEmpty),
    changes: z.array(z.object({
      metricKey: nonEmpty,
      previousValue: z.number().nullable(),
      currentValue: z.number().nullable(),
      direction: z.enum(['improved', 'regressed', 'unchanged', 'not_comparable']),
    }).strict()),
  }).strict(),
  reportEligibility: z.object({
    state: z.enum(['eligible', 'quarantined']),
    reasons: z.array(nonEmpty),
  }).strict(),
  limitations: z.array(nonEmpty),
  provenance: z.object({
    generatedAt: datetime,
    generatorVersion: nonEmpty,
    inputFingerprint: fingerprint,
    evidenceIds: z.array(nonEmpty),
    runIds: z.array(nonEmpty).min(1),
  }).strict(),
}).strict().superRefine((snapshot, context) => {
  const contextVersion = snapshot.organization.contextVersion;
  snapshot.observations.forEach((observation, index) => {
    if (observation.contextVersion !== contextVersion) {
      context.addIssue({
        code: 'custom',
        path: ['observations', index, 'contextVersion'],
        message: 'Observation context version must match the snapshot context version.',
      });
    }
  });
  snapshot.recommendations.forEach((recommendation, index) => {
    if (recommendation.contextVersion !== contextVersion) {
      context.addIssue({
        code: 'custom',
        path: ['recommendations', index, 'contextVersion'],
        message: 'Recommendation context version must match the snapshot context version.',
      });
    }
  });

  const observationIds = new Set(snapshot.observations.map((item) => item.observationId));
  const evidenceIds = new Set(snapshot.provenance.evidenceIds);
  const runIds = new Set(snapshot.provenance.runIds);
  const referencedEvidence = [
    ...snapshot.observations.flatMap((item) => item.evidenceIds),
    ...snapshot.recommendations.flatMap((item) => item.evidenceIds),
    ...snapshot.benchmark.evidenceIds,
  ];
  const referencedRuns = [
    ...snapshot.measurement.runIds,
    ...snapshot.measurement.providers.flatMap((item) => item.runIds),
    ...snapshot.observations.flatMap((item) => item.runIds),
  ];
  if (snapshot.recommendations.some((item) => item.observationIds.some((id) => !observationIds.has(id)))) {
    context.addIssue({ code: 'custom', path: ['recommendations'], message: 'Recommendations must reference snapshot observations.' });
  }
  if (referencedEvidence.some((id) => !evidenceIds.has(id))) {
    context.addIssue({ code: 'custom', path: ['provenance', 'evidenceIds'], message: 'All evidence must be declared in snapshot provenance.' });
  }
  if (referencedRuns.some((id) => !runIds.has(id))) {
    context.addIssue({ code: 'custom', path: ['provenance', 'runIds'], message: 'All runs must be declared in snapshot provenance.' });
  }
  if (snapshot.reportEligibility.state === 'eligible' && snapshot.organization.status !== 'confirmed') {
    context.addIssue({ code: 'custom', path: ['reportEligibility'], message: 'Only confirmed organization contexts are report eligible.' });
  }
  if (snapshot.reportEligibility.state === 'eligible' && snapshot.reportEligibility.reasons.length > 0) {
    context.addIssue({ code: 'custom', path: ['reportEligibility', 'reasons'], message: 'Eligible reports cannot carry quarantine reasons.' });
  }
  if (snapshot.reportEligibility.state === 'quarantined' && snapshot.reportEligibility.reasons.length === 0) {
    context.addIssue({ code: 'custom', path: ['reportEligibility', 'reasons'], message: 'Quarantined reports require a reason.' });
  }
  if (snapshot.change.comparable && !snapshot.period.previousSnapshotId) {
    context.addIssue({ code: 'custom', path: ['change', 'comparable'], message: 'Comparable change requires a previous snapshot.' });
  }
  if (Date.parse(snapshot.period.start) >= Date.parse(snapshot.period.end)) {
    context.addIssue({ code: 'custom', path: ['period'], message: 'Snapshot period end must follow its start.' });
  }
});

export type BuyerIntelligenceSnapshot = z.infer<typeof buyerIntelligenceSnapshotSchema>;
