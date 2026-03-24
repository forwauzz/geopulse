import { describe, expect, it } from 'vitest';
import { attachWeights, computeScore, letterGrade, topFailedIssues } from './scoring';

describe('scoring', () => {
  it('computes weighted score', () => {
    const w = attachWeights(
      [{ weight: 50 }, { weight: 50 }],
      [
        { id: 'a', passed: true, finding: '' },
        { id: 'b', passed: false, finding: 'x' },
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
      [{ weight: 5 }, { weight: 20 }, { weight: 10 }],
      [
        { id: 'a', passed: false, finding: 'a' },
        { id: 'b', passed: false, finding: 'b' },
        { id: 'c', passed: true, finding: 'c' },
      ]
    );
    const top = topFailedIssues(w, 2);
    expect(top.map((x) => x.id)).toEqual(['b', 'a']);
  });
});
