import { describe, expect, it } from 'vitest';
import { buildReportStoryData, categoryLabel } from './report-story-data';
import type { ScanResponse } from './report-viewer';

function scan(overrides: Partial<ScanResponse> = {}): ScanResponse {
  return {
    scanId: 's-1',
    url: 'https://example.com',
    domain: 'example.com',
    score: 66,
    letterGrade: 'C',
    topIssues: [],
    issues: [
      { checkId: 'a', check: 'AI crawler access', passed: false, status: 'FAIL', weight: 10, fix: 'Unblock bots' },
      { checkId: 'b', check: 'JSON-LD', passed: false, status: 'FAIL', weight: 8, fix: 'Add schema' },
      { checkId: 'c', check: 'Title tag', passed: true, status: 'PASS', weight: 4 },
      { checkId: 'd', check: 'Freshness', passed: false, status: 'WARNING', weight: 2 },
      { checkId: 'e', check: 'Rendered check', status: 'NOT_EVALUATED', weight: 3 },
    ],
    categoryScores: [
      { category: 'ai_readiness', score: 53, letterGrade: 'F', checkCount: 8 },
      { category: 'extractability', score: 0.82, letterGrade: 'B-', checkCount: 10 },
    ],
    ...overrides,
  };
}

describe('buildReportStoryData', () => {
  it('returns null without a numeric score', () => {
    expect(buildReportStoryData(scan({ score: null }))).toBeNull();
  });

  it('buckets outcomes so every check is accounted for — not-tested included (spec C1)', () => {
    const story = buildReportStoryData(scan())!;
    expect(story.totalChecks).toBe(5);
    expect(story.outcomes.find((o) => o.outcome === 'passed')?.count).toBe(1);
    expect(story.outcomes.find((o) => o.outcome === 'warning')?.count).toBe(1);
    expect(story.outcomes.find((o) => o.outcome === 'failed')?.count).toBe(2);
    expect(story.outcomes.find((o) => o.outcome === 'not_tested')?.count).toBe(1);
    const shares = story.outcomes.reduce((s, o) => s + o.share, 0);
    expect(shares).toBeCloseTo(1);
  });

  it('normalizes 0..1 category scores to 0..100 and sorts weakest first', () => {
    const story = buildReportStoryData(scan())!;
    expect(story.categories[0]).toMatchObject({ category: 'ai_readiness', score: 53, tone: 'warn' });
    expect(story.categories[1]).toMatchObject({ category: 'extractability', score: 82, tone: 'good' });
  });

  it('ranks actions by weight with impact relative to the heaviest', () => {
    const story = buildReportStoryData(scan())!;
    expect(story.actions[0]).toMatchObject({ title: 'AI crawler access', impact: 1 });
    expect(story.actions[1]?.impact).toBeCloseTo(0.8);
  });

  it('projects a higher (but capped) score when fixes remain', () => {
    const story = buildReportStoryData(scan())!;
    expect(story.projectedScore).not.toBeNull();
    expect(story.projectedScore!).toBeGreaterThan(story.score);
    expect(story.projectedScore!).toBeLessThanOrEqual(100);
  });

  it('falls back to topIssues when the full list is missing', () => {
    const story = buildReportStoryData(
      scan({ issues: undefined, topIssues: [{ check: 'X', passed: false, status: 'FAIL', weight: 5 }] })
    )!;
    expect(story.totalChecks).toBe(1);
    expect(story.actions[0]?.title).toBe('X');
  });
});

describe('categoryLabel', () => {
  it('maps known categories and prettifies unknown ones', () => {
    expect(categoryLabel('ai_readiness')).toBe('AI readiness');
    expect(categoryLabel('some_new_thing')).toBe('Some new thing');
  });
});
