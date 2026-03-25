import { describe, expect, it } from 'vitest';
import { buildDeepAuditMarkdown } from './build-deep-audit-markdown';
import { buildDeepAuditReportPayload } from './deep-audit-report-payload';
import { DEEP_AUDIT_ATTACH_MAX_BYTES } from './deep-audit-delivery-policy';
import { publicObjectUrl } from './r2-report-storage';

describe('buildDeepAuditReportPayload', () => {
  it('returns version 1 payload with section on pages', () => {
    const payload = buildDeepAuditReportPayload({
      scanId: 'scan-1',
      runId: 'run-1',
      domain: 'example.com',
      seedUrl: 'https://example.com/',
      aggregateScore: 72,
      aggregateLetterGrade: 'B',
      pages: [
        {
          url: 'https://example.com/a',
          score: 70,
          letter_grade: 'B',
          issues_json: [],
          section: 'blog',
        },
      ],
      coverageSummary: { ok: true },
      highlightedIssues: [],
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    expect(payload.version).toBe(1);
    expect(payload.pages[0]?.section).toBe('blog');
    expect(payload.generatedAt).toBe('2026-03-25T12:00:00.000Z');
  });
});

describe('buildDeepAuditMarkdown', () => {
  it('includes domain, score line, and section label', () => {
    const payload = buildDeepAuditReportPayload({
      scanId: 's',
      runId: 'r',
      domain: 'example.com',
      seedUrl: 'https://example.com/',
      aggregateScore: 50,
      aggregateLetterGrade: 'C',
      pages: [
        {
          url: 'https://example.com/p',
          score: 50,
          letter_grade: 'C',
          issues_json: [{ check: 'Title', passed: true }],
          section: 'docs',
        },
      ],
      coverageSummary: null,
      highlightedIssues: [],
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    const md = buildDeepAuditMarkdown(payload);
    expect(md).toContain('example.com');
    expect(md).toContain('50/100');
    expect(md).toContain('section docs');
    expect(md).toContain('Per-page checklist');
  });
});

describe('publicObjectUrl', () => {
  it('joins base and key without double slashes', () => {
    expect(publicObjectUrl('https://pub.r2.dev', 'deep-audits/x/report.pdf')).toBe(
      'https://pub.r2.dev/deep-audits/x/report.pdf'
    );
    expect(publicObjectUrl('https://pub.r2.dev/', '/deep-audits/x/report.pdf')).toBe(
      'https://pub.r2.dev/deep-audits/x/report.pdf'
    );
  });
});

describe('DEEP_AUDIT_ATTACH_MAX_BYTES', () => {
  it('is 4 MiB (Resend attachment guidance)', () => {
    expect(DEEP_AUDIT_ATTACH_MAX_BYTES).toBe(4 * 1024 * 1024);
  });
});
