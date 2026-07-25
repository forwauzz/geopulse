import { createHash } from 'node:crypto';

export const QUALITY_POLICY_VERSION = 'quality-policy-v1';
export const STALE_RUNNING_HOURS = 6;

export type QualityState =
  | 'valid'
  | 'valid_partial'
  | 'incomplete'
  | 'provider_failure'
  | 'orphaned'
  | 'parser_suspect'
  | 'configuration_mismatch'
  | 'duplicate'
  | 'quarantined';

export type QualityReasonCode =
  | 'completed_with_response'
  | 'completed_zero_citations'
  | 'source_partial'
  | 'source_still_running'
  | 'stale_running'
  | 'provider_error'
  | 'missing_parent'
  | 'missing_response'
  | 'citation_shape_invalid'
  | 'missing_protocol_dimension'
  | 'duplicate_execution'
  | 'operator_quarantine';

export type QualityRunInput = {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly sourceStatus: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly responsePresent: boolean;
  readonly providerErrorPresent: boolean;
  readonly citationCount: number;
  readonly invalidCitationCount: number;
  readonly parentPresent: boolean;
  readonly protocolComplete: boolean;
  readonly duplicate: boolean;
  readonly quarantined?: boolean;
};

export type QualityClassification = {
  readonly state: QualityState;
  readonly reasonCodes: readonly QualityReasonCode[];
  readonly ageHours: number | null;
};

function hoursSince(timestamp: string | null, now: Date): number | null {
  if (!timestamp) return null;
  const milliseconds = now.getTime() - new Date(timestamp).getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds / 3_600_000) : null;
}

export function classifyRunQuality(
  input: QualityRunInput,
  now = new Date()
): QualityClassification {
  const ageHours = hoursSince(input.startedAt, now);
  if (input.quarantined) return { state: 'quarantined', reasonCodes: ['operator_quarantine'], ageHours };
  if (!input.parentPresent) return { state: 'orphaned', reasonCodes: ['missing_parent'], ageHours };
  if (input.duplicate) return { state: 'duplicate', reasonCodes: ['duplicate_execution'], ageHours };
  if (input.providerErrorPresent || ['failed', 'error'].includes(input.sourceStatus ?? '')) {
    return { state: 'provider_failure', reasonCodes: ['provider_error'], ageHours };
  }
  if (input.invalidCitationCount > 0) {
    return { state: 'parser_suspect', reasonCodes: ['citation_shape_invalid'], ageHours };
  }
  if (!input.protocolComplete) {
    return { state: 'configuration_mismatch', reasonCodes: ['missing_protocol_dimension'], ageHours };
  }
  if (['running', 'queued'].includes(input.sourceStatus ?? '')) {
    const stale = ageHours !== null && ageHours >= STALE_RUNNING_HOURS;
    return {
      state: 'incomplete',
      reasonCodes: [stale ? 'stale_running' : 'source_still_running'],
      ageHours,
    };
  }
  if (!input.responsePresent) {
    return { state: 'incomplete', reasonCodes: ['missing_response'], ageHours };
  }
  if (input.citationCount === 0) {
    return { state: 'valid', reasonCodes: ['completed_zero_citations'], ageHours };
  }
  if (input.sourceStatus === 'partial') {
    return { state: 'valid_partial', reasonCodes: ['source_partial'], ageHours };
  }
  return { state: 'valid', reasonCodes: ['completed_with_response'], ageHours };
}

export type WindowRun = {
  readonly queryId: string;
  readonly modelId: string;
  readonly runMode: string;
  readonly qualityState: QualityState;
  readonly citationCount: number;
};

export type WindowAssessment = {
  readonly eligible: boolean;
  readonly coverageRatio: number;
  readonly expectedCellCount: number;
  readonly validCellCount: number;
  readonly missingCells: readonly string[];
  readonly anomalyCodes: readonly string[];
};

export function assessMeasurementWindow(
  runs: readonly WindowRun[],
  requiredModes: readonly string[],
  previousCitationRate: number | null = null
): WindowAssessment {
  const queryIds = [...new Set(runs.map((run) => run.queryId))].sort();
  const modelIds = [...new Set(runs.map((run) => run.modelId))].sort();
  const expected = queryIds.flatMap((queryId) =>
    modelIds.flatMap((modelId) =>
      requiredModes.map((mode) => `${queryId}:${modelId}:${mode}`)
    )
  );
  const valid = new Set(
    runs
      .filter((run) => run.qualityState === 'valid' || run.qualityState === 'valid_partial')
      .map((run) => `${run.queryId}:${run.modelId}:${run.runMode}`)
  );
  const missingCells = expected.filter((cell) => !valid.has(cell));
  const validRuns = runs.filter((run) => run.qualityState === 'valid' || run.qualityState === 'valid_partial');
  const citationRate = validRuns.length
    ? validRuns.filter((run) => run.citationCount > 0).length / validRuns.length
    : 0;
  const anomalyCodes: string[] = [];
  if (validRuns.length >= 3 && citationRate === 0) anomalyCodes.push('whole_cohort_all_zero');
  if (
    previousCitationRate !== null &&
    validRuns.length >= 3 &&
    Math.abs(previousCitationRate - citationRate) >= 0.75
  ) anomalyCodes.push('citation_rate_discontinuity');
  const expectedCellCount = expected.length;
  const validCellCount = expectedCellCount - missingCells.length;
  return {
    eligible: expectedCellCount > 0 && missingCells.length === 0 && anomalyCodes.length === 0,
    coverageRatio: expectedCellCount ? validCellCount / expectedCellCount : 0,
    expectedCellCount,
    validCellCount,
    missingCells,
    anomalyCodes,
  };
}

export function qualityClassificationId(
  sourceKind: string,
  sourceId: string,
  sourceSnapshot: string,
  state: QualityState,
  reasonCodes: readonly QualityReasonCode[]
): string {
  const input = [QUALITY_POLICY_VERSION, sourceKind, sourceId, sourceSnapshot, state, ...reasonCodes].join(':');
  return `qc_${createHash('sha256').update(input).digest('hex').slice(0, 40)}`;
}
