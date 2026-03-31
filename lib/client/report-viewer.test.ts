import { describe, expect, it } from 'vitest';
import {
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
      splitMarkdownSections('## Executive Summary\nhello\n\n## Priority Action Plan\nworld')
    ).toEqual([
      {
        id: 'executive-summary',
        title: 'Executive Summary',
        content: '## Executive Summary\nhello',
        defaultOpen: true,
      },
      {
        id: 'priority-action-plan',
        title: 'Priority Action Plan',
        content: '## Priority Action Plan\nworld',
        defaultOpen: true,
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
});
