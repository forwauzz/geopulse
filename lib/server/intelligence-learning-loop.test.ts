import { describe, expect, it } from 'vitest';
import {
  isRepairableStaleBenchmarkAlert,
  observationalConfidence,
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
});
