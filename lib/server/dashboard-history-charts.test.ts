import { describe, expect, it } from 'vitest';
import {
  buildCategoryTrends,
  buildDashboardHistoryCharts,
  buildRunDeltas,
  buildScoreTimeline,
  type HistoryScanRow,
} from './dashboard-history-charts';

function row(overrides: Partial<HistoryScanRow> = {}): HistoryScanRow {
  return {
    id: 'r',
    domain: 'example.com',
    url: 'https://example.com',
    score: 70,
    letter_grade: 'B',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildScoreTimeline', () => {
  it('orders oldest→newest and keeps not-tested runs as null (never zero-filled)', () => {
    const timeline = buildScoreTimeline([
      row({ id: 'c', score: 80, created_at: '2026-07-03T00:00:00Z' }),
      row({ id: 'a', score: 60, created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', score: null, letter_grade: null, created_at: '2026-07-02T00:00:00Z' }),
    ]);
    expect(timeline.map((p) => p.scanId)).toEqual(['a', 'b', 'c']);
    expect(timeline.map((p) => p.score)).toEqual([60, null, 80]);
  });
});

describe('buildRunDeltas', () => {
  it('computes consecutive deltas newest-first', () => {
    const deltas = buildRunDeltas([
      row({ id: 'a', score: 60, created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', score: 72, created_at: '2026-07-02T00:00:00Z' }),
    ]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ scanId: 'b', score: 72, previousScore: 60, delta: 12 });
  });

  it('returns a null delta when either endpoint was not gradeable', () => {
    const deltas = buildRunDeltas([
      row({ id: 'a', score: 60, created_at: '2026-07-01T00:00:00Z' }),
      row({ id: 'b', score: null, created_at: '2026-07-02T00:00:00Z' }),
      row({ id: 'c', score: 75, created_at: '2026-07-03T00:00:00Z' }),
    ]);
    // newest-first: c-vs-b (null), b-vs-a (null)
    expect(deltas.map((d) => d.delta)).toEqual([null, null]);
  });
});

describe('buildCategoryTrends', () => {
  it('surfaces only categories with real data and drops hygiene entirely', () => {
    const trends = buildCategoryTrends([
      row({
        id: 'a',
        created_at: '2026-07-01T00:00:00Z',
        categoryScores: [
          { category: 'ai_readiness', score: 55 },
          { category: 'extractability', score: -1 }, // N/A on this run
          { category: 'hygiene', score: 90 }, // must never appear
        ],
      }),
      row({
        id: 'b',
        created_at: '2026-07-02T00:00:00Z',
        categoryScores: [
          { category: 'ai_readiness', score: 70 },
          { category: 'extractability', score: 80 },
        ],
      }),
    ]);
    const keys = trends.map((t) => t.category);
    expect(keys).toContain('ai_readiness');
    expect(keys).toContain('extractability');
    expect(keys).not.toContain('hygiene');
    // extractability's first run was N/A → null gap, not 0
    const extract = trends.find((t) => t.category === 'extractability');
    expect(extract?.points.map((p) => p.score)).toEqual([null, 80]);
  });

  it('omits a category that never produced a real value', () => {
    const trends = buildCategoryTrends([
      row({ categoryScores: [{ category: 'trust', score: -1 }] }),
    ]);
    expect(trends).toHaveLength(0);
  });

  it('tolerates missing / malformed categoryScores', () => {
    expect(buildCategoryTrends([row({ categoryScores: undefined })])).toEqual([]);
    expect(buildCategoryTrends([row({ categoryScores: 'nonsense' })])).toEqual([]);
  });
});

describe('buildDashboardHistoryCharts', () => {
  it('counts only gradeable runs', () => {
    const charts = buildDashboardHistoryCharts([
      row({ id: 'a', score: 60 }),
      row({ id: 'b', score: null, created_at: '2026-07-02T00:00:00Z' }),
      row({ id: 'c', score: 80, created_at: '2026-07-03T00:00:00Z' }),
    ]);
    expect(charts.scoredRunCount).toBe(2);
    expect(charts.timeline).toHaveLength(3);
  });
});
