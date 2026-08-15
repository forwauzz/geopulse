export const COMMERCIAL_READINESS_POLICY_VERSION = 'commercial-readiness-v1';
export const MIN_COMPARABLE_DOMAINS = 50;
export const MIN_ELIGIBLE_WINDOWS_PER_DOMAIN = 4;
export const MAX_EVIDENCE_AGE_HOURS = 72;

export type CanonicalBenchmarkVertical =
  | 'msp_it'
  | 'marketing_agencies'
  | 'law_firms'
  | 'healthcare'
  | 'tech_startups'
  | 'unknown';

export type CommercialReadinessInput = {
  readonly canonicalVertical: CanonicalBenchmarkVertical;
  readonly cohortDomainCount: number;
  readonly scheduledDomainCount: number;
  readonly completedDomainCount: number;
  readonly eligibleWindowCount: number;
  readonly ineligibleWindowCount: number;
  readonly latestEligibleObservedAt: string | null;
  readonly protocolVariantCount: number;
  readonly verifiedInterventionCount: number;
};

export type CommercialReadinessBlocker =
  | 'cohort_below_minimum'
  | 'schedule_below_minimum'
  | 'no_completed_comparable_domains'
  | 'completed_cohort_below_minimum'
  | 'insufficient_repeated_windows'
  | 'evidence_stale_or_missing'
  | 'mixed_protocol_variants';

export type CommercialReadiness = {
  readonly policyVersion: typeof COMMERCIAL_READINESS_POLICY_VERSION;
  readonly internalEvidence: 'available' | 'not_available';
  readonly aggregateClaims: 'blocked' | 'observational_only';
  readonly causalClaims: 'blocked';
  readonly freshnessHours: number | null;
  readonly blockers: readonly CommercialReadinessBlocker[];
  readonly safeLanguage: string;
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Maps legacy labels for comparison only. It never mutates the source row. */
export function canonicalBenchmarkVertical(value: string | null | undefined): CanonicalBenchmarkVertical {
  const normalized = slug(value ?? '');
  if (['msp_it', 'msp_it_services', 'managed_service_providers', 'managed_it_services'].includes(normalized)) {
    return 'msp_it';
  }
  if (['marketing_agencies', 'marketing_agency', 'marketing_firms'].includes(normalized)) {
    return 'marketing_agencies';
  }
  if (['law_firms', 'law_firm', 'legal_services'].includes(normalized)) return 'law_firms';
  if (['healthcare', 'health_care', 'digital_health'].includes(normalized)) return 'healthcare';
  if (['tech_startups', 'technology_startups', 'startups'].includes(normalized)) return 'tech_startups';
  return 'unknown';
}

export function benchmarkVerticalAliases(value: string): readonly string[] {
  const canonical = canonicalBenchmarkVertical(value);
  const aliases: Record<CanonicalBenchmarkVertical, readonly string[]> = {
    msp_it: [
      'msp_it',
      'msp_it_services',
      'MSP / IT services',
      'managed_service_providers',
      'managed_it_services',
    ],
    marketing_agencies: [
      'marketing_agencies',
      'marketing_agency',
      'Marketing / agencies',
      'marketing_firms',
    ],
    law_firms: ['law_firms', 'Law firms', 'legal_services'],
    healthcare: ['healthcare', 'Healthcare', 'digital_health'],
    tech_startups: ['tech_startups', 'Tech startups', 'technology_startups'],
    unknown: [value],
  };
  return aliases[canonical];
}

function freshnessHours(observedAt: string | null, now: Date): number | null {
  if (!observedAt) return null;
  const milliseconds = now.getTime() - new Date(observedAt).getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds / 3_600_000) : null;
}

export function assessCommercialReadiness(
  input: CommercialReadinessInput,
  now = new Date()
): CommercialReadiness {
  const blockers: CommercialReadinessBlocker[] = [];
  const freshness = freshnessHours(input.latestEligibleObservedAt, now);
  if (input.cohortDomainCount < MIN_COMPARABLE_DOMAINS) blockers.push('cohort_below_minimum');
  if (input.scheduledDomainCount < MIN_COMPARABLE_DOMAINS) blockers.push('schedule_below_minimum');
  if (input.completedDomainCount === 0) blockers.push('no_completed_comparable_domains');
  else if (input.completedDomainCount < MIN_COMPARABLE_DOMAINS) blockers.push('completed_cohort_below_minimum');
  if (input.eligibleWindowCount < input.completedDomainCount * MIN_ELIGIBLE_WINDOWS_PER_DOMAIN) {
    blockers.push('insufficient_repeated_windows');
  }
  if (freshness === null || freshness > MAX_EVIDENCE_AGE_HOURS) blockers.push('evidence_stale_or_missing');
  if (input.protocolVariantCount !== 1) blockers.push('mixed_protocol_variants');

  const aggregateReady = blockers.length === 0;
  return {
    policyVersion: COMMERCIAL_READINESS_POLICY_VERSION,
    internalEvidence: input.cohortDomainCount > 0 || input.completedDomainCount > 0
      ? 'available'
      : 'not_available',
    aggregateClaims: aggregateReady ? 'observational_only' : 'blocked',
    causalClaims: 'blocked',
    freshnessHours: freshness,
    blockers,
    safeLanguage: aggregateReady
      ? `Across ${input.completedDomainCount} comparable businesses, GEO-Pulse observed this pattern under one versioned measurement protocol. This is observational evidence, not proof of causation.`
      : `GEO-Pulse has a stored MSP cohort and internal run history, but comparable aggregate MSP claims remain blocked until the listed evidence gates pass.`,
  };
}
