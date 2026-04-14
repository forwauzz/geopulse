import { describe, expect, it } from 'vitest';
import {
  customerFacingFinding,
  deriveDemandCoverageSignals,
  parseIssues,
  summarizePageIssuePatterns,
} from './deep-audit-report-helpers';

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

  it('softens generic low-confidence findings into verification language', () => {
    expect(
      customerFacingFinding({
        checkId: 'llm-extractability',
        status: 'LOW_CONFIDENCE',
        finding: 'The page content may be difficult for machine retrieval to interpret.',
      })
    ).toContain('not strong enough to treat as a confirmed diagnosis');
  });

  it('gives blocked findings bounded wording', () => {
    expect(
      customerFacingFinding({
        checkId: 'llms-txt',
        status: 'BLOCKED',
        finding: 'The crawler could not retrieve the expected resource.',
      })
    ).toContain('could not be evaluated because access');
  });

  it('gives not-evaluated findings bounded wording', () => {
    expect(
      customerFacingFinding({
        checkId: 'conversion-readiness',
        status: 'NOT_EVALUATED',
        finding: 'No evaluation was run for this check.',
      })
    ).toContain('was not evaluated in this audit pass');
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

describe('summarizePageIssuePatterns', () => {
  it('groups repeated non-passing issues across pages', () => {
    const summary = summarizePageIssuePatterns([
      {
        url: 'https://example.com/a',
        issuesJson: [
          { checkId: 'json-ld', check: 'Schema.org type coverage', status: 'FAIL', finding: 'No Schema.org @type values found.' },
          { checkId: 'title', check: 'Title', status: 'PASS', finding: 'ok' },
        ],
      },
      {
        url: 'https://example.com/b',
        issuesJson: [
          { checkId: 'json-ld', check: 'Schema.org type coverage', status: 'FAIL', finding: 'No Schema.org @type values found.' },
        ],
      },
      {
        url: 'https://example.com/c',
        issuesJson: [
          { checkId: 'json-ld', check: 'Schema.org type coverage', status: 'FAIL', finding: 'No Schema.org @type values found.' },
        ],
      },
    ]);

    expect(summary).toHaveLength(1);
    expect(summary[0]?.checkName).toBe('Schema.org type coverage');
    expect(summary[0]?.affectedPages).toBe(3);
    expect(summary[0]?.sampleUrls).toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });
});

describe('deriveDemandCoverageSignals', () => {
  it('maps key content-readiness checks into a compact demand-coverage section', () => {
    const signals = deriveDemandCoverageSignals([
      {
        checkId: 'llm-qa-pattern',
        status: 'FAIL',
        finding: 'Pages do not answer likely buyer questions directly.',
        fix: 'Restructure key pages into a clear question-and-answer format.',
      },
      {
        checkId: 'llm-extractability',
        status: 'LOW_CONFIDENCE',
        finding: 'The page content may be difficult for machine retrieval to interpret.',
        fix: 'Strengthen the opening summary and heading follow-up content.',
      },
      {
        checkId: 'freshness',
        status: 'WARNING',
        finding: 'No publication or modification date detected — AI models may deprioritize content with unknown freshness.',
      },
    ]);

    expect(signals).toHaveLength(3);
    expect(signals[0]?.title).toBe('Direct question-answer structure');
    expect(signals[0]?.firstMove).toContain('question-and-answer');
    expect(signals[1]?.status).toBe('LOW_CONFIDENCE');
    expect(signals[2]?.title).toBe('Freshness and upkeep signals');
  });
});
