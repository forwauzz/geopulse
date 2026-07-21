import { describe, expect, it } from 'vitest';
import { fullIssueListFromScan } from './scan-issue-list';

describe('fullIssueListFromScan', () => {
  it('prefers the deep-audit allIssues list over the trimmed issues_json', () => {
    const all = [{ checkId: 'a' }, { checkId: 'b' }, { checkId: 'c' }, { checkId: 'd' }];
    const trimmed = [{ checkId: 'a' }];
    expect(fullIssueListFromScan(trimmed, { allIssues: all })).toHaveLength(4);
  });

  it('falls back to full_results_json.issues for free scans', () => {
    const issues = [{ checkId: 'a' }, { checkId: 'b' }];
    expect(fullIssueListFromScan([], { issues })).toHaveLength(2);
  });

  it('falls back to issues_json when full results carry nothing usable', () => {
    expect(fullIssueListFromScan([{ checkId: 'a' }], { pageSample: 'x' })).toHaveLength(1);
    expect(fullIssueListFromScan([{ checkId: 'a' }], null)).toHaveLength(1);
  });

  it('returns empty for garbage input', () => {
    expect(fullIssueListFromScan('nope', 42)).toEqual([]);
  });
});
