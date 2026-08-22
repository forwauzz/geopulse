import { describe, expect, it } from 'vitest';
import {
  assessCommercialReadiness,
  benchmarkVerticalAliases,
  canonicalBenchmarkVertical,
} from './commercial-readiness';

describe('commercial intelligence readiness', () => {
  it.each([
    ['MSP / IT services', 'msp_it'],
    ['msp_it_services', 'msp_it'],
    ['managed-service-providers', 'msp_it'],
    ['Marketing / agencies', 'marketing_agencies'],
    ['Healthcare', 'healthcare'],
    [null, 'unknown'],
  ])('normalizes %s without rewriting source evidence', (input, expected) => {
    expect(canonicalBenchmarkVertical(input)).toBe(expected);
  });

  it('expands canonical scheduler filters to legacy source labels', () => {
    expect(benchmarkVerticalAliases('msp_it')).toEqual([
      'msp_it',
      'msp_it_services',
      'MSP / IT services',
      'managed_service_providers',
      'managed_it_services',
    ]);
  });

  it('fails closed when MSP history is large but not comparable', () => {
    const result = assessCommercialReadiness({
      canonicalVertical: 'msp_it',
      cohortDomainCount: 127,
      scheduledDomainCount: 0,
      completedDomainCount: 0,
      eligibleWindowCount: 0,
      ineligibleWindowCount: 0,
      latestEligibleObservedAt: null,
      protocolVariantCount: 0,
      verifiedInterventionCount: 0,
    }, new Date('2026-08-11T12:00:00Z'));

    expect(result.internalEvidence).toBe('available');
    expect(result.aggregateClaims).toBe('blocked');
    expect(result.causalClaims).toBe('blocked');
    expect(result.blockers).toContain('no_completed_comparable_domains');
    expect(result.safeLanguage).toContain('stored MSP cohort');
  });

  it('allows observational aggregate claims only after the cohort contract is met', () => {
    const result = assessCommercialReadiness({
      canonicalVertical: 'msp_it',
      cohortDomainCount: 60,
      scheduledDomainCount: 60,
      completedDomainCount: 55,
      eligibleWindowCount: 220,
      ineligibleWindowCount: 3,
      latestEligibleObservedAt: '2026-08-10T12:00:00Z',
      protocolVariantCount: 1,
      verifiedInterventionCount: 0,
    }, new Date('2026-08-11T12:00:00Z'));

    expect(result.aggregateClaims).toBe('observational_only');
    expect(result.causalClaims).toBe('blocked');
    expect(result.blockers).toEqual([]);
    expect(result.safeLanguage).toContain('observed');
  });

  it('does not infer causation from before-and-after observations', () => {
    const result = assessCommercialReadiness({
      canonicalVertical: 'msp_it',
      cohortDomainCount: 60,
      scheduledDomainCount: 60,
      completedDomainCount: 60,
      eligibleWindowCount: 240,
      ineligibleWindowCount: 0,
      latestEligibleObservedAt: '2026-08-11T10:00:00Z',
      protocolVariantCount: 1,
      verifiedInterventionCount: 12,
    }, new Date('2026-08-11T12:00:00Z'));

    expect(result.causalClaims).toBe('blocked');
    expect(result.safeLanguage).not.toContain('caused');
  });
});
