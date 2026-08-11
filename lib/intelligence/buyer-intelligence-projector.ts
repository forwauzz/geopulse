import { z } from 'zod';
import type { BuyerIntelligenceSnapshot } from './buyer-intelligence-contract';
import { BUYER_INTELLIGENCE_QUESTIONS } from './buyer-intelligence-questions';
import type { QualityState } from './quality-policy';

export const BUYER_INTELLIGENCE_PROJECTOR_VERSION = 'buyer-intelligence-projector-v1';

const nonEmpty = z.string().trim().min(1);
const datetime = z.string().datetime();
const qualityStateSchema = z.enum([
  'valid',
  'valid_partial',
  'incomplete',
  'provider_failure',
  'orphaned',
  'parser_suspect',
  'configuration_mismatch',
  'duplicate',
  'quarantined',
] satisfies [QualityState, ...QualityState[]]);

const auditIssueSchema = z.object({
  checkId: nonEmpty,
  status: z.enum(['PASS', 'WARNING', 'PARTIAL', 'FAIL', 'MISSING', 'BLOCKED', 'LOW_CONFIDENCE', 'NOT_EVALUATED']),
  evidenceId: nonEmpty,
  evidenceStatus: z.enum(['present', 'missing', 'unverified']),
  contextVersion: nonEmpty,
}).strict();

const benchmarkComparisonInputSchema = z.object({
  metricKey: nonEmpty,
  businessValue: z.number().finite(),
  cohortMedian: z.number().finite(),
  denominator: z.number().int().min(0),
  percentile: z.number().min(0).max(100).nullable(),
}).strict();

export const buyerIntelligenceProjectionInputSchema = z.object({
  context: z.object({
    contextVersion: nonEmpty,
    status: z.enum(['draft', 'confirmed', 'conflicted', 'superseded']),
  }).strict(),
  generatedAt: datetime,
  staleAfterHours: z.number().positive(),
  audit: z.object({
    runId: nonEmpty,
    contextVersion: nonEmpty,
    qualityState: qualityStateSchema,
    collectedAt: datetime,
    issues: z.array(auditIssueSchema),
  }).strict().nullable(),
  benchmark: z.object({
    contextVersion: nonEmpty,
    qualityEligible: z.boolean(),
    protocolCompatible: z.boolean(),
    collectedAt: datetime,
    cohortId: nonEmpty,
    cohortVersion: nonEmpty,
    label: nonEmpty,
    methodologyVersion: nonEmpty,
    sampleSize: z.number().int().min(0),
    evidenceIds: z.array(nonEmpty),
    runIds: z.array(nonEmpty),
    comparisons: z.array(benchmarkComparisonInputSchema),
  }).strict().nullable(),
}).strict();

export type BuyerIntelligenceProjectionInput = z.infer<typeof buyerIntelligenceProjectionInputSchema>;
type Observation = BuyerIntelligenceSnapshot['observations'][number];
type Benchmark = BuyerIntelligenceSnapshot['benchmark'];
type ReportEligibility = BuyerIntelligenceSnapshot['reportEligibility'];

export type BuyerIntelligenceEvidenceProjection = {
  readonly projectorVersion: typeof BUYER_INTELLIGENCE_PROJECTOR_VERSION;
  readonly observations: readonly Observation[];
  readonly benchmark: Benchmark;
  readonly reportEligibility: ReportEligibility;
  readonly limitations: readonly string[];
  readonly provenance: {
    readonly evidenceIds: readonly string[];
    readonly runIds: readonly string[];
  };
};

function unavailableBenchmark(): Benchmark {
  return {
    state: 'not_available',
    cohortId: null,
    cohortVersion: null,
    label: null,
    sampleSize: null,
    methodologyVersion: null,
    comparisons: [],
    evidenceIds: [],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isStale(collectedAt: string, generatedAt: string, staleAfterHours: number): boolean {
  return Date.parse(generatedAt) - Date.parse(collectedAt) > staleAfterHours * 3_600_000;
}

function unavailableObservations(contextVersion: string, collectedAt: string): Observation[] {
  return BUYER_INTELLIGENCE_QUESTIONS.map((definition) => ({
    observationId: `obs_${definition.key}_unavailable`,
    contextVersion,
    buyerQuestionKey: definition.key,
    buyerQuestion: definition.question,
    state: 'not_available',
    answerSummary: null,
    evidenceIds: [],
    runIds: [],
    confidence: null,
    collectedAt,
  }));
}

function projectObservations(input: BuyerIntelligenceProjectionInput): {
  observations: Observation[];
  limitations: string[];
  quarantineReasons: string[];
} {
  const { audit, context } = input;
  if (!audit) {
    return {
      observations: unavailableObservations(context.contextVersion, input.generatedAt),
      limitations: ['Audit observations are unavailable: audit_missing.'],
      quarantineReasons: ['audit_missing'],
    };
  }
  const invalidReason = context.status !== 'confirmed'
    ? 'organization_context_unconfirmed'
    : audit.contextVersion !== context.contextVersion
      ? 'audit_context_mismatch'
      : audit.issues.some((issue) => issue.contextVersion !== context.contextVersion)
        ? 'audit_evidence_context_mismatch'
      : audit.qualityState !== 'valid' && audit.qualityState !== 'valid_partial'
        ? `audit_quality_${audit.qualityState}`
        : isStale(audit.collectedAt, input.generatedAt, input.staleAfterHours)
          ? 'audit_stale'
          : null;

  if (invalidReason) {
    return {
      observations: unavailableObservations(context.contextVersion, input.generatedAt),
      limitations: [`Audit observations are unavailable: ${invalidReason}.`],
      quarantineReasons: [invalidReason],
    };
  }

  const limitations: string[] = [];
  const observations = BUYER_INTELLIGENCE_QUESTIONS.map((definition): Observation => {
    const candidates = audit.issues
      .filter((issue) => definition.checks.includes(issue.checkId))
      .sort((left, right) => left.checkId.localeCompare(right.checkId));
    const measured = candidates.filter((issue) =>
      issue.evidenceStatus === 'present'
      && !['BLOCKED', 'LOW_CONFIDENCE', 'NOT_EVALUATED'].includes(issue.status)
    );
    if (measured.length === 0) {
      limitations.push(definition.unavailable);
      return unavailableObservations(context.contextVersion, audit.collectedAt)
        .find((item) => item.buyerQuestionKey === definition.key)!;
    }

    const state: 'supported' | 'partial' | 'missing' = measured.some((item) =>
      item.status === 'FAIL' || item.status === 'MISSING')
      ? 'missing'
      : measured.some((item) => item.status === 'WARNING' || item.status === 'PARTIAL')
        || audit.qualityState === 'valid_partial'
        ? 'partial'
        : 'supported';
    const evidenceIds = unique(measured.map((item) => item.evidenceId));
    return {
      observationId: `obs_${definition.key}_${audit.runId}`,
      contextVersion: context.contextVersion,
      buyerQuestionKey: definition.key,
      buyerQuestion: definition.question,
      state,
      answerSummary: definition.summaries[state],
      evidenceIds,
      runIds: [audit.runId],
      confidence: state === 'supported' ? 0.9 : state === 'partial' ? 0.75 : 0.85,
      collectedAt: audit.collectedAt,
    };
  });

  const hasMeasuredObservation = observations.some((item) => item.state !== 'not_available');
  return {
    observations,
    limitations,
    quarantineReasons: hasMeasuredObservation ? [] : ['audit_no_eligible_observations'],
  };
}

function projectBenchmark(input: BuyerIntelligenceProjectionInput): {
  benchmark: Benchmark;
  limitation: string | null;
  quarantineReason: string | null;
} {
  const benchmark = input.benchmark;
  if (!benchmark) return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison is not available for this period.', quarantineReason: null };
  if (benchmark.contextVersion !== input.context.contextVersion) {
    return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison was excluded because its organization context does not match.', quarantineReason: 'benchmark_context_mismatch' };
  }
  if (!benchmark.protocolCompatible) {
    return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison was excluded because its measurement protocol is incompatible.', quarantineReason: 'benchmark_protocol_incompatible' };
  }
  if (!benchmark.qualityEligible) {
    return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison is unavailable because the measurement window did not pass quality gates.', quarantineReason: null };
  }
  if (isStale(benchmark.collectedAt, input.generatedAt, input.staleAfterHours)) {
    return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison is unavailable because the eligible window is stale.', quarantineReason: null };
  }
  const invalidSample = benchmark.sampleSize <= 0
    || benchmark.comparisons.length === 0
    || benchmark.evidenceIds.length === 0
    || benchmark.runIds.length === 0
    || benchmark.comparisons.some((item) => item.denominator <= 0 || item.denominator > benchmark.sampleSize);
  if (invalidSample) {
    return { benchmark: unavailableBenchmark(), limitation: 'Benchmark comparison is unavailable because the eligible cohort is insufficient.', quarantineReason: null };
  }

  return {
    benchmark: {
      state: 'eligible',
      cohortId: benchmark.cohortId,
      cohortVersion: benchmark.cohortVersion,
      label: benchmark.label,
      sampleSize: benchmark.sampleSize,
      methodologyVersion: benchmark.methodologyVersion,
      comparisons: [...benchmark.comparisons].sort((left, right) => left.metricKey.localeCompare(right.metricKey)),
      evidenceIds: unique(benchmark.evidenceIds),
    },
    limitation: null,
    quarantineReason: null,
  };
}

export function projectBuyerIntelligenceEvidence(
  rawInput: BuyerIntelligenceProjectionInput
): BuyerIntelligenceEvidenceProjection {
  const input = buyerIntelligenceProjectionInputSchema.parse(rawInput);
  const audit = projectObservations(input);
  const benchmark = projectBenchmark(input);
  const reasons = unique([
    ...audit.quarantineReasons,
    ...(benchmark.quarantineReason ? [benchmark.quarantineReason] : []),
  ]);
  const usedAuditEvidence = audit.observations.flatMap((item) => item.evidenceIds);
  const usedAuditRuns = audit.observations.flatMap((item) => item.runIds);
  const benchmarkEvidence = benchmark.benchmark.state === 'eligible' ? benchmark.benchmark.evidenceIds : [];
  const benchmarkRuns = benchmark.benchmark.state === 'eligible' ? input.benchmark?.runIds ?? [] : [];

  return {
    projectorVersion: BUYER_INTELLIGENCE_PROJECTOR_VERSION,
    observations: audit.observations,
    benchmark: benchmark.benchmark,
    reportEligibility: reasons.length > 0
      ? { state: 'quarantined', reasons }
      : { state: 'eligible', reasons: [] },
    limitations: unique([
      ...audit.limitations,
      ...(benchmark.limitation ? [benchmark.limitation] : []),
    ]),
    provenance: {
      evidenceIds: unique([...usedAuditEvidence, ...benchmarkEvidence]),
      runIds: unique([...usedAuditRuns, ...benchmarkRuns]),
    },
  };
}
