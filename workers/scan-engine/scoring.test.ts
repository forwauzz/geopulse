import { describe, expect, it } from 'vitest';
import { attachWeights, computeScore, computeCategoryScores, letterGrade, topFailedIssues } from './scoring';

describe('scoring', () => {
  it('computes weighted score', () => {
    const w = attachWeights(
      [{ weight: 50, category: 'ai_readiness' as const }, { weight: 50, category: 'extractability' as const }],
      [
        { id: 'a', passed: true, status: 'PASS' as const, finding: '' },
        { id: 'b', passed: false, status: 'FAIL' as const, finding: 'x' },
      ]
    );
    expect(computeScore(w)).toBe(50);
  });

  it('letterGrade maps bands', () => {
    expect(letterGrade(98)).toBe('A+');
    expect(letterGrade(85)).toBe('B');
    expect(letterGrade(55)).toBe('F');
  });

  it('topFailedIssues sorts by weight', () => {
    const w = attachWeights(
      [{ weight: 5, category: 'trust' as const }, { weight: 20, category: 'ai_readiness' as const }, { weight: 10, category: 'extractability' as const }],
      [
        { id: 'a', passed: false, status: 'FAIL' as const, finding: 'a' },
        { id: 'b', passed: false, status: 'FAIL' as const, finding: 'b' },
        { id: 'c', passed: true, status: 'PASS' as const, finding: 'c' },
      ]
    );
    const top = topFailedIssues(w, 2);
    expect(top.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('BLOCKED and NOT_EVALUATED excluded from scoring', () => {
    const w = attachWeights(
      [{ weight: 50, category: 'ai_readiness' as const }, { weight: 50, category: 'ai_readiness' as const }],
      [
        { id: 'a', passed: true, status: 'PASS' as const, finding: '' },
        { id: 'b', passed: false, status: 'BLOCKED' as const, finding: 'blocked' },
      ]
    );
    expect(computeScore(w)).toBe(100);
  });

  it('LOW_CONFIDENCE earns half weight', () => {
    const w = attachWeights(
      [{ weight: 100, category: 'extractability' as const }],
      [{ id: 'a', passed: true, status: 'LOW_CONFIDENCE' as const, finding: '', confidence: 'low' }]
    );
    expect(computeScore(w)).toBe(100);
  });

  it('computes per-category scores', () => {
    const w = attachWeights(
      [
        { weight: 40, category: 'ai_readiness' as const },
        { weight: 60, category: 'extractability' as const },
      ],
      [
        { id: 'a', passed: true, status: 'PASS' as const, finding: '' },
        { id: 'b', passed: false, status: 'FAIL' as const, finding: '' },
      ]
    );
    const cats = computeCategoryScores(w);
    const ai = cats.find((c) => c.category === 'ai_readiness');
    const ext = cats.find((c) => c.category === 'extractability');
    expect(ai?.score).toBe(100);
    expect(ext?.score).toBe(0);
  });
  it('omits categories no check produced, instead of shipping empty rows', () => {
    // `demand_coverage` and `conversion_readiness` are declared in the CheckCategory union and have
    // labels in every renderer, but nothing emits them. They used to be rendered as "— / N/A / 0
    // checks" on every report, and badged "Full report" in the web view — an upsell for a
    // category the paid report cannot fill either.
    const w = attachWeights(
      [
        { weight: 40, category: 'ai_readiness' as const },
        { weight: 60, category: 'extractability' as const },
      ],
      [
        { id: 'a', passed: true, status: 'PASS' as const, finding: '' },
        { id: 'b', passed: false, status: 'FAIL' as const, finding: '' },
      ]
    );
    const cats = computeCategoryScores(w);

    expect(cats.map((c) => c.category)).toEqual(['ai_readiness', 'extractability']);
    expect(cats.find((c) => c.category === 'demand_coverage')).toBeUndefined();
    expect(cats.find((c) => c.category === 'conversion_readiness')).toBeUndefined();
    // Every category that IS reported was actually measured.
    expect(cats.every((c) => c.checkCount > 0)).toBe(true);
  });
});
