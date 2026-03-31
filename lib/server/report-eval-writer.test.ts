import { describe, expect, it } from 'vitest';
import { summarizeGeneratedReportEval } from './report-eval-writer';

describe('summarizeGeneratedReportEval', () => {
  it('summarizes generated report markdown and check outcomes for admin analytics', () => {
    const summary = summarizeGeneratedReportEval({
      markdown: [
        '# GEO-Pulse - AI Search Readiness Report',
        '',
        '## Executive Summary',
        '',
        'Summary.',
        '',
        '## Coverage Summary',
        '',
        '- x',
        '',
        '## Priority Action Plan',
        '',
        '- x',
        '',
        '## Score Breakdown - All Checks',
        '',
        '| Check | Status | Weight | Finding |',
        '|-------|--------|--------|---------|',
        '| Meta | FAIL | 6 | Too short |',
        '| Title | PASS | 5 | OK |',
        '',
        '## Pages Scanned',
        '',
        '- **https://example.com/** - 72/100 (B)',
        '- **https://example.com/docs** - 65/100 (C)',
        '',
        '## Technical Appendix',
      ].join('\n'),
      siteUrl: 'https://example.com/',
      reportId: 'report-1',
      scanId: 'scan-1',
      allIssues: [
        { check: 'Title', status: 'PASS' },
        { check: 'Meta', status: 'FAIL' },
        { check: 'Headers', status: 'WARNING' },
        { check: 'Q&A', status: 'LOW_CONFIDENCE' },
      ],
      reportPayloadVersion: 1,
    });

    expect(summary.framework).toBe('layer_one_report');
    expect(summary.rubricVersion).toBe('layer-one-structural-v1');
    expect(summary.domain).toBe('example.com');
    expect(summary.metrics['total_tests']).toBe(4);
    expect(summary.metrics['passed_tests']).toBe(1);
    expect(summary.metrics['failed_tests']).toBe(1);
    expect(summary.metrics['warning_tests']).toBe(1);
    expect(summary.metrics['low_confidence_tests']).toBe(1);
    expect(summary.metrics['pass_rate']).toBe(0.25);
    expect(summary.metrics['hasExecutiveSummary']).toBe(10);
    expect(summary.metadata['writer']).toBe('automatic_post_generation');
  });

  it('merges additional metadata for internal rewritten artifacts', () => {
    const summary = summarizeGeneratedReportEval({
      markdown: '## Executive Summary\n\nx\n\n## Coverage Summary\n\nx\n\n## Priority Action Plan\n\nx\n\n## Score Breakdown - All Checks\n\nx\n\n## Pages Scanned\n\nx\n\n## Technical Appendix\n\nx',
      siteUrl: 'https://example.com/',
      reportId: null,
      scanId: 'scan-2',
      metadata: {
        artifact_variant: 'internal_rewrite',
        rewrite_model: 'gemini-2.0-flash',
      },
    });

    expect(summary.metadata['artifact_variant']).toBe('internal_rewrite');
    expect(summary.metadata['rewrite_model']).toBe('gemini-2.0-flash');
  });
});
