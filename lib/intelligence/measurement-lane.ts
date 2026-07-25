import { createHash } from 'node:crypto';

export const MEASUREMENT_LANE_PROTOCOL_VERSION = 'measurement-lane-v1';
export const UNKNOWN_PROTOCOL_VALUE = 'unknown';
export const NOT_APPLICABLE_PROTOCOL_VALUE = 'not_applicable';

export type MeasurementFrameKind =
  | 'broad_vertical'
  | 'business_counsel'
  | 'startup_pilot'
  | 'domain_specific'
  | 'user_prompt'
  | 'legacy_unknown';

export type MeasurementLaneProtocol = {
  readonly frameKind: MeasurementFrameKind;
  readonly vertical: string;
  readonly subvertical: string;
  readonly cohortDefinitionVersion: string;
  readonly querySetId: string;
  readonly querySetVersion: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelSnapshot: string;
  readonly runMode: string;
  readonly groundingMethod: string;
  readonly scannerVersion: string;
  readonly checkCatalogVersion: string;
  readonly promptVersion: string;
  readonly citationParserVersion: string;
  readonly scheduleVersion: string;
  readonly cadence: string;
  readonly metricDefinitionVersion: string;
};

export type CompatibilityReasonCode =
  | 'compatible'
  | 'unknown_protocol_value'
  | 'frame_mismatch'
  | 'vertical_mismatch'
  | 'subvertical_mismatch'
  | 'cohort_definition_mismatch'
  | 'query_set_mismatch'
  | 'query_set_version_mismatch'
  | 'provider_mismatch'
  | 'model_mismatch'
  | 'model_snapshot_mismatch'
  | 'run_mode_mismatch'
  | 'grounding_method_mismatch'
  | 'scanner_version_mismatch'
  | 'check_catalog_version_mismatch'
  | 'prompt_version_mismatch'
  | 'citation_parser_version_mismatch'
  | 'schedule_version_mismatch'
  | 'cadence_mismatch'
  | 'metric_definition_version_mismatch';

const FIELD_REASON: Readonly<Record<keyof MeasurementLaneProtocol, CompatibilityReasonCode>> = {
  frameKind: 'frame_mismatch',
  vertical: 'vertical_mismatch',
  subvertical: 'subvertical_mismatch',
  cohortDefinitionVersion: 'cohort_definition_mismatch',
  querySetId: 'query_set_mismatch',
  querySetVersion: 'query_set_version_mismatch',
  provider: 'provider_mismatch',
  modelId: 'model_mismatch',
  modelSnapshot: 'model_snapshot_mismatch',
  runMode: 'run_mode_mismatch',
  groundingMethod: 'grounding_method_mismatch',
  scannerVersion: 'scanner_version_mismatch',
  checkCatalogVersion: 'check_catalog_version_mismatch',
  promptVersion: 'prompt_version_mismatch',
  citationParserVersion: 'citation_parser_version_mismatch',
  scheduleVersion: 'schedule_version_mismatch',
  cadence: 'cadence_mismatch',
  metricDefinitionVersion: 'metric_definition_version_mismatch',
};

const PROTOCOL_FIELDS = Object.keys(FIELD_REASON) as (keyof MeasurementLaneProtocol)[];

function normalizeProtocolValue(value: string): string {
  return value.trim().toLowerCase() || UNKNOWN_PROTOCOL_VALUE;
}

export function normalizeMeasurementLaneProtocol(
  protocol: MeasurementLaneProtocol
): MeasurementLaneProtocol {
  return Object.fromEntries(
    PROTOCOL_FIELDS.map((field) => [field, normalizeProtocolValue(protocol[field])])
  ) as MeasurementLaneProtocol;
}

export function measurementLaneFingerprint(protocol: MeasurementLaneProtocol): string {
  const normalized = normalizeMeasurementLaneProtocol(protocol);
  const canonical = PROTOCOL_FIELDS.map((field) => `${field}=${normalized[field]}`).join('\n');
  return `${MEASUREMENT_LANE_PROTOCOL_VERSION}:${createHash('sha256').update(canonical).digest('hex')}`;
}

export type MeasurementLaneCompatibility = {
  readonly compatible: boolean;
  readonly comparisonMode: 'same_lane' | 'explicit_cross_model' | 'incompatible';
  readonly reasonCodes: readonly CompatibilityReasonCode[];
  readonly differingFields: readonly (keyof MeasurementLaneProtocol)[];
};

export function evaluateMeasurementLaneCompatibility(
  leftInput: MeasurementLaneProtocol,
  rightInput: MeasurementLaneProtocol,
  options?: { readonly allowCrossModel?: boolean }
): MeasurementLaneCompatibility {
  const left = normalizeMeasurementLaneProtocol(leftInput);
  const right = normalizeMeasurementLaneProtocol(rightInput);
  const unknownFields = PROTOCOL_FIELDS.filter(
    (field) => left[field] === UNKNOWN_PROTOCOL_VALUE || right[field] === UNKNOWN_PROTOCOL_VALUE
  );
  const differingFields = PROTOCOL_FIELDS.filter((field) => left[field] !== right[field]);
  if (unknownFields.length > 0) {
    return {
      compatible: false,
      comparisonMode: 'incompatible',
      reasonCodes: ['unknown_protocol_value'],
      differingFields: [...new Set([...unknownFields, ...differingFields])],
    };
  }

  if (differingFields.length === 0) {
    return {
      compatible: true,
      comparisonMode: 'same_lane',
      reasonCodes: ['compatible'],
      differingFields: [],
    };
  }

  const crossModelFields = new Set<keyof MeasurementLaneProtocol>([
    'provider',
    'modelId',
    'modelSnapshot',
  ]);
  if (
    options?.allowCrossModel === true &&
    differingFields.every((field) => crossModelFields.has(field))
  ) {
    return {
      compatible: true,
      comparisonMode: 'explicit_cross_model',
      reasonCodes: differingFields.map((field) => FIELD_REASON[field]),
      differingFields,
    };
  }

  return {
    compatible: false,
    comparisonMode: 'incompatible',
    reasonCodes: differingFields.map((field) => FIELD_REASON[field]),
    differingFields,
  };
}

export function inferProvider(modelId: string | null | undefined): string {
  const normalized = modelId?.trim().toLowerCase() ?? '';
  if (normalized.startsWith('gpt-') || normalized.includes('openai')) return 'openai';
  if (normalized.startsWith('gemini')) return 'gemini';
  if (normalized.startsWith('claude')) return 'anthropic';
  if (normalized.includes('perplexity') || normalized.includes('sonar')) return 'perplexity';
  return UNKNOWN_PROTOCOL_VALUE;
}
