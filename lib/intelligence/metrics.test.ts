import { describe, expect, it } from 'vitest';
import { compareMeasurementContracts, ratioMetric, uniqueDomainCohort } from './metrics';

describe('deterministic intelligence metrics', () => {
  it('reconciles ratios to their qualifying raw counts and uncertainty', () => {
    const metric = ratioMetric(3, 4);
    expect(metric).toMatchObject({
      status: 'available', value: 0.75, numerator: 3, denominator: 4, sampleSize: 4,
    });
    expect(metric.uncertaintyLow).toBeLessThan(0.75);
    expect(metric.uncertaintyHigh).toBeGreaterThan(0.75);
  });

  it('returns not_available instead of a misleading zero for empty samples', () => {
    expect(ratioMetric(0, 0)).toEqual({
      status: 'not_available', value: null, numerator: 0, denominator: 0,
      sampleSize: 0, uncertaintyLow: null, uncertaintyHigh: null,
      reason: 'insufficient_sample',
    });
  });

  it('requires exact lane/version compatibility unless explicitly overridden', () => {
    const before = { laneId: 'lane-a', versions: { parser: 'v1' } };
    expect(compareMeasurementContracts(before, before)).toMatchObject({
      compatible: true, label: 'exact',
    });
    expect(compareMeasurementContracts(before, {
      laneId: 'lane-b', versions: { parser: 'v2' },
    })).toMatchObject({ compatible: false, label: 'incompatible' });
    expect(compareMeasurementContracts(before, {
      laneId: 'lane-b', versions: { parser: 'v2' },
    }, true)).toMatchObject({ compatible: true, label: 'explicit_cross_lane_override' });
  });

  it('does not let repeated scans inflate unique-domain cohort samples', () => {
    expect(uniqueDomainCohort([
      { domainId: 'a', scan: '1' }, { domainId: 'a', scan: '2' }, { domainId: 'b', scan: '3' },
    ])).toHaveLength(2);
  });
});
