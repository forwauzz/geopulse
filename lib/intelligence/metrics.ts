export const METRIC_DICTIONARY_VERSION = 'intelligence-metrics-v1';

export type MetricAvailability = 'available' | 'not_available';

export type RatioMetric = {
  readonly status: MetricAvailability;
  readonly value: number | null;
  readonly numerator: number;
  readonly denominator: number;
  readonly sampleSize: number;
  readonly uncertaintyLow: number | null;
  readonly uncertaintyHigh: number | null;
  readonly reason: string | null;
};

export function ratioMetric(numerator: number, denominator: number): RatioMetric {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator < 0 ||
    denominator <= 0 ||
    numerator > denominator
  ) {
    return {
      status: 'not_available', value: null, numerator, denominator,
      sampleSize: Math.max(0, denominator), uncertaintyLow: null,
      uncertaintyHigh: null, reason: denominator <= 0 ? 'insufficient_sample' : 'invalid_counts',
    };
  }
  const value = numerator / denominator;
  const z = 1.96;
  const adjusted = 1 + z * z / denominator;
  const centre = (value + z * z / (2 * denominator)) / adjusted;
  const spread = z * Math.sqrt(
    (value * (1 - value) / denominator) + (z * z / (4 * denominator * denominator))
  ) / adjusted;
  return {
    status: 'available', value, numerator, denominator, sampleSize: denominator,
    uncertaintyLow: Math.max(0, centre - spread),
    uncertaintyHigh: Math.min(1, centre + spread),
    reason: null,
  };
}

export type ComparisonCompatibility = {
  readonly compatible: boolean;
  readonly label: 'exact' | 'explicit_cross_lane_override' | 'incompatible';
  readonly reason: string | null;
};

export function compareMeasurementContracts(
  before: { laneId: string | null; versions: Readonly<Record<string, string | null>> },
  after: { laneId: string | null; versions: Readonly<Record<string, string | null>> },
  allowCrossLane = false
): ComparisonCompatibility {
  const sameVersions = JSON.stringify(Object.entries(before.versions).sort()) ===
    JSON.stringify(Object.entries(after.versions).sort());
  const sameLane = Boolean(before.laneId && before.laneId === after.laneId);
  if (sameLane && sameVersions) return { compatible: true, label: 'exact', reason: null };
  if (allowCrossLane) {
    return {
      compatible: true,
      label: 'explicit_cross_lane_override',
      reason: sameVersions ? 'lane_mismatch' : 'version_mismatch',
    };
  }
  return {
    compatible: false, label: 'incompatible',
    reason: sameVersions ? 'lane_mismatch' : 'version_mismatch',
  };
}

export function uniqueDomainCohort<T extends { domainId: string }>(
  rows: readonly T[]
): readonly T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (!result.has(row.domainId)) result.set(row.domainId, row);
  }
  return [...result.values()];
}
