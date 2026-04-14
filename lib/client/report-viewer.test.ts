import { describe, expect, it } from 'vitest';
import {
  buildDisplayIssues,
  buildSummaryFacts,
  categoryScoreTone,
  clampScore,
  extractToc,
  issueSeverity,
  issueSeverityClasses,
  scoreNarrative,
  slugify,
  splitMarkdownSections,
} from './report-viewer';

describe('report viewer helpers', () => {
  it('slugifies headings conservatively', () => {
    expect(slugify('Executive Summary')).toBe('executive-summary');
    expect(slugify('Trust & Authority')).toBe('trust-authority');
  });

  it('extracts a toc from h1-h3 headings', () => {
    expect(
      extractToc('# Title\n\n## Executive Summary\n\n### Details')
    ).toEqual([
      { id: 'title', text: 'Title', level: 1 },
      { id: 'executive-summary', text: 'Executive Summary', level: 2 },
      { id: 'details', text: 'Details', level: 3 },
    ]);
  });

  it('splits markdown into top-level sections and opens key sections by default', () => {
    expect(
      splitMarkdownSections(
        '## Executive Summary\nhello\n\n## At a Glance\nquick\n\n## Immediate Wins\nwins\n\n## Priority Action Plan\nworld\n\n## Detailed Check Reference\nref\n\n## Technical Appendix\nappendix'
      )
    ).toEqual([
      {
        id: 'executive-summary',
        title: 'Executive Summary',
        content: '## Executive Summary\nhello',
        defaultOpen: true,
      },
      {
        id: 'at-a-glance',
        title: 'At a Glance',
        content: '## At a Glance\nquick',
        defaultOpen: true,
      },
      {
        id: 'immediate-wins',
        title: 'Immediate Wins',
        content: '## Immediate Wins\nwins',
        defaultOpen: true,
      },
      {
        id: 'priority-action-plan',
        title: 'Priority Action Plan',
        content: '## Priority Action Plan\nworld',
        defaultOpen: true,
      },
      {
        id: 'detailed-check-reference',
        title: 'Detailed Check Reference',
        content: '## Detailed Check Reference\nref',
        defaultOpen: false,
      },
      {
        id: 'technical-appendix',
        title: 'Technical Appendix',
        content: '## Technical Appendix\nappendix',
        defaultOpen: false,
      },
    ]);
  });

  it('computes score and severity helpers predictably', () => {
    expect(clampScore(101.4)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(categoryScoreTone(80)).toBe('bg-green-50 text-green-700');
    expect(categoryScoreTone(60)).toBe('bg-amber-50 text-amber-700');
    expect(categoryScoreTone(20)).toBe('bg-red-50 text-red-700');
    expect(issueSeverity(9)).toBe('High');
    expect(issueSeverity(6)).toBe('Medium');
    expect(issueSeverity(1)).toBe('Low');
    expect(issueSeverityClasses('High')).toContain('bg-red-100');
    expect(scoreNarrative(92)).toContain('Excellent readiness');
  });

  it('builds compact summary facts for the interactive report header', () => {
    expect(
      buildSummaryFacts({
        scanId: 'scan-1',
        url: 'https://example.com',
        domain: 'example.com',
        score: 42,
        letterGrade: 'F',
        topIssues: [
          {
            check: 'AI crawler access (robots.txt)',
            status: 'FAIL',
            weight: 10,
            teamOwner: 'Engineering',
            fix: 'Update robots.txt to allow AI crawlers.',
          },
          {
            check: 'Schema.org type coverage',
            status: 'FAIL',
            weight: 8,
          },
        ],
        categoryScores: [
          { category: 'trust', score: 62, letterGrade: 'C', checkCount: 3 },
          { category: 'ai_readiness', score: 30, letterGrade: 'F', checkCount: 4 },
        ],
      })
    ).toEqual([
      { label: 'Open issues', value: '2', tone: 'warning' },
      { label: 'Top blocker', value: 'AI crawler access (robots.txt)', tone: 'danger' },
      { label: 'Primary owner', value: 'Engineering', tone: 'default' },
      { label: 'First move', value: 'Update robots.txt to allow AI crawlers.', tone: 'default' },
      { label: 'Weakest category', value: 'AI Readiness', tone: 'danger' },
    ]);
  });

  it('builds a trimmed top-issues list for the interactive summary', () => {
    expect(
      buildDisplayIssues({
        scanId: 'scan-1',
        url: 'https://example.com',
        domain: 'example.com',
        score: 42,
        letterGrade: 'F',
        topIssues: [
          {
            check: 'AI crawler access (robots.txt)',
            status: 'FAIL',
            weight: 10,
            teamOwner: 'Engineering',
            finding: 'robots.txt blocks known AI crawlers.',
            fix: 'Update robots.txt to allow AI crawlers.',
          },
          {
            check: 'Schema.org type coverage',
            status: 'FAIL',
            weight: 8,
            finding: 'No Schema.org @type values found.',
          },
          {
            check: 'Freshness signals',
            status: 'WARNING',
            weight: 5,
            finding: 'Important pages do not show clear update cues.',
            fix: 'Add visible updated dates to key pages.',
          },
          {
            check: 'Title tags',
            status: 'PASS',
            weight: 4,
            finding: 'Looks good.',
          },
        ],
        categoryScores: [],
      })
    ).toEqual([
      {
        title: 'AI crawler access (robots.txt)',
        severity: 'High',
        status: 'FAIL',
        owner: 'Engineering',
        problem: 'robots.txt blocks known AI crawlers.',
        firstMove: 'Update robots.txt to allow AI crawlers.',
      },
      {
        title: 'Schema.org type coverage',
        severity: 'High',
        status: 'FAIL',
        owner: null,
        problem: 'No Schema.org @type values found.',
        firstMove: null,
      },
      {
        title: 'Freshness signals',
        severity: 'Medium',
        status: 'WARNING',
        owner: null,
        problem: 'Important pages do not show clear update cues.',
        firstMove: 'Add visible updated dates to key pages.',
      },
    ]);
  });
});
