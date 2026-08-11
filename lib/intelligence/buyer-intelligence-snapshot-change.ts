import type { BuyerIntelligenceSnapshot } from './buyer-intelligence-contract';

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function observationValue(state: BuyerIntelligenceSnapshot['observations'][number]['state']): number | null {
  if (state === 'supported') return 3;
  if (state === 'partial') return 2;
  if (state === 'missing') return 1;
  return null;
}

export function evaluateBuyerIntelligenceChange(
  previous: BuyerIntelligenceSnapshot | null,
  current: Pick<BuyerIntelligenceSnapshot, 'organization' | 'measurement' | 'observations' | 'reportEligibility'>,
  previousSnapshotId: string | null,
): BuyerIntelligenceSnapshot['change'] {
  if (!previous || !previousSnapshotId) return { comparable: false, reasons: ['initial_baseline'], changes: [] };
  const reasons: string[] = [];
  if (previous.organization.identityId !== current.organization.identityId
    || previous.organization.contextVersion !== current.organization.contextVersion) reasons.push('organization_context_changed');
  if (previous.measurement.querySetVersion !== current.measurement.querySetVersion
    || previous.measurement.qualityPolicyVersion !== current.measurement.qualityPolicyVersion
    || previous.measurement.evaluatorVersion !== current.measurement.evaluatorVersion
    || previous.measurement.providerQualityVersion !== current.measurement.providerQualityVersion) reasons.push('measurement_protocol_changed');
  if (previous.reportEligibility.state !== 'eligible' || current.reportEligibility.state !== 'eligible') reasons.push('report_ineligible');
  if (reasons.length > 0) return { comparable: false, reasons: unique(reasons), changes: [] };

  const prior = new Map(previous.observations.map((item) => [item.buyerQuestionKey, item]));
  const changes = [...current.observations]
    .sort((left, right) => left.buyerQuestionKey.localeCompare(right.buyerQuestionKey))
    .map((item) => {
      const previousValue = prior.has(item.buyerQuestionKey) ? observationValue(prior.get(item.buyerQuestionKey)!.state) : null;
      const currentValue = observationValue(item.state);
      const direction = previousValue === null || currentValue === null
        ? 'not_comparable' as const
        : currentValue > previousValue
          ? 'improved' as const
          : currentValue < previousValue
            ? 'regressed' as const
            : 'unchanged' as const;
      return { metricKey: `buyer_question:${item.buyerQuestionKey}`, previousValue, currentValue, direction };
    });
  if (!changes.some((item) => item.direction !== 'not_comparable')) {
    return { comparable: false, reasons: ['no_comparable_observations'], changes: [] };
  }
  return { comparable: true, reasons: [], changes };
}

export function evaluateRecommendationVerification(
  snapshotId: string,
  questionKeys: readonly string[],
  observations: BuyerIntelligenceSnapshot['observations'],
  change: BuyerIntelligenceSnapshot['change'],
): BuyerIntelligenceSnapshot['recommendations'][number]['verification'] {
  if (!change.comparable) {
    if (change.reasons.includes('initial_baseline')) {
      return { ruleVersion: '', kind: 'buyer_question', expectedCondition: '', lastEvaluatedSnapshotId: null, result: 'pending', evidenceIds: [], runIds: [], reason: null };
    }
    return { ruleVersion: '', kind: 'buyer_question', expectedCondition: '', lastEvaluatedSnapshotId: snapshotId, result: 'not_verifiable', evidenceIds: [], runIds: [], reason: change.reasons.join(',') };
  }
  const selected = observations.filter((item) => questionKeys.includes(item.buyerQuestionKey));
  const evidenceIds = unique(selected.flatMap((item) => item.evidenceIds));
  const runIds = unique(selected.flatMap((item) => item.runIds));
  const directions = questionKeys.map((key) =>
    change.changes.find((item) => item.metricKey === `buyer_question:${key}`)?.direction ?? 'not_comparable');
  if (evidenceIds.length === 0 || runIds.length === 0 || directions.includes('not_comparable')) {
    return { ruleVersion: '', kind: 'buyer_question', expectedCondition: '', lastEvaluatedSnapshotId: snapshotId, result: 'not_verifiable', evidenceIds: [], runIds: [], reason: 'eligible_verification_evidence_unavailable' };
  }
  const result = directions.includes('regressed')
    ? 'verified_regressed' as const
    : directions.includes('improved')
      ? 'verified_improved' as const
      : 'verified_unchanged' as const;
  return { ruleVersion: '', kind: 'buyer_question', expectedCondition: '', lastEvaluatedSnapshotId: snapshotId, result, evidenceIds, runIds, reason: null };
}
