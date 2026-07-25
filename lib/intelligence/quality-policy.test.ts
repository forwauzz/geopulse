import { describe, expect, it } from 'vitest';
import { assessMeasurementWindow, classifyRunQuality } from './quality-policy';

const now = new Date('2026-07-25T12:00:00Z');
const base = {
  sourceKind: 'benchmark_query_run',
  sourceId: 'run-1',
  sourceStatus: 'completed',
  startedAt: '2026-07-25T11:00:00Z',
  completedAt: '2026-07-25T11:01:00Z',
  responsePresent: true,
  providerErrorPresent: false,
  citationCount: 0,
  invalidCitationCount: 0,
  parentPresent: true,
  protocolComplete: true,
  duplicate: false,
} as const;

describe('quality policy', () => {
  it('distinguishes provider failures from valid zero-citation outcomes', () => {
    expect(classifyRunQuality(base, now)).toMatchObject({
      state: 'valid', reasonCodes: ['completed_zero_citations'],
    });
    expect(classifyRunQuality({ ...base, providerErrorPresent: true }, now)).toMatchObject({
      state: 'provider_failure', reasonCodes: ['provider_error'],
    });
  });

  it('surfaces stale running work without changing its source status', () => {
    const result = classifyRunQuality({
      ...base, sourceStatus: 'running', startedAt: '2026-07-01T00:00:00Z', responsePresent: false,
    }, now);
    expect(result.state).toBe('incomplete');
    expect(result.reasonCodes).toContain('stale_running');
    expect(result.ageHours).toBeGreaterThan(500);
  });

  it('honors an audited quarantine independently of source status', () => {
    expect(classifyRunQuality({ ...base, quarantined: true }, now)).toMatchObject({
      state: 'quarantined', reasonCodes: ['operator_quarantine'],
    });
  });

  it('blocks incomplete grounded/ungrounded pairs', () => {
    const assessment = assessMeasurementWindow([
      { queryId: 'q1', modelId: 'm1', runMode: 'grounded', qualityState: 'valid', citationCount: 1 },
    ], ['grounded', 'ungrounded']);
    expect(assessment.eligible).toBe(false);
    expect(assessment.missingCells).toEqual(['q1:m1:ungrounded']);
  });

  it('requires validation for an all-zero cohort or sharp discontinuity', () => {
    const runs = ['q1', 'q2', 'q3'].map((queryId) => ({
      queryId, modelId: 'm1', runMode: 'grounded', qualityState: 'valid' as const, citationCount: 0,
    }));
    expect(assessMeasurementWindow(runs, ['grounded'], 1)).toMatchObject({
      eligible: false,
      anomalyCodes: ['whole_cohort_all_zero', 'citation_rate_discontinuity'],
    });
  });
});
