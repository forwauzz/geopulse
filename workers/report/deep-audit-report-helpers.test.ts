import { describe, expect, it } from 'vitest';
import {
  issueStatusLabel,
  parseCoverageSummary,
  parseIssues,
  scoreNarrative,
  severityLabel,
} from './deep-audit-report-helpers';

describe('deep-audit-report-helpers', () => {
  it('normalizes issue rows from unknown input', () => {
    expect(parseIssues(null)).toEqual([]);
    expect(parseIssues([{ check: 'Title' }, null, 'bad'])).toEqual([{ check: 'Title' }]);
  });

  it('derives severity and status labels consistently', () => {
    expect(severityLabel(undefined)).toBe('Low');
    expect(severityLabel(5)).toBe('Medium');
    expect(severityLabel(8)).toBe('High');

    expect(issueStatusLabel({ status: 'WARNING' })).toBe('WARNING');
    expect(issueStatusLabel({ passed: true })).toBe('PASS');
    expect(issueStatusLabel({ passed: false })).toBe('FAIL');
  });

  it('parses coverage payloads and builds the executive narrative', () => {
    expect(parseCoverageSummary([])).toBeNull();
    expect(parseCoverageSummary({ pages_fetched: 3 })).toEqual({ pages_fetched: 3 });
    expect(scoreNarrative(72, 'B', 10, 7, 'Meta description')).toContain(
      'The most critical gap is: Meta description.'
    );
  });
});
