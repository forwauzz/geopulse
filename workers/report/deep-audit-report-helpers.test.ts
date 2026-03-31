import { describe, expect, it } from 'vitest';
import { customerFacingFinding, parseIssues } from './deep-audit-report-helpers';

describe('parseIssues', () => {
  it('adds teamOwner from known check ids', () => {
    const issues = parseIssues([
      { checkId: 'ai-crawler-access', status: 'FAIL' },
      { checkId: 'llm-qa-pattern', status: 'FAIL' },
      { checkId: 'eeat-signals', status: 'FAIL' },
    ]);

    expect(issues[0]?.teamOwner).toBe('Engineering');
    expect(issues[1]?.teamOwner).toBe('Content');
    expect(issues[2]?.teamOwner).toBe('Brand');
  });

  it('falls back to check when checkId is missing', () => {
    const issues = parseIssues([{ check: 'open-graph', status: 'FAIL' }]);

    expect(issues[0]?.teamOwner).toBe('Brand');
  });

  it('leaves unknown checks without an owner', () => {
    const issues = parseIssues([{ checkId: 'future-check', status: 'FAIL' }]);

    expect(issues[0]?.teamOwner).toBeUndefined();
  });
});

describe('customerFacingFinding', () => {
  it('replaces raw low-confidence transport tokens with bounded wording', () => {
    expect(
      customerFacingFinding({
        checkId: 'llm-qa-pattern',
        status: 'LOW_CONFIDENCE',
        finding: 'http_403',
      })
    ).toContain('could not confidently evaluate this check');
  });

  it('preserves normal findings unchanged', () => {
    expect(
      customerFacingFinding({
        checkId: 'json-ld',
        status: 'FAIL',
        finding: 'No JSON-LD structured data detected.',
      })
    ).toBe('No JSON-LD structured data detected.');
  });
});
