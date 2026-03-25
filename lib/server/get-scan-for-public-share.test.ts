import { describe, expect, it } from 'vitest';
import { extractTopIssues } from '@/lib/server/get-scan-for-public-share';

describe('extractTopIssues', () => {
  it('returns top 3 failed checks by weight', () => {
    const raw = [
      { id: 'a', passed: true, weight: 10 },
      { id: 'b', passed: false, weight: 5 },
      { id: 'c', passed: false, weight: 20 },
      { id: 'd', passed: false, weight: 15 },
      { id: 'e', passed: false, weight: 8 },
    ];
    const out = extractTopIssues(raw);
    expect(out).toHaveLength(3);
    expect((out[0] as { id: string }).id).toBe('c');
    expect((out[1] as { id: string }).id).toBe('d');
    expect((out[2] as { id: string }).id).toBe('e');
  });

  it('returns empty for non-array', () => {
    expect(extractTopIssues(null)).toEqual([]);
    expect(extractTopIssues({})).toEqual([]);
  });
});
