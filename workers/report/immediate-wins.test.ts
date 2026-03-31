import { describe, expect, it } from 'vitest';
import { buildImmediateWins } from './immediate-wins';

describe('buildImmediateWins', () => {
  it('selects only qualifying owner-aware issues and sorts by weight', () => {
    const wins = buildImmediateWins([
      {
        checkId: 'ai-crawler-access',
        check: 'AI crawler access (robots.txt)',
        status: 'FAIL',
        weight: 10,
        teamOwner: 'Engineering',
        finding: 'robots.txt blocks known AI crawlers',
        fix: 'Update robots.txt to allow AI crawlers',
      },
      {
        checkId: 'llm-qa-pattern',
        check: 'Q&A / instructional structure (LLM)',
        status: 'FAIL',
        weight: 10,
        teamOwner: 'Content',
        finding: 'pages are not structured as Q&A',
        fix: 'Restructure key pages into a clear question-and-answer format',
      },
      {
        checkId: 'eeat-signals',
        check: 'E-E-A-T signals (authorship & trust)',
        status: 'LOW_CONFIDENCE',
        weight: 6,
        teamOwner: 'Brand',
        finding: 'missing author signals',
        fix: 'Add author attribution',
      },
    ]);

    expect(wins).toHaveLength(2);
    expect(wins[0]?.checkId).toBe('ai-crawler-access');
    expect(wins[0]?.who).toBe('Engineering');
    expect(wins[1]?.checkId).toBe('llm-qa-pattern');
    expect(wins[1]?.effort).toBe('Moderate');
  });

  it('excludes issues without owner, low weight, or blocked status', () => {
    const wins = buildImmediateWins([
      { checkId: 'future-check', status: 'FAIL', weight: 10 },
      { checkId: 'viewport', status: 'FAIL', weight: 2, teamOwner: 'Engineering' },
      { checkId: 'json-ld', status: 'BLOCKED', weight: 8, teamOwner: 'Engineering' },
    ]);

    expect(wins).toHaveLength(0);
  });
});
