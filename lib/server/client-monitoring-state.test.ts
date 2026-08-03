import { describe, expect, it } from 'vitest';
import { resolveClientMonitoringState } from './client-monitoring-state';

function metric(engine: 'gemini' | 'perplexity', citationRate: number) {
  return {
    engine,
    modelId: engine === 'gemini' ? 'gemini-3.5-flash-lite' : 'sonar',
    citationRate,
    runMode: 'blind_discovery',
    computedAt: '2026-08-02T02:15:33Z',
  } as const;
}

describe('resolveClientMonitoringState', () => {
  it('does not let stale completion metadata claim an unbound SanoMed baseline is active', () => {
    const view = resolveClientMonitoringState({
      configuredPlatforms: ['gemini', 'perplexity'],
      metrics: {},
      baselineStatus: 'closed',
    });

    expect(view.status).toBe('unavailable');
    expect(view.headline).toContain('verified measurements are unavailable');
    expect(view.engines).toEqual([
      { engine: 'gemini', status: 'unavailable', metric: null },
      { engine: 'perplexity', status: 'unavailable', metric: null },
    ]);
    expect(view.actionLabel).toBe('Retry baseline');
  });

  it('shows only configured engines and preserves a measured zero', () => {
    const view = resolveClientMonitoringState({
      configuredPlatforms: ['gemini', 'perplexity'],
      metrics: {
        gemini: metric('gemini', 0),
        perplexity: metric('perplexity', 0.7),
        chatgpt: {
          engine: 'chatgpt', modelId: 'gpt-4o-mini', citationRate: 1,
          runMode: 'blind_discovery', computedAt: '2026-08-02T02:15:33Z',
        },
      },
      baselineStatus: 'measured',
    });

    expect(view.status).toBe('active');
    expect(view.engines.map((engine) => engine.engine)).toEqual(['gemini', 'perplexity']);
    expect(view.engines[0]?.metric?.citationRate).toBe(0);
    expect(view.headline).toContain('verified AI measurement');
  });

  it('labels configured engines independently when the baseline is incomplete', () => {
    const view = resolveClientMonitoringState({
      configuredPlatforms: ['gemini', 'perplexity'],
      metrics: { gemini: metric('gemini', 0.2) },
      baselineStatus: 'needs_retry',
    });

    expect(view.status).toBe('partial');
    expect(view.engines.map((engine) => [engine.engine, engine.status])).toEqual([
      ['gemini', 'measured'],
      ['perplexity', 'pending'],
    ]);
    expect(view.detail).toContain('1 of 2');
  });

  it('distinguishes configured pending monitoring from no enrollment', () => {
    expect(resolveClientMonitoringState({
      configuredPlatforms: ['gemini'],
      metrics: {},
      baselineStatus: 'not_started',
    }).status).toBe('pending');

    const unenrolled = resolveClientMonitoringState({
      configuredPlatforms: [],
      metrics: {},
      baselineStatus: 'not_started',
    });
    expect(unenrolled.status).toBe('not_enrolled');
    expect(unenrolled.engines).toEqual([]);
  });

  it('deduplicates and ignores unknown configured providers', () => {
    const view = resolveClientMonitoringState({
      configuredPlatforms: ['perplexity', 'gemini', 'perplexity', 'unknown', null, 42],
      metrics: {},
      baselineStatus: 'not_started',
    });
    expect(view.engines.map((engine) => engine.engine)).toEqual(['gemini', 'perplexity']);
  });
});
