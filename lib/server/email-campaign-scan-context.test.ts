import { describe, expect, it } from 'vitest';
import { scanContextFromRow } from './email-campaign-scan-context';

describe('campaign scan context', () => {
  it('keeps only real failed findings and limits the email preview to two', () => {
    const context = scanContextFromRow({
      id: 'scan-techso',
      url: 'https://techso.ca/',
      domain: 'techso.ca',
      score: 76,
      letter_grade: 'C',
      created_at: '2026-08-09T01:05:00.000Z',
      issues_json: [],
      full_results_json: {
        issues: [
          { passed: true, check: 'Reachable', fix: 'No action' },
          { passed: false, check: 'Answer-first content', fix: 'Lead with buyer questions.' },
          { passed: false, check: 'Business schema', fix: 'Add a specific business type.' },
          { passed: false, check: 'Heading hierarchy', fix: 'Use one clear H1.' },
        ],
        bucketScores: [
          { bucket: 'eligibility', score: 100 },
          { bucket: 'understanding', score: 62 },
        ],
        accessMatrix: {
          rows: [
            { status: 'eligible' },
            { status: 'eligible' },
            { status: 'eligible' },
            { status: 'eligible' },
            { status: 'eligible' },
          ],
        },
      },
    });

    expect(context).toMatchObject({
      scanId: 'scan-techso',
      siteUrl: 'https://techso.ca/',
      score: 76,
      grade: 'C',
      passedChecks: 1,
      totalChecks: 4,
      eligibleDestinations: 5,
      testedDestinations: 5,
      retrievalScore: 100,
      understandingTrustScore: 62,
    });
    expect(context?.topIssues).toEqual([
      { check: 'Answer-first content', fix: 'Lead with buyer questions.' },
      { check: 'Business schema', fix: 'Add a specific business type.' },
    ]);
  });

  it('refuses a score without observed failed findings', () => {
    expect(scanContextFromRow({
      id: 'scan-empty',
      url: 'https://example.com/',
      domain: 'example.com',
      score: 90,
      letter_grade: 'A',
      created_at: '2026-08-09T01:05:00.000Z',
      issues_json: [{ passed: true, check: 'Reachable' }],
      full_results_json: null,
    })).toBeNull();
  });

  it('refuses generic-looking proof when the exact URL or diagnostic evidence is absent', () => {
    expect(scanContextFromRow({
      id: 'scan-incomplete',
      url: null,
      domain: 'example.com',
      score: 76,
      letter_grade: 'C',
      created_at: '2026-08-09T01:05:00.000Z',
      issues_json: [],
      full_results_json: {
        issues: [
          { passed: false, check: 'Business schema', fix: 'Add a specific business type.' },
          { passed: false, check: 'Heading hierarchy', fix: 'Use one clear H1.' },
        ],
      },
    })).toBeNull();
  });
});
