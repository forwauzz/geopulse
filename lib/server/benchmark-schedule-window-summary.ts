import type { BenchmarkRunMode } from './benchmark-grounding';
import type { BenchmarkRunListRow } from './benchmark-admin-data';

export type BenchmarkScheduleWindowDomainSummary = {
  readonly domainId: string;
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly ungroundedRunGroupId: string | null;
  readonly groundedRunGroupId: string | null;
  readonly ungroundedCitationRate: number | null;
  readonly groundedCitationRate: number | null;
  readonly ungroundedQueryCoverage: number | null;
  readonly groundedQueryCoverage: number | null;
  readonly groundedShareOfVoice: number | null;
  readonly groundedExactPageQualityRate: number | null;
};

export type BenchmarkScheduleWindowSummary = {
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowDate: string;
  readonly domainCount: number;
  readonly pairedDomainCount: number;
  readonly domains: readonly BenchmarkScheduleWindowDomainSummary[];
};

export type BenchmarkScheduleWindowOutlier = {
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly deltaCitationRate: number;
  readonly ungroundedCitationRate: number | null;
  readonly groundedCitationRate: number | null;
  readonly groundedExactPageQualityRate: number | null;
  readonly ungroundedRunGroupId: string | null;
  readonly groundedRunGroupId: string | null;
};

export type BenchmarkScheduleMultiWindowDomainSummary = {
  readonly canonicalDomain: string;
  readonly siteUrl: string | null;
  readonly pairedWindowCount: number;
  readonly positiveDeltaWindowCount: number;
  readonly negativeDeltaWindowCount: number;
  readonly zeroDeltaWindowCount: number;
  readonly averageDeltaCitationRate: number;
  readonly averageUngroundedCitationRate: number;
  readonly averageGroundedCitationRate: number;
  readonly nonZeroExactPageWindowCount: number;
};

export type BenchmarkScheduleMultiWindowSummary = {
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowDates: readonly string[];
  readonly windowCount: number;
  readonly pairedDomainCount: number;
  readonly domains: readonly BenchmarkScheduleMultiWindowDomainSummary[];
};

function readText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readRunMode(row: BenchmarkRunListRow): BenchmarkRunMode | null {
  const value = readText(row.metadata, 'run_mode');
  return value === 'ungrounded_inference' || value === 'grounded_site' ? value : null;
}

export function buildBenchmarkScheduleWindowSummary(args: {
  readonly runs: readonly BenchmarkRunListRow[];
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowDate: string;
}): BenchmarkScheduleWindowSummary {
  const filtered = args.runs.filter((row) => {
    if (row.query_set_id !== args.querySetId) return false;
    if (row.model_set_version !== args.modelId) return false;
    if (row.run_scope !== 'scheduled_internal_benchmark') return false;
    if (readText(row.metadata, 'schedule_version') !== args.scheduleVersion) return false;
    if (readText(row.metadata, 'schedule_window_utc') !== args.windowDate) return false;
    return readRunMode(row) !== null;
  });

  const byDomain = new Map<string, BenchmarkScheduleWindowDomainSummary>();
  for (const row of filtered) {
    const existing = byDomain.get(row.domain_id) ?? {
      domainId: row.domain_id,
      canonicalDomain: row.canonical_domain,
      siteUrl: row.site_url,
      ungroundedRunGroupId: null,
      groundedRunGroupId: null,
      ungroundedCitationRate: null,
      groundedCitationRate: null,
      ungroundedQueryCoverage: null,
      groundedQueryCoverage: null,
      groundedShareOfVoice: null,
      groundedExactPageQualityRate: null,
    };

    const runMode = readRunMode(row);
    if (runMode === 'ungrounded_inference') {
      byDomain.set(row.domain_id, {
        ...existing,
        ungroundedRunGroupId: row.id,
        ungroundedCitationRate: row.citation_rate,
        ungroundedQueryCoverage: row.query_coverage,
      });
      continue;
    }

    if (runMode === 'grounded_site') {
      byDomain.set(row.domain_id, {
        ...existing,
        groundedRunGroupId: row.id,
        groundedCitationRate: row.citation_rate,
        groundedQueryCoverage: row.query_coverage,
        groundedShareOfVoice: row.share_of_voice,
        groundedExactPageQualityRate: readNumber(row.metadata, 'exact_page_quality_rate'),
      });
    }
  }

  const domains = Array.from(byDomain.values()).sort((left, right) =>
    left.canonicalDomain.localeCompare(right.canonicalDomain)
  );
  const pairedDomainCount = domains.filter(
    (domain) => domain.ungroundedRunGroupId !== null && domain.groundedRunGroupId !== null
  ).length;

  return {
    querySetId: args.querySetId,
    modelId: args.modelId,
    scheduleVersion: args.scheduleVersion,
    windowDate: args.windowDate,
    domainCount: domains.length,
    pairedDomainCount,
    domains,
  };
}

export function selectBenchmarkScheduleWindowOutliers(
  summary: BenchmarkScheduleWindowSummary,
  limit = 5
): {
  readonly winners: readonly BenchmarkScheduleWindowOutlier[];
  readonly losers: readonly BenchmarkScheduleWindowOutlier[];
} {
  const scored = summary.domains
    .filter(
      (domain) =>
        typeof domain.ungroundedCitationRate === 'number' &&
        typeof domain.groundedCitationRate === 'number'
    )
    .map((domain) => ({
      canonicalDomain: domain.canonicalDomain,
      siteUrl: domain.siteUrl,
      deltaCitationRate: (domain.groundedCitationRate ?? 0) - (domain.ungroundedCitationRate ?? 0),
      ungroundedCitationRate: domain.ungroundedCitationRate,
      groundedCitationRate: domain.groundedCitationRate,
      groundedExactPageQualityRate: domain.groundedExactPageQualityRate,
      ungroundedRunGroupId: domain.ungroundedRunGroupId,
      groundedRunGroupId: domain.groundedRunGroupId,
    }));

  const winners = [...scored]
    .sort((left, right) => {
      if (right.deltaCitationRate !== left.deltaCitationRate) {
        return right.deltaCitationRate - left.deltaCitationRate;
      }
      return left.canonicalDomain.localeCompare(right.canonicalDomain);
    })
    .slice(0, limit);

  const losers = [...scored]
    .sort((left, right) => {
      if (left.deltaCitationRate !== right.deltaCitationRate) {
        return left.deltaCitationRate - right.deltaCitationRate;
      }
      return left.canonicalDomain.localeCompare(right.canonicalDomain);
    })
    .slice(0, limit);

  return { winners, losers };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildBenchmarkScheduleMultiWindowSummary(args: {
  readonly runs: readonly BenchmarkRunListRow[];
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowDates: readonly string[];
}): BenchmarkScheduleMultiWindowSummary {
  const windowDates = Array.from(
    new Set(args.windowDates.map((value) => value.trim()).filter((value) => value.length > 0))
  );
  const windowSummaries = windowDates.map((windowDate) =>
    buildBenchmarkScheduleWindowSummary({
      runs: args.runs,
      querySetId: args.querySetId,
      modelId: args.modelId,
      scheduleVersion: args.scheduleVersion,
      windowDate,
    })
  );
  const byDomain = new Map<
    string,
    {
      canonicalDomain: string;
      siteUrl: string | null;
      deltas: number[];
      ungroundedRates: number[];
      groundedRates: number[];
      nonZeroExactPageWindowCount: number;
    }
  >();

  for (const summary of windowSummaries) {
    for (const domain of summary.domains) {
      if (
        typeof domain.ungroundedCitationRate !== 'number' ||
        typeof domain.groundedCitationRate !== 'number'
      ) {
        continue;
      }

      const existing = byDomain.get(domain.domainId) ?? {
        canonicalDomain: domain.canonicalDomain,
        siteUrl: domain.siteUrl,
        deltas: [],
        ungroundedRates: [],
        groundedRates: [],
        nonZeroExactPageWindowCount: 0,
      };

      existing.deltas.push(domain.groundedCitationRate - domain.ungroundedCitationRate);
      existing.ungroundedRates.push(domain.ungroundedCitationRate);
      existing.groundedRates.push(domain.groundedCitationRate);
      if ((domain.groundedExactPageQualityRate ?? 0) > 0) {
        existing.nonZeroExactPageWindowCount += 1;
      }

      byDomain.set(domain.domainId, existing);
    }
  }

  const domains = Array.from(byDomain.values())
    .map((domain) => ({
      canonicalDomain: domain.canonicalDomain,
      siteUrl: domain.siteUrl,
      pairedWindowCount: domain.deltas.length,
      positiveDeltaWindowCount: domain.deltas.filter((value) => value > 0).length,
      negativeDeltaWindowCount: domain.deltas.filter((value) => value < 0).length,
      zeroDeltaWindowCount: domain.deltas.filter((value) => value === 0).length,
      averageDeltaCitationRate: average(domain.deltas),
      averageUngroundedCitationRate: average(domain.ungroundedRates),
      averageGroundedCitationRate: average(domain.groundedRates),
      nonZeroExactPageWindowCount: domain.nonZeroExactPageWindowCount,
    }))
    .sort((left, right) => {
      if (right.averageDeltaCitationRate !== left.averageDeltaCitationRate) {
        return right.averageDeltaCitationRate - left.averageDeltaCitationRate;
      }
      return left.canonicalDomain.localeCompare(right.canonicalDomain);
    });

  return {
    querySetId: args.querySetId,
    modelId: args.modelId,
    scheduleVersion: args.scheduleVersion,
    windowDates,
    windowCount: windowDates.length,
    pairedDomainCount: domains.length,
    domains,
  };
}
