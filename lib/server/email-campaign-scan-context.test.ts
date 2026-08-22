import { describe, expect, it } from 'vitest';
import { scanContextFromRow, selectCampaignScanCandidate } from './email-campaign-scan-context';

describe('campaign scan context', () => {
  const completeRow = (id: string, createdAt: string) => ({
    id,
    url: 'https://example.com/',
    domain: 'example.com',
    score: 76,
    letter_grade: 'C',
    created_at: createdAt,
    issues_json: [],
    full_results_json: {
      issues: [
        { passed: false, check: 'Answer-first content', fix: 'Lead with buyer questions.' },
        { passed: false, check: 'Business schema', fix: 'Add a specific business type.' },
      ],
      bucketScores: [{ bucket: 'eligibility', score: 100 }, { bucket: 'understanding', score: 62 }],
      accessMatrix: { rows: [{ status: 'eligible' }, { status: 'eligible' }] },
    },
  });

  it('selects the newest valid scan that owns a prepared report', () => {
    const selected = selectCampaignScanCandidate({
      rows: [completeRow('new-lightweight', '2026-08-10T12:00:00Z'), completeRow('prepared-audit', '2026-08-09T12:00:00Z')],
      reportScanIds: new Set(['prepared-audit']),
    });
    expect(selected?.row.id).toBe('prepared-audit');
    expect(selected?.context.scanId).toBe('prepared-audit');
  });
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

  it('accepts a prepared deep-audit payload without legacy scorecard diagnostics', () => {
    const context = scanContextFromRow({
      id: 'deep-audit',
      url: 'https://example.com/',
      domain: 'example.com',
      score: 68,
      letter_grade: 'D+',
      created_at: '2026-08-10T14:48:55Z',
      issues_json: [],
      full_results_json: {
        allIssues: [
          { passed: false, check: 'Answer-first content', fix: 'Lead with buyer questions.' },
          { passed: false, check: 'Business schema', fix: 'Add a specific business type.' },
        ],
        categoryScores: [{ category: 'ai_readiness', score: 91 }],
        reportPayloadVersion: '3',
      },
    });
    expect(context).toMatchObject({ scanId: 'deep-audit', score: 68, grade: 'D+' });
    expect(context?.passedChecks).toBeUndefined();
    expect(context?.retrievalScore).toBeUndefined();
  });
});
