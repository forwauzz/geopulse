import { describe, expect, it } from 'vitest';
import {
  isRepairableStaleBenchmarkAlert,
  observationalConfidence,
  parseMeasurementWindowIdentity,
  selectSupersedingHealthyAssessment,
} from './intelligence-learning-loop';

describe('governed intelligence learning loop', () => {
  it('bounds observational confidence below certainty', () => {
    expect(observationalConfidence(1)).toBe(0.1);
    expect(observationalConfidence(25)).toBe(0.5);
    expect(observationalConfidence(10_000)).toBe(0.9);
  });

  it('repairs only stale benchmark group lifecycles deterministically', () => {
    expect(isRepairableStaleBenchmarkAlert({
      reasonCode: 'stale_running',
      sourceKind: 'benchmark_run_group',
      sourceId: 'run-1',
    })).toBe(true);
    expect(isRepairableStaleBenchmarkAlert({
      reasonCode: 'citation_rate_discontinuity',
      sourceKind: 'benchmark_measurement_window',
      sourceId: 'window-1',
    })).toBe(false);
    expect(isRepairableStaleBenchmarkAlert({
      reasonCode: 'stale_running',
      sourceKind: 'benchmark_query_run',
      sourceId: 'query-1',
    })).toBe(false);
  });

  it('parses scheduled and legacy measurement identities from the stable suffix', () => {
    expect(parseMeasurementWindowIdentity(
      '2026-07-22T12:domain-1:query-set-1:gpt-4o-mini',
    )).toEqual({
      windowKey: '2026-07-22T12',
      domainId: 'domain-1',
      querySetId: 'query-set-1',
      modelId: 'gpt-4o-mini',
    });
    expect(parseMeasurementWindowIdentity(
      'legacy:run-1:domain-1:query-set-1:gemini-2.5-flash-lite',
    )?.windowKey).toBe('legacy:run-1');
  });

  it('closes an old anomaly only when a newer healthy window covers the same lane', () => {
    const source = '2026-07-21T12:domain-1:query-set-1:gemini-2.5-flash-lite';
    expect(selectSupersedingHealthyAssessment(source, [
      {
        id: 'wrong-domain',
        source_id: '2026-07-25T00:domain-2:query-set-1:gpt-4o-mini',
        eligible: true,
        anomaly_codes: [],
      },
      {
        id: 'still-anomalous',
        source_id: '2026-07-26T00:domain-1:query-set-1:gpt-4o-mini',
        eligible: true,
        anomaly_codes: ['whole_cohort_all_zero'],
      },
      {
        id: 'replacement',
        source_id: '2026-07-25T00:domain-1:query-set-1:gpt-4o-mini',
        eligible: true,
        anomaly_codes: [],
        coverage_ratio: 1,
      },
    ])?.id).toBe('replacement');
  });

  it('allows a healthy scheduled window to supersede a legacy measurement', () => {
    const source = 'legacy:run-1:domain-1:query-set-1:gemini-2.5-flash-lite';
    expect(selectSupersedingHealthyAssessment(source, [{
      id: 'replacement',
      source_id: '2026-07-25T00:domain-1:query-set-1:gpt-4o-mini',
      eligible: true,
      anomaly_codes: [],
    }])?.id).toBe('replacement');
  });
});
