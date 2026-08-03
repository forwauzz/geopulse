import type { EngineCitationMetric, EngineKey } from './dashboard-citation-metrics';

const ENGINE_ORDER: readonly EngineKey[] = ['chatgpt', 'gemini', 'perplexity', 'claude'];
const COMPLETE_BASELINE_STATES = new Set(['closed', 'measured']);

export type ClientMonitoringEngineState = {
  readonly engine: EngineKey;
  readonly status: 'measured' | 'pending' | 'unavailable';
  readonly metric: EngineCitationMetric | null;
};

export type ClientMonitoringState = {
  readonly status: 'not_enrolled' | 'pending' | 'partial' | 'unavailable' | 'active';
  readonly headline: string;
  readonly detail: string;
  readonly actionLabel: 'Complete baseline' | 'Retry baseline' | 'Verify baseline';
  readonly engines: readonly ClientMonitoringEngineState[];
  readonly measuredCount: number;
};

/**
 * Projects the baseline card and engine panel from the same quality-valid measurement input.
 * Metrics passed here have already crossed the exact-tenant query-set/context-version gate in
 * loadEngineCitationMetrics. Legacy completion metadata can describe orchestration history, but it
 * cannot promote an absent or stale metric into a measured customer result.
 */
export function resolveClientMonitoringState(args: {
  readonly configuredPlatforms: readonly unknown[];
  readonly metrics: Partial<Record<EngineKey, EngineCitationMetric>>;
  readonly baselineStatus: string;
}): ClientMonitoringState {
  const configured = ENGINE_ORDER.filter((engine) => (
    args.configuredPlatforms.some((platform) => (
      typeof platform === 'string' && platform.trim().toLowerCase() === engine
    ))
  ));
  const orchestrationPreviouslyCompleted = COMPLETE_BASELINE_STATES.has(args.baselineStatus);
  const engines = configured.map((engine): ClientMonitoringEngineState => {
    const metric = args.metrics[engine];
    if (metric && Number.isFinite(metric.citationRate)) {
      return { engine, status: 'measured', metric };
    }
    return {
      engine,
      status: orchestrationPreviouslyCompleted ? 'unavailable' : 'pending',
      metric: null,
    };
  });
  const measuredCount = engines.filter((engine) => engine.status === 'measured').length;

  if (engines.length === 0) {
    return {
      status: 'not_enrolled',
      headline: 'Complete the first client-ready baseline',
      detail: 'AI visibility monitoring is not configured for this client yet.',
      actionLabel: 'Complete baseline',
      engines,
      measuredCount,
    };
  }
  if (measuredCount === engines.length) {
    return {
      status: 'active',
      headline: 'Research, readiness audit, verified AI measurement, and scorecard are active',
      detail: `${measuredCount} configured AI ${measuredCount === 1 ? 'engine has' : 'engines have'} a quality-valid measurement.`,
      actionLabel: 'Verify baseline',
      engines,
      measuredCount,
    };
  }
  if (measuredCount > 0) {
    return {
      status: 'partial',
      headline: 'The verified AI visibility baseline is incomplete',
      detail: `${measuredCount} of ${engines.length} configured AI engines have a quality-valid measurement.`,
      actionLabel: 'Retry baseline',
      engines,
      measuredCount,
    };
  }
  if (orchestrationPreviouslyCompleted) {
    return {
      status: 'unavailable',
      headline: 'Monitoring is configured; verified measurements are unavailable',
      detail: 'The previous baseline is not compatible with the current verified measurement profile. Run the baseline again before using AI visibility results.',
      actionLabel: 'Retry baseline',
      engines,
      measuredCount,
    };
  }
  return {
    status: 'pending',
    headline: 'Monitoring is configured; verified measurements are pending',
    detail: 'The configured AI engines will appear as measured only after a quality-valid baseline completes.',
    actionLabel: 'Complete baseline',
    engines,
    measuredCount,
  };
}
