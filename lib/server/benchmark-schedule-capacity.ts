export type BenchmarkScheduleCapacityInput = {
  readonly selectedDomainCount: number;
  readonly queryCount: number;
  readonly runModeCount: number;
  readonly maxRunsPerWindow: number;
  readonly windowHours: number;
  readonly targetDomainCounts?: readonly number[];
};

export type BenchmarkScaleScenario = {
  readonly domainCount: number;
  readonly runGroupCount: number;
  readonly queryRunCount: number;
  readonly windowsNeeded: number;
  readonly daysNeeded: number;
};

export type BenchmarkScheduleCapacitySummary = {
  readonly selectedDomainCount: number;
  readonly queryCount: number;
  readonly runModeCount: number;
  readonly maxRunsPerWindow: number;
  readonly windowHours: number;
  readonly windowsPerDay: number;
  readonly maxRunsPerDay: number;
  readonly maxDomainsPerWindow: number;
  readonly maxDomainsPerDay: number;
  readonly selectedRunGroupCount: number;
  readonly selectedQueryRunCount: number;
  readonly selectedWindowsNeeded: number;
  readonly selectedDaysNeeded: number;
  readonly scenarios: readonly BenchmarkScaleScenario[];
};

const DEFAULT_TARGET_DOMAIN_COUNTS = [100, 200, 500, 1000] as const;

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function toScenario(args: {
  readonly domainCount: number;
  readonly queryCount: number;
  readonly runModeCount: number;
  readonly maxRunsPerWindow: number;
  readonly maxRunsPerDay: number;
}): BenchmarkScaleScenario {
  const runGroupCount = args.domainCount * args.runModeCount;
  const queryRunCount = runGroupCount * args.queryCount;
  const windowsNeeded = Math.ceil(runGroupCount / args.maxRunsPerWindow);
  const daysNeeded = Number((runGroupCount / args.maxRunsPerDay).toFixed(2));

  return {
    domainCount: args.domainCount,
    runGroupCount,
    queryRunCount,
    windowsNeeded,
    daysNeeded,
  };
}

export function buildBenchmarkScheduleCapacitySummary(
  input: BenchmarkScheduleCapacityInput
): BenchmarkScheduleCapacitySummary {
  const selectedDomainCount = normalizePositiveInt(input.selectedDomainCount, 0);
  const queryCount = normalizePositiveInt(input.queryCount, 1);
  const runModeCount = normalizePositiveInt(input.runModeCount, 1);
  const maxRunsPerWindow = normalizePositiveInt(input.maxRunsPerWindow, 1);
  const windowHours = normalizePositiveInt(input.windowHours, 24);
  const windowsPerDay = Math.max(1, Math.floor(24 / Math.min(windowHours, 24)));
  const maxRunsPerDay = maxRunsPerWindow * windowsPerDay;
  const maxDomainsPerWindow = Math.max(1, Math.floor(maxRunsPerWindow / runModeCount));
  const maxDomainsPerDay = Math.max(1, Math.floor(maxRunsPerDay / runModeCount));
  const selectedRunGroupCount = selectedDomainCount * runModeCount;
  const selectedQueryRunCount = selectedRunGroupCount * queryCount;
  const selectedWindowsNeeded = Math.ceil(selectedRunGroupCount / maxRunsPerWindow);
  const selectedDaysNeeded = Number((selectedRunGroupCount / maxRunsPerDay).toFixed(2));
  const targetDomainCounts =
    input.targetDomainCounts && input.targetDomainCounts.length > 0
      ? input.targetDomainCounts
      : DEFAULT_TARGET_DOMAIN_COUNTS;
  const scenarios = Array.from(
    new Set(
      targetDomainCounts
        .map((value) => normalizePositiveInt(value, 0))
        .filter((value) => value > 0)
    )
  ).map((domainCount) =>
    toScenario({
      domainCount,
      queryCount,
      runModeCount,
      maxRunsPerWindow,
      maxRunsPerDay,
    })
  );

  return {
    selectedDomainCount,
    queryCount,
    runModeCount,
    maxRunsPerWindow,
    windowHours,
    windowsPerDay,
    maxRunsPerDay,
    maxDomainsPerWindow,
    maxDomainsPerDay,
    selectedRunGroupCount,
    selectedQueryRunCount,
    selectedWindowsNeeded,
    selectedDaysNeeded,
    scenarios,
  };
}
