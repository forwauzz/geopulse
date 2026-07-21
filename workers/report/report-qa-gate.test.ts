import { describe, expect, it } from 'vitest';
import { deriveCheckCounts, describeCheckCounts } from './check-counts';
import {
  looksGarbled,
  resolveReportContradictions,
  runReportQaGate,
  truncateAtWord,
  type GateIssue,
} from './report-qa-gate';

function issue(partial: Partial<GateIssue>): GateIssue {
  return { checkId: 'x', check: 'X', status: 'PASS', passed: true, finding: 'All good here.', ...partial };
}

describe('deriveCheckCounts (spec C1 — one arithmetic for every surface)', () => {
  it('buckets sum to total', () => {
    const c = deriveCheckCounts([
      issue({ status: 'PASS' }),
      issue({ status: 'WARNING' }),
      issue({ status: 'LOW_CONFIDENCE' }),
      issue({ status: 'FAIL' }),
      issue({ status: 'NOT_EVALUATED' }),
      issue({ status: 'BLOCKED' }),
    ]);
    expect(c.total).toBe(6);
    expect(c.passed + c.warning + c.failed + c.notTested).toBe(c.total);
    expect(c).toMatchObject({ passed: 1, warning: 2, failed: 1, notTested: 2 });
  });

  it('describes counts accounting for every check', () => {
    const c = deriveCheckCounts([issue({}), issue({ status: 'NOT_EVALUATED' })]);
    expect(describeCheckCounts(c)).toBe('1 of 2 checks passed, 1 not tested');
  });
});

describe('truncateAtWord', () => {
  it('leaves short strings alone', () => {
    expect(truncateAtWord('short', 40)).toBe('short');
  });
  it('never cuts mid-word and always adds an ellipsis', () => {
    const out = truncateAtWord('robots.txt blocks these AI crawlers from indexing your site', 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    // The infamous bug: must not end in a word fragment like "crawle".
    expect(/[a-z]+…$/.test(out) ? out : '').not.toMatch(/crawle…$/);
    const withoutEllipsis = out.slice(0, -1).trimEnd();
    expect('robots.txt blocks these AI crawlers from indexing your site').toContain(withoutEllipsis);
  });
});

describe('looksGarbled', () => {
  it('flags replacement characters', () => {
    expect(looksGarbled('finding with � broken bytes')).toBe(true);
  });
  it('flags the legacy hard-cut pattern at cap length', () => {
    const cut = `${'x'.repeat(63)} crawle`; // exactly 70 chars, ends mid-word
    expect(cut.length).toBe(70);
    expect(looksGarbled(cut)).toBe(true);
  });
  it('does not flag normal sentences', () => {
    expect(looksGarbled('robots.txt does not block any known AI crawler user-agents.')).toBe(false);
    expect(looksGarbled('Missing meta description.')).toBe(false);
  });
});

describe('resolveReportContradictions', () => {
  it('resolves schema present-vs-absent by dropping the superseded row', () => {
    const { issues, resolutions } = resolveReportContradictions([
      issue({ checkId: 'json-ld', status: 'PASS', finding: 'Valid JSON-LD matching visible content: Organization.' }),
      issue({ checkId: 'schema-types', status: 'FAIL', passed: false, finding: 'No Schema.org @type values found in JSON-LD.' }),
    ]);
    expect(resolutions).toHaveLength(1);
    const types = issues.find((i) => i.checkId === 'schema-types');
    expect(types?.status).toBe('NOT_EVALUATED');
    expect(types?.finding).toContain('Superseded');
  });

  it('leaves consistent reports untouched', () => {
    const input = [
      issue({ checkId: 'json-ld', status: 'PASS' }),
      issue({ checkId: 'schema-types', status: 'PASS' }),
    ];
    const { issues, resolutions } = resolveReportContradictions(input);
    expect(resolutions).toHaveLength(0);
    expect(issues.map((i) => i.status)).toEqual(['PASS', 'PASS']);
  });
});

describe('runReportQaGate', () => {
  it('passes a clean report', () => {
    const gate = runReportQaGate({
      issues: [issue({}), issue({ checkId: 'y', status: 'FAIL', passed: false, finding: 'Missing meta description.' })],
    });
    expect(gate.ok).toBe(true);
    expect(gate.violations).toHaveLength(0);
  });

  it('blocks on renderer count mismatch', () => {
    const gate = runReportQaGate({
      issues: [issue({}), issue({ checkId: 'y' })],
      renderedCounts: { passed: 1, total: 3 },
    });
    expect(gate.ok).toBe(false);
    expect(gate.violations[0]?.rule).toBe('count_mismatch');
  });

  it('blocks on empty findings only for FAIL/WARNING rows', () => {
    const gate = runReportQaGate({ issues: [issue({ status: 'FAIL', passed: false, finding: '' })] });
    expect(gate.ok).toBe(false);
    expect(gate.violations[0]?.rule).toBe('empty_finding');
  });

  it('never DLQs a report over an empty finding on a PASSED or excluded row (paid-path safety)', () => {
    const gate = runReportQaGate({
      issues: [
        issue({ status: 'PASS', finding: '' }), // LLM check passing with empty reasoning
        issue({ checkId: 'y', status: 'NOT_EVALUATED', passed: false, finding: '' }), // renderer has fallback copy
        issue({ checkId: 'z', status: 'LOW_CONFIDENCE', finding: '' }),
      ],
    });
    expect(gate.ok).toBe(true);
    expect(gate.warnings.length).toBe(3);
  });

  it('treats the mid-word-cut heuristic as a warning, not a fatal violation', () => {
    const cut = `${'x'.repeat(63)} crawle`;
    const gate = runReportQaGate({ issues: [issue({ finding: cut })] });
    expect(gate.ok).toBe(true);
    expect(gate.warnings[0]?.rule).toBe('garbled_text');
  });

  it('resolves repeated contradictions to a fixpoint', () => {
    const { issues, resolutions } = resolveReportContradictions([
      issue({ checkId: 'ai-crawler-access', status: 'PASS', finding: 'robots.txt allows all AI search agents.' }),
      issue({ checkId: 'other-a', status: 'FAIL', passed: false, finding: 'robots.txt blocks OAI-SearchBot from the site.' }),
      issue({ checkId: 'other-b', status: 'FAIL', passed: false, finding: 'robots.txt blocks PerplexityBot entirely.' }),
    ]);
    expect(resolutions.length).toBe(2);
    expect(issues.filter((i) => i.status === 'NOT_EVALUATED')).toHaveLength(2);
    const gate = runReportQaGate({ issues });
    expect(gate.violations.filter((v) => v.rule === 'contradiction')).toHaveLength(0);
  });

  it('blocks on unresolved contradictions', () => {
    const gate = runReportQaGate({
      issues: [
        issue({ checkId: 'json-ld', status: 'PASS' }),
        issue({ checkId: 'schema-types', status: 'FAIL', passed: false, finding: 'No Schema.org @type values found.' }),
      ],
    });
    expect(gate.ok).toBe(false);
    expect(gate.violations.some((v) => v.rule === 'contradiction')).toBe(true);
  });

  it('blocks on garbled text', () => {
    const gate = runReportQaGate({
      issues: [issue({ finding: 'broken � text here' })],
    });
    expect(gate.ok).toBe(false);
    expect(gate.violations[0]?.rule).toBe('garbled_text');
  });
});
