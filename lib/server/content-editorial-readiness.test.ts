import { describe, expect, it } from 'vitest';
import {
  assertEditorialReadyForLaunch,
  evaluateEditorialReadiness,
} from './content-editorial-readiness';

describe('evaluateEditorialReadiness', () => {
  it('passes strong editorial signals', () => {
    expect(
      evaluateEditorialReadiness({
        title: 'How to Audit Your Site for AI Search Readiness',
        draftMarkdown:
          '# Title\n\nAI search readiness means a site is easy to crawl, segment, summarize, and trust.\n\n## What to check first\n\n- Crawlability\n- Structure\n- Trust\n\n## Why it matters\n\nClear pages are easier to cite.',
        sourceLinks: ['https://example.com/source'],
        ctaGoal: 'free_scan',
      }).every((check) => check.passed)
    ).toBe(true);
  });

  it('fails weak editorial signals', () => {
    expect(
      evaluateEditorialReadiness({
        title: 'Short',
        draftMarkdown: '# Title\n\nTiny.\n',
        sourceLinks: [],
        ctaGoal: '',
      }).map((check) => check.passed)
    ).toEqual([false, false, false, true, false, false]);
  });

  it('throws when required launch checks fail', () => {
    expect(() =>
      assertEditorialReadyForLaunch({
        title: 'Short',
        draftMarkdown: '# Title\n\nTiny.\n',
        sourceLinks: [],
        ctaGoal: '',
      })
    ).toThrow('Cannot publish article yet.');
  });

  it('allows launch when required checks pass', () => {
    expect(
      assertEditorialReadyForLaunch({
        title: 'How to Audit Your Site for AI Search Readiness',
        draftMarkdown:
          '# Title\n\nAI search readiness means a site is easy to crawl, segment, summarize, and trust.\n\n## What to check first\n\n- Crawlability\n- Structure\n- Trust\n\n## Why it matters\n\nClear pages are easier to cite.',
        sourceLinks: ['https://example.com/source'],
        ctaGoal: 'free_scan',
      }).every((check) => check.passed)
    ).toBe(true);
  });
});
