import { describe, expect, it } from 'vitest';
import { buildSummaryFacts, isCircularFix, type ScanResponse } from './report-viewer';

/**
 * The executive summary is the only part of the report most readers finish, so what it promotes is
 * effectively the whole deliverable. These pin the three ways it was misleading people:
 *
 *   1. an unmeasurable check could become the "Top blocker" purely by weighing a lot
 *   2. an unbuilt category could be named the "Weakest category"
 *   3. remediation that only restated the finding was shown as the "First move"
 */

function scan(over: Partial<ScanResponse>): ScanResponse {
  return {
    scanId: 's1',
    url: 'https://example.com',
    score: 53,
    letterGrade: 'F',
    topIssues: [],
    categoryScores: [],
    ...over,
  } as ScanResponse;
}

const fact = (facts: ReturnType<typeof buildSummaryFacts>, label: string) =>
  facts.find((f) => f.label === label)?.value;

describe('report summary — what it promotes', () => {
  it('never names an unmeasurable check as the top blocker', () => {
    const facts = buildSummaryFacts(
      scan({
        topIssues: [
          { check: 'Q&A structure', status: 'LOW_CONFIDENCE', weight: 9 },
          { check: 'Meta description', status: 'FAIL', weight: 4, fix: 'Write a 155-character summary.' },
        ],
      })
    );

    // The heaviest check could not be measured, so the real failure leads instead.
    expect(fact(facts, 'Top blocker')).toBe('Meta description');
    expect(fact(facts, 'First move')).toBe('Write a 155-character summary.');
  });

  it('when nothing measurable failed, says the unreadable pages ARE the finding', () => {
    const facts = buildSummaryFacts(
      scan({
        topIssues: [
          { check: 'Q&A structure', status: 'LOW_CONFIDENCE', weight: 9 },
          { check: 'Extractability', status: 'BLOCKED', weight: 7 },
        ],
      })
    );

    expect(fact(facts, 'Top blocker')).toBe('We could not read 2 checks');
    expect(fact(facts, 'First move')).toContain('could not load enough of the page');
  });

  it('does not name an unmeasured category as the weakest', () => {
    const facts = buildSummaryFacts(
      scan({
        topIssues: [{ check: 'Meta description', status: 'FAIL', weight: 4 }],
        categoryScores: [
          // Unbuilt: renders as 0 but has never been measured.
          { category: 'demand_coverage', score: 0, checkCount: 0, letterGrade: 'F' },
          { category: 'ai_readiness', score: 41, checkCount: 6, letterGrade: 'F' },
        ],
      })
    );

    expect(fact(facts, 'Weakest category')).toBe('AI Readiness');
  });

  it('drops remediation that only restates the check', () => {
    const facts = buildSummaryFacts(
      scan({
        topIssues: [
          {
            check: 'Heading structure',
            status: 'FAIL',
            weight: 6,
            fix: 'Heading structure: use one clear H1',
          },
        ],
      })
    );

    expect(fact(facts, 'Top blocker')).toBe('Heading structure');
    expect(fact(facts, 'First move')).toBeUndefined();
  });

  it('keeps remediation that actually tells you what to do', () => {
    const facts = buildSummaryFacts(
      scan({
        topIssues: [
          {
            check: 'Organization schema',
            status: 'FAIL',
            weight: 6,
            fix: 'Add JSON-LD with name, url and sameAs in the <head> of every page.',
          },
        ],
      })
    );

    expect(fact(facts, 'First move')).toContain('JSON-LD');
  });
});

describe('circular fix detection', () => {
  it('flags a fix that is the check name restated', () => {
    expect(isCircularFix('Heading structure', 'Heading structure')).toBe(true);
    expect(isCircularFix('heading structure!', 'Heading Structure')).toBe(true);
  });

  it('leaves real remediation alone', () => {
    expect(
      isCircularFix('Add JSON-LD with name, url and sameAs to every page head.', 'Organization schema')
    ).toBe(false);
  });

  it('is inert when either side is missing', () => {
    expect(isCircularFix(undefined, 'Heading structure')).toBe(false);
    expect(isCircularFix('Do the thing', undefined)).toBe(false);
  });
});
