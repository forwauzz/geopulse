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
        { check: 'Title', passed: true, finding: 'ok' },
        { check: 'Meta', passed: false, finding: 'missing', fix: 'Add description' },
      ],
    });
    expect(bytes.byteLength).toBeGreaterThan(500);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
  });
});
