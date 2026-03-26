import { describe, expect, it } from 'vitest';
import { buildDeepAuditPdf } from './build-deep-audit-pdf';

describe('buildDeepAuditPdf', () => {
  it('returns non-empty PDF bytes', async () => {
    const bytes = await buildDeepAuditPdf({
      url: 'https://example.com/page',
      domain: 'example.com',
      score: 72,
      letterGrade: 'B',
      issuesJson: [
        { check: 'Title', passed: true, status: 'PASS', finding: 'ok' },
        { check: 'Meta', passed: false, status: 'FAIL', finding: 'missing', fix: 'Add description' },
        { check: 'Alt text', passed: false, status: 'WARNING', finding: 'partial coverage' },
      ],
      highlightedIssues: [{ check: 'Meta', passed: false, status: 'FAIL', finding: 'missing', fix: 'Add description' }],
      coverageSummary: { pages_fetched: 3, pages_errored: 1, robots_status: 200 },
    });
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
  });
});
