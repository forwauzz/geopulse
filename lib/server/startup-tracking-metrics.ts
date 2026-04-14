import type { StartupDashboardData } from './startup-dashboard-data';

export type MetricPoint = {
  readonly label: string;
  readonly value: number;
};

export type StartupTrackingMetrics = {
  readonly burnDown: MetricPoint[];
  readonly funnel: {
    readonly suggested: number;
    readonly approved: number;
    readonly inProgress: number;
    readonly shipped: number;
    readonly validated: number;
    readonly failed: number;
  };
  readonly impactWindows: {
    readonly d7: number | null;
    readonly d14: number | null;
    readonly d30: number | null;
  };
  readonly executionHistory: {
    readonly total: number;
    readonly planReady: number;
    readonly completed: number;
    readonly waitingManual: number;
    readonly failed: number;
  };
  readonly benchmarkOutcomeSummary: MetricPoint[];
};

function toIsoDay(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function toDayLabel(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function buildStartupTrackingMetrics(data: StartupDashboardData): StartupTrackingMetrics {
  const events = new Map<string, number>();
  if (data.recommendations.length > 0) {
    for (const recommendation of data.recommendations) {
      const createdDay = toIsoDay(recommendation.createdAt);
      events.set(createdDay, (events.get(createdDay) ?? 0) + 1);
      if (recommendation.status === 'shipped' || recommendation.status === 'validated' || recommendation.status === 'failed') {
        const closedDay = toIsoDay(recommendation.statusChangedAt);
        events.set(closedDay, (events.get(closedDay) ?? 0) - 1);
      }
    }
  } else {
    for (const scan of data.scans) {
      const day = toIsoDay(scan.createdAt);
      events.set(day, (events.get(day) ?? 0) + 1);
    }
    for (const report of data.reports) {
      const day = toIsoDay(report.createdAt);
      events.set(day, (events.get(day) ?? 0) - 1);
    }
  }

  const burnDown = Array.from(events.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce(
      (acc, [day, delta]) => {
        const prev = acc.length > 0 ? acc[acc.length - 1]?.value ?? 0 : 0;
        acc.push({ label: toDayLabel(day), value: Math.max(prev + delta, 0) });
        return acc;
      },
      [] as MetricPoint[]
    );

  const hasRecommendations = data.recommendations.length > 0;
  const suggested = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'suggested').length
    : data.scans.length;
  const approved = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'approved').length
    : data.reports.length;
  const inProgress = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'in_progress').length
    : Math.max(approved - data.reports.filter((report) => !!report.emailDeliveredAt).length, 0);
  const shipped = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'shipped').length
    : 0;
  const validated = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'validated').length
    : data.reports.filter((report) => !!report.emailDeliveredAt).length;
  const failed = hasRecommendations
    ? data.recommendations.filter((item) => item.status === 'failed').length
    : 0;

  const now = Date.now();
  const scored = data.scans.filter((scan): scan is typeof scan & { score: number } => typeof scan.score === 'number');

  function averageWithinDays(days: number): number | null {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const bucket = scored.filter((scan) => new Date(scan.createdAt).getTime() >= cutoff);
    if (bucket.length === 0) return null;
    return Math.round(bucket.reduce((sum, scan) => sum + scan.score, 0) / bucket.length);
  }

  const executionHistory = {
    total: data.executions.length,
    planReady: data.executions.filter((execution) => execution.status === 'plan_ready').length,
    completed: data.executions.filter((execution) => execution.status === 'completed').length,
    waitingManual: data.executions.filter((execution) => execution.status === 'waiting_manual').length,
    failed: data.executions.filter((execution) => execution.status === 'failed').length,
  };

  const benchmarkOutcomeSummary: MetricPoint[] = [
    {
      label: 'In flight',
      value: data.executions.filter((execution) =>
        execution.status === 'received' ||
        execution.status === 'planning' ||
        execution.status === 'plan_ready' ||
        execution.status === 'executing'
      ).length,
    },
    {
      label: 'Blocked manual',
      value: data.executions.filter((execution) => execution.status === 'waiting_manual').length,
    },
    {
      label: 'Completed',
      value: data.executions.filter((execution) => execution.status === 'completed').length,
    },
    {
      label: 'Failed',
      value: data.executions.filter((execution) => execution.status === 'failed').length,
    },
    {
      label: 'Cancelled',
      value: data.executions.filter((execution) => execution.status === 'cancelled').length,
    },
  ];

  return {
    burnDown,
    funnel: {
      suggested,
      approved,
      inProgress,
      shipped,
      validated,
      failed,
    },
    impactWindows: {
      d7: averageWithinDays(7),
      d14: averageWithinDays(14),
      d30: averageWithinDays(30),
    },
    executionHistory,
    benchmarkOutcomeSummary,
  };
}
