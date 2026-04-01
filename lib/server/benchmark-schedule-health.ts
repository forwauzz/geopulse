import type { BenchmarkRunListRow } from './benchmark-admin-data';
import {
  buildBenchmarkScheduleWindowSummary,
  type BenchmarkScheduleWindowSummary,
} from './benchmark-schedule-window-summary';

export type BenchmarkScheduleHealthWindow = {
  readonly windowDate: string;
  readonly domainCount: number;
  readonly pairedDomainCount: number;
  readonly runCount: number;
  readonly triggerSources: readonly string[];
  readonly statuses: readonly string[];
  readonly latestCreatedAt: string | null;
  readonly missing: boolean;
};

export type BenchmarkScheduleHealthSummary = {
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowHours: number;
  readonly windowDates: readonly string[];
  readonly windows: readonly BenchmarkScheduleHealthWindow[];
};

function stepWindowDate(windowDate: string, windowHours: number): string {
  const iso =
    windowDate.length === 10 ? `${windowDate}T00:00:00.000Z` : `${windowDate}:00:00.000Z`;
  const date = new Date(iso);
  date.setUTCHours(date.getUTCHours() - windowHours);
  if (windowHours >= 24) {
    return date.toISOString().slice(0, 10);
  }

  return `${date.toISOString().slice(0, 10)}T${String(date.getUTCHours()).padStart(2, '0')}`;
}

export function buildRecentBenchmarkWindowDates(args: {
  readonly latestWindowDate: string;
  readonly windowHours: number;
  readonly count: number;
}): string[] {
  const count = Math.max(1, Math.floor(args.count));
  const dates: string[] = [];
  let current = args.latestWindowDate;

  for (let index = 0; index < count; index += 1) {
    dates.push(current);
    current = stepWindowDate(current, args.windowHours);
  }

  return dates;
}

export function buildBenchmarkScheduleHealthSummary(args: {
  readonly runs: readonly BenchmarkRunListRow[];
  readonly querySetId: string;
  readonly modelId: string;
  readonly scheduleVersion: string;
  readonly windowHours: number;
  readonly windowDates: readonly string[];
}): BenchmarkScheduleHealthSummary {
  const windows = args.windowDates.map((windowDate) => {
    const summary: BenchmarkScheduleWindowSummary = buildBenchmarkScheduleWindowSummary({
      runs: args.runs,
      querySetId: args.querySetId,
      modelId: args.modelId,
      scheduleVersion: args.scheduleVersion,
      windowDate,
    });
    const matchingRuns = args.runs.filter((run) => {
      if (run.run_scope !== 'scheduled_internal_benchmark') return false;
      if (run.query_set_id !== args.querySetId) return false;
      if (run.model_set_version !== args.modelId) return false;
      if (run.metadata['schedule_version'] !== args.scheduleVersion) return false;
      if (run.metadata['schedule_window_utc'] !== windowDate) return false;
      return true;
    });

    return {
      windowDate,
      domainCount: summary.domainCount,
      pairedDomainCount: summary.pairedDomainCount,
      runCount: matchingRuns.length,
      triggerSources: Array.from(
        new Set(
          matchingRuns
            .map((run) =>
              typeof run.metadata['trigger_source'] === 'string'
                ? run.metadata['trigger_source']
                : null
            )
            .filter((value): value is string => value !== null)
        )
      ).sort(),
      statuses: Array.from(new Set(matchingRuns.map((run) => run.status))).sort(),
      latestCreatedAt: matchingRuns[0]?.created_at ?? null,
      missing: matchingRuns.length === 0,
    };
  });

  return {
    querySetId: args.querySetId,
    modelId: args.modelId,
    scheduleVersion: args.scheduleVersion,
    windowHours: args.windowHours,
    windowDates: args.windowDates,
    windows,
  };
}
