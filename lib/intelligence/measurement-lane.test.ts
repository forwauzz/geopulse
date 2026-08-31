import { describe, expect, it } from 'vitest';
import {
  NOT_APPLICABLE_PROTOCOL_VALUE,
  UNKNOWN_PROTOCOL_VALUE,
  aggregateMeasurementWindowCoverage,
  batchMeasurementLaneFingerprints,
  evaluateMeasurementLaneCompatibility,
  inferProvider,
  measurementLaneFingerprint,
  normalizeMeasurementWindowTimestamp,
  type MeasurementLaneProtocol,
} from './measurement-lane';

const base: MeasurementLaneProtocol = {
  frameKind: 'business_counsel',
  vertical: 'law_firms',
  subvertical: 'business_counsel',
  cohortDefinitionVersion: 'law-business-counsel-v1',
  querySetId: 'query-set-1',
  querySetVersion: 'v1',
  provider: 'openai',
  modelId: 'gpt-4o-mini',
  modelSnapshot: 'gpt-4o-mini',
  runMode: 'ungrounded_inference',
  groundingMethod: NOT_APPLICABLE_PROTOCOL_VALUE,
  scannerVersion: NOT_APPLICABLE_PROTOCOL_VALUE,
  checkCatalogVersion: NOT_APPLICABLE_PROTOCOL_VALUE,
  promptVersion: 'benchmark-prompt-v1',
  citationParserVersion: 'benchmark-citation-v1',
  scheduleVersion: 'v1',
  cadence: '12h',
  metricDefinitionVersion: 'benchmark-metrics-v1',
};

describe('measurement lane protocol', () => {
  it('batches large fingerprint lookups without dropping or reordering values', () => {
    const fingerprints = Array.from({ length: 61 }, (_, index) => `fingerprint-${index}`);
    const batches = batchMeasurementLaneFingerprints(fingerprints, 25);

    expect(batches.map((batch) => batch.length)).toEqual([25, 25, 11]);
    expect(batches.flat()).toEqual(fingerprints);
  });

  it('creates the same fingerprint regardless of casing and whitespace', () => {
    expect(measurementLaneFingerprint(base)).toBe(
      measurementLaneFingerprint({ ...base, vertical: ' LAW_FIRMS ' })
    );
  });

  it.each([
    ['querySetVersion', 'v2'],
    ['runMode', 'grounded_site'],
    ['citationParserVersion', 'benchmark-citation-v2'],
    ['metricDefinitionVersion', 'benchmark-metrics-v2'],
    ['frameKind', 'broad_vertical'],
  ] as const)('changes the lane for %s', (field, value) => {
    expect(measurementLaneFingerprint({ ...base, [field]: value })).not.toBe(
      measurementLaneFingerprint(base)
    );
  });

  it('keeps Gemini and GPT incompatible by default', () => {
    const gemini = { ...base, provider: 'gemini', modelId: 'gemini-2.5-flash-lite', modelSnapshot: 'gemini-2.5-flash-lite' };
    expect(evaluateMeasurementLaneCompatibility(base, gemini)).toMatchObject({
      compatible: false,
      reasonCodes: ['provider_mismatch', 'model_mismatch', 'model_snapshot_mismatch'],
    });
  });

  it('permits an explicit cross-model analysis without calling it a same-lane comparison', () => {
    const gemini = { ...base, provider: 'gemini', modelId: 'gemini-2.5-flash-lite', modelSnapshot: 'gemini-2.5-flash-lite' };
    expect(evaluateMeasurementLaneCompatibility(base, gemini, { allowCrossModel: true })).toMatchObject({
      compatible: true,
      comparisonMode: 'explicit_cross_model',
    });
  });

  it('never treats unknown history as compatible', () => {
    expect(evaluateMeasurementLaneCompatibility(
      { ...base, promptVersion: UNKNOWN_PROTOCOL_VALUE },
      { ...base, promptVersion: UNKNOWN_PROTOCOL_VALUE }
    )).toMatchObject({
      compatible: false,
      reasonCodes: ['unknown_protocol_value'],
    });
  });

  it('returns machine-readable mismatch reasons', () => {
    expect(evaluateMeasurementLaneCompatibility(base, {
      ...base,
      frameKind: 'broad_vertical',
      subvertical: 'all',
    })).toEqual({
      compatible: false,
      comparisonMode: 'incompatible',
      reasonCodes: ['frame_mismatch', 'subvertical_mismatch'],
      differingFields: ['frameKind', 'subvertical'],
    });
  });

  it.each([
    ['gpt-4o-mini', 'openai'],
    ['gemini-2.5-flash-lite', 'gemini'],
    ['claude-haiku-4-5', 'anthropic'],
    ['sonar-small', 'perplexity'],
    ['custom', 'unknown'],
  ])('infers provider for %s', (model, provider) => {
    expect(inferProvider(model)).toBe(provider);
  });

  it('normalizes legacy UTC hour keys without guessing a local timezone', () => {
    expect(normalizeMeasurementWindowTimestamp('2026-07-11T12')).toBe(
      '2026-07-11T12:00:00.000Z'
    );
    expect(normalizeMeasurementWindowTimestamp('not-a-time')).toBeNull();
  });

  it('aggregates duplicate lane/window run groups instead of choosing one', () => {
    expect(aggregateMeasurementWindowCoverage([
      { expected: 10, observed: 10, qualityState: 'complete' },
      { expected: 10, observed: 5, qualityState: 'partial' },
    ])).toEqual({ expected: 20, observed: 15, qualityState: 'partial' });
  });
});
