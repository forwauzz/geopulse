import { describe, expect, it } from 'vitest';
import { applyReportSettingsToSnapshot, attachComparableAgencyReportHistory, buildAgencyReportSnapshot } from './agency-report-snapshot';
import type { GpmReportPayload } from './geo-performance-report-payload';
import { DEFAULT_REPORT_SETTINGS } from './report-settings';

function payload(platform: 'chatgpt' | 'gemini', citations: readonly boolean[]): GpmReportPayload {
  return {
    configId: 'config-1',
    domain: 'Example.com',
    topic: 'private healthcare',
    location: 'Toronto',
    windowDate: '2026-08',
    platform,
    modelId: platform === 'chatgpt' ? 'internal-openai-id' : 'internal-gemini-id',
    reportedAt: '2026-08-01T12:00:00.000Z',
    citationRate: citations.filter(Boolean).length / citations.length,
    shareOfVoice: 0,
    queryCoverage: 1,
    visibilityPct: citations.filter(Boolean).length / citations.length,
    industryRank: null,
    prompts: citations.map((cited, index) => ({
      queryKey: `q${String(index + 1)}`,
      queryText: `Buyer question ${String(index + 1)}`,
      cited,
      rankPosition: cited ? index + 1 : null,
      topCompetitorInQuery: cited ? null : 'competitor.example',
    })),
    competitors: [],
    opportunities: [],
  };
}

describe('buildAgencyReportSnapshot', () => {
  it('creates one canonical result from every measured engine without counting missing engines as zero', () => {
    const snapshot = buildAgencyReportSnapshot({
      configId: 'config-1',
      clientName: 'Example Clinic',
      domain: 'example.com',
      topic: 'private healthcare',
      location: 'Toronto',
      windowDate: '2026-08',
      reportedAt: '2026-08-01T12:00:00.000Z',
      payloads: [payload('chatgpt', [true, false]), payload('gemini', [true, true])],
      sourceRunGroupIds: { chatgpt: 'run-chatgpt', gemini: 'run-gemini' },
      settings: DEFAULT_REPORT_SETTINGS,
    });

    expect(snapshot.version).toBe('2');
    expect(snapshot.engines.map((engine) => engine.key)).toEqual(['chatgpt', 'gemini']);
    expect(snapshot.unavailableEngines).toEqual(['perplexity']);
    expect(snapshot.combinedVisibilityPct).toBe(0.75);
    expect(snapshot.questionsTracked).toBe(2);
    expect(snapshot.evaluationsTracked).toBe(4);
    expect(snapshot.questions[0]?.citedByEngines).toBe(2);
    expect(snapshot.scope.disclosure).toContain('Full measured scope');
  });

  it('recomputes every headline figure from the explicitly selected scope and discloses curation', () => {
    const settings = {
      ...DEFAULT_REPORT_SETTINGS,
      promptKeys: ['q2'],
      competitors: ['competitor.example'],
    };
    const snapshot = buildAgencyReportSnapshot({
      configId: 'config-1',
      domain: 'example.com',
      topic: 'private healthcare',
      location: 'Toronto',
      windowDate: '2026-08',
      payloads: [payload('chatgpt', [true, false]), payload('gemini', [true, true])],
      sourceRunGroupIds: { chatgpt: 'run-chatgpt', gemini: 'run-gemini' },
      settings,
    });

    expect(snapshot.questions.map((question) => question.queryKey)).toEqual(['q2']);
    expect(snapshot.combinedVisibilityPct).toBe(0.5);
    expect(snapshot.scope).toMatchObject({ isCurated: true, selectedPromptCount: 1, availablePromptCount: 2 });
    expect(snapshot.scope.disclosure).toContain('1 of 2 measured buyer questions');
    expect(snapshot.competitors[0]).toMatchObject({ name: 'competitor.example', appearedInsteadCount: 1 });
  });

  it('retains complete measured evidence so a prior engine or question selection can be reversed', () => {
    const curated = buildAgencyReportSnapshot({
      configId: 'config-1', domain: 'example.com', topic: 'private healthcare', location: 'Toronto',
      windowDate: '2026-08',
      payloads: [payload('chatgpt', [true, false]), payload('gemini', [true, true])],
      sourceRunGroupIds: { chatgpt: 'run-chatgpt', gemini: 'run-gemini' },
      settings: {
        ...DEFAULT_REPORT_SETTINGS,
        promptKeys: ['q1'],
        engines: { ...DEFAULT_REPORT_SETTINGS.engines, google: false },
      },
    });
    expect(curated.questions).toHaveLength(1);
    expect(curated.engines.map((engine) => engine.key)).toEqual(['chatgpt']);
    expect(curated.availableQuestions).toHaveLength(2);
    expect(curated.availableEngines.map((engine) => engine.key)).toEqual(['chatgpt', 'gemini']);

    const restored = applyReportSettingsToSnapshot(curated, DEFAULT_REPORT_SETTINGS);
    expect(restored.questions).toHaveLength(2);
    expect(restored.engines.map((engine) => engine.key)).toEqual(['chatgpt', 'gemini']);
  });

  it('fails closed when payloads from different windows are accidentally combined', () => {
    expect(() => buildAgencyReportSnapshot({
      configId: 'config-1',
      domain: 'example.com',
      topic: 'private healthcare',
      location: 'Toronto',
      windowDate: '2026-07',
      payloads: [payload('chatgpt', [true, false])],
      sourceRunGroupIds: { chatgpt: 'run-chatgpt' },
      settings: DEFAULT_REPORT_SETTINGS,
    })).toThrow('report_snapshot_window_mismatch');
  });
});

describe('attachComparableAgencyReportHistory', () => {
  it('keeps only in-window snapshots produced by the same report profile', () => {
    const current = buildAgencyReportSnapshot({
      configId: 'config-1', clientName: 'Clinic Co', domain: 'example.com', topic: 'care', location: 'Toronto',
      windowDate: '2026-08', reportedAt: '2026-08-01T12:00:00.000Z', payloads: [payload('chatgpt', [true, false])],
      sourceRunGroupIds: { chatgpt: 'run-current' }, settings: { ...DEFAULT_REPORT_SETTINGS, comparisonMonths: 3 },
    });
    const prior = buildAgencyReportSnapshot({
      configId: 'config-1', clientName: 'Clinic Co', domain: 'example.com', topic: 'care', location: 'Toronto',
      windowDate: '2026-07', reportedAt: '2026-07-01T12:00:00.000Z', payloads: [{ ...payload('chatgpt', [true]), windowDate: '2026-07' }],
      sourceRunGroupIds: { chatgpt: 'run-prior' }, settings: { ...DEFAULT_REPORT_SETTINGS, comparisonMonths: 3 },
    });
    const incompatible = { ...prior, windowDate: '2026-06', profileVersion: 'different-profile' };
    const result = attachComparableAgencyReportHistory(current, [prior, incompatible]);
    expect(result.trend.map((point) => point.windowDate)).toEqual(['2026-07', '2026-08']);
  });
});
