import { describe, expect, it } from 'vitest';
import { diffScans, summarize, type ScanSnapshot, type ScanIssue } from './verify-agent';

function snapshot(over: Partial<ScanSnapshot> & { issues?: ScanIssue[] }): ScanSnapshot {
  return {
    id: 'scan-1',
    domain: 'example.com',
    score: 70,
    createdAt: '2026-07-20T00:00:00.000Z',
    issues: [],
    ...over,
  };
}

const check = (name: string, passed: boolean | undefined, extra: Partial<ScanIssue> = {}): ScanIssue => ({
  check: name,
  passed,
  category: 'ai_readiness',
  ...extra,
});

describe('verify agent — check-level diff', () => {
  it('reports a failing check that now passes as fixed', () => {
    const result = diffScans(
      snapshot({ id: 'a', score: 70, issues: [check('llms.txt', false)] }),
      snapshot({ id: 'b', score: 78, issues: [check('llms.txt', true)] })
    );

    expect(result.fixed.map((c) => c.check)).toEqual(['llms.txt']);
    expect(result.regressed).toEqual([]);
    expect(result.scoreDelta).toBe(8);
    expect(result.verdict).toBe('improved');
  });

  it('calls out a check that broke EVEN WHEN the total score rose', () => {
    // The case a score-only comparison hides: net progress that quietly lost something.
    const result = diffScans(
      snapshot({ id: 'a', score: 70, issues: [check('llms.txt', false), check('Structured data', true)] }),
      snapshot({ id: 'b', score: 80, issues: [check('llms.txt', true), check('Structured data', false)] })
    );

    expect(result.scoreDelta).toBe(10);
    expect(result.fixed.map((c) => c.check)).toEqual(['llms.txt']);
    expect(result.regressed.map((c) => c.check)).toEqual(['Structured data']);
    expect(result.verdict).toBe('regressed');
  });

  it('separates checks still failing from ones newly checked', () => {
    const result = diffScans(
      snapshot({ id: 'a', issues: [check('Meta description', false)] }),
      snapshot({ id: 'b', issues: [check('Meta description', false), check('FAQ schema', false)] })
    );

    expect(result.stillFailing.map((c) => c.check)).toEqual(['Meta description']);
    expect(result.newlyChecked.map((c) => c.check)).toEqual(['FAQ schema']);
  });

  it('ignores checks with no explicit pass/fail rather than guessing', () => {
    const result = diffScans(
      snapshot({ id: 'a', issues: [check('Unknown', undefined)] }),
      snapshot({ id: 'b', issues: [check('Unknown', undefined)] })
    );

    expect(result.fixed).toEqual([]);
    expect(result.regressed).toEqual([]);
    expect(result.stillFailing).toEqual([]);
    expect(result.newlyChecked).toEqual([]);
  });

  it('matches checks case-insensitively so casing changes are not read as a regression', () => {
    const result = diffScans(
      snapshot({ id: 'a', issues: [check('llms.txt', true)] }),
      snapshot({ id: 'b', issues: [check('LLMS.TXT', false)] })
    );

    expect(result.regressed.map((c) => c.check)).toEqual(['LLMS.TXT']);
    expect(result.newlyChecked).toEqual([]);
  });

  it('never treats a missing score as zero', () => {
    const result = diffScans(
      snapshot({ id: 'a', score: null, issues: [check('llms.txt', false)] }),
      snapshot({ id: 'b', score: 80, issues: [check('llms.txt', true)] })
    );

    expect(result.scoreDelta).toBeNull();
    // Check-level movement is still a real answer even without comparable scores.
    expect(result.verdict).toBe('improved');
  });

  it('is inconclusive when nothing is comparable', () => {
    const result = diffScans(
      snapshot({ id: 'a', score: null, issues: [] }),
      snapshot({ id: 'b', score: null, issues: [] })
    );

    expect(result.verdict).toBe('inconclusive');
    expect(summarize(result)).toBe('no comparable results');
  });

  it('treats an identical re-audit as unchanged', () => {
    const issues = [check('llms.txt', true), check('Meta description', false)];
    const result = diffScans(
      snapshot({ id: 'a', score: 74, issues }),
      snapshot({ id: 'b', score: 74, issues })
    );

    expect(result.verdict).toBe('unchanged');
    expect(result.stillFailing.map((c) => c.check)).toEqual(['Meta description']);
  });

  it('summarizes for an email or PR comment', () => {
    const result = diffScans(
      snapshot({ id: 'a', score: 70, issues: [check('llms.txt', false), check('Meta description', false)] }),
      snapshot({ id: 'b', score: 78, issues: [check('llms.txt', true), check('Meta description', false)] })
    );

    expect(summarize(result)).toBe('70 → 78 (+8) · 1 fixed · 1 still failing');
  });
});
