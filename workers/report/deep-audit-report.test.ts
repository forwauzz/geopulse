import { describe, expect, it } from 'vitest';
import { buildDeepAuditMarkdown } from './build-deep-audit-markdown';
import { buildDeepAuditReportPayload } from './deep-audit-report-payload';
import { DEEP_AUDIT_ATTACH_MAX_BYTES } from './deep-audit-delivery-policy';
import { parseIssues } from './deep-audit-report-helpers';
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
      allIssues: [],
      technicalAppendix: { robotsSummary: 'AI crawler access [PASS]: robots.txt allows crawlers.' },
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    expect(payload.version).toBe(1);
    expect(payload.pages[0]?.section).toBe('blog');
    expect(payload.generatedAt).toBe('2026-03-25T12:00:00.000Z');
  });

  it('normalizes issue rows into the canonical payload shape with teamOwner', () => {
    const payload = buildDeepAuditReportPayload({
      scanId: 'scan-2',
      runId: 'run-2',
      domain: 'example.com',
      seedUrl: 'https://example.com/',
      aggregateScore: 72,
      aggregateLetterGrade: 'B',
      pages: [
        {
          url: 'https://example.com/a',
          score: 70,
          letter_grade: 'B',
          issues_json: [{ checkId: 'ai-crawler-access', status: 'FAIL' }],
          section: 'docs',
        },
      ],
      coverageSummary: { ok: true },
      highlightedIssues: [{ checkId: 'llm-qa-pattern', status: 'FAIL' }],
      allIssues: [{ checkId: 'eeat-signals', status: 'FAIL' }],
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    expect(payload.pages[0]?.issuesJson[0]?.teamOwner).toBe('Engineering');
    expect(payload.highlightedIssues[0]?.teamOwner).toBe('Content');
    expect(payload.allIssues[0]?.teamOwner).toBe('Brand');
  });

  it('derives internal-only immediate wins from canonical allIssues', () => {
    const payload = buildDeepAuditReportPayload({
      scanId: 'scan-3',
      runId: 'run-3',
      domain: 'example.com',
      seedUrl: 'https://example.com/',
      aggregateScore: 72,
      aggregateLetterGrade: 'B',
      pages: [],
      coverageSummary: { ok: true },
      highlightedIssues: [],
      allIssues: [
        {
          checkId: 'ai-crawler-access',
          check: 'AI crawler access (robots.txt)',
          status: 'FAIL',
          weight: 10,
          finding: 'robots.txt blocks crawlers',
          fix: 'Update robots.txt to allow AI crawlers',
        },
      ],
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    expect(payload.immediateWins).toHaveLength(1);
    expect(payload.immediateWins[0]?.who).toBe('Engineering');
    expect(payload.immediateWins[0]?.checkId).toBe('ai-crawler-access');
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
          issues_json: [{ check: 'Title', passed: true, fix: 'Add a concise title' }],
          section: 'docs',
        },
        {
          url: 'https://example.com/q',
          score: 60,
          letter_grade: 'B',
          issues_json: [{ check: 'Meta', passed: false, fix: 'Add a meta description' }],
          section: 'blog',
        },
      ],
      coverageSummary: { pages_fetched: 2, pages_errored: 0, robots_status: 200 },
      highlightedIssues: [{ check: 'Meta', passed: false, status: 'FAIL' }],
      allIssues: [
        {
          checkId: 'ai-crawler-access',
          check: 'AI crawler access (robots.txt)',
          passed: false,
          status: 'FAIL',
          weight: 10,
          finding: 'robots.txt blocks known AI crawlers',
          fix: 'Update robots.txt to allow AI crawlers',
        },
        { check: 'Title', passed: true, status: 'PASS', weight: 5, finding: 'ok' },
        { check: 'Meta', passed: false, status: 'FAIL', weight: 6, finding: 'missing' },
      ],
      technicalAppendix: {
        robotsSummary: 'AI crawler access [PASS]: robots.txt allows crawlers.',
        schemaSummary: 'Schema.org type coverage [FAIL]: No Schema.org @type values found.',
        headersSummary: 'Security response headers [WARNING]: HSTS missing.',
      },
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    const md = buildDeepAuditMarkdown(payload);
    expect(md).toContain('example.com');
    expect(md).toContain('50/100');
    expect(md).toContain('section docs');
    expect(md).toContain('## Immediate Wins');
    expect(md).toContain('**Who:** Engineering');
    expect(md).toContain('**Effort:** Quick');
    expect(md).toContain('Per-Page Checklist');
    expect(md).toContain('_(no non-passing issue rows)_');
    expect(md).toContain('Coverage Summary');
    expect(md).toContain('Technical Appendix');
    expect(md).toContain('Robots / AI crawler access');
    expect(md).toContain('Schema findings');
    expect(md).toContain('| Meta | FAIL | 6 | missing |');
    expect(md).not.toContain('- **Title** [PASS]');
    expect(md).toContain('- **Meta** [FAIL]\n  - Fix: Add a meta description');
  });

  it('replaces raw low-confidence transport evidence with bounded wording', () => {
    const payload = buildDeepAuditReportPayload({
      scanId: 's-http',
      runId: 'r-http',
      domain: 'example.com',
      seedUrl: 'https://example.com/',
      aggregateScore: 40,
      aggregateLetterGrade: 'F',
      pages: [
        {
          url: 'https://example.com/p',
          score: 40,
          letter_grade: 'F',
          issues_json: [
            {
              checkId: 'llm-qa-pattern',
              check: 'Q&A / instructional structure (LLM)',
              status: 'LOW_CONFIDENCE',
              finding: 'http_403',
              fix: 'Add clear questions and answers or step-by-step guidance where appropriate.',
            },
          ],
          section: 'docs',
        },
        {
          url: 'https://example.com/q',
          score: 41,
          letter_grade: 'F',
          issues_json: [],
          section: 'blog',
        },
      ],
      coverageSummary: { pages_fetched: 2, pages_errored: 0, robots_status: 200 },
      highlightedIssues: [
        {
          checkId: 'llm-qa-pattern',
          check: 'Q&A / instructional structure (LLM)',
          status: 'LOW_CONFIDENCE',
          weight: 10,
          finding: 'http_403',
          fix: 'Add clear questions and answers or step-by-step guidance where appropriate.',
        },
      ],
      allIssues: [
        {
          checkId: 'llm-qa-pattern',
          check: 'Q&A / instructional structure (LLM)',
          status: 'LOW_CONFIDENCE',
          weight: 10,
          finding: 'http_403',
          fix: 'Add clear questions and answers or step-by-step guidance where appropriate.',
        },
      ],
      generatedAt: '2026-03-25T12:00:00.000Z',
    });

    const md = buildDeepAuditMarkdown(payload);
    expect(md).not.toContain('http_403');
    expect(md).toContain('could not confidently evaluate this check');
  });
});

describe('teamOwner propagation', () => {
  it('adds teamOwner to parsed issue rows without changing report output requirements', () => {
    const issues = parseIssues([
      { checkId: 'ai-crawler-access', passed: false, status: 'FAIL', weight: 10, finding: 'blocked' },
    ]);

    expect(issues[0]?.teamOwner).toBe('Engineering');
    expect(issues[0]?.finding).toBe('blocked');
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
