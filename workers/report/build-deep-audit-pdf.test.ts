import { describe, expect, it } from 'vitest';
import { buildDeepAuditPdf, toWinAnsiSafe } from './build-deep-audit-pdf';

describe('toWinAnsiSafe', () => {
  it('maps arrows and strips non-WinAnsi glyphs instead of letting pdf-lib throw', () => {
    expect(toWinAnsiSafe('SEO plugin → Tools → editor')).toBe('SEO plugin -> Tools -> editor');
    expect(toWinAnsiSafe('em—dash and … ellipsis stay')).toBe('em—dash and … ellipsis stay');
    expect(toWinAnsiSafe('emoji 🚀 goes')).toBe('emoji ? goes');
  });
});

describe('buildDeepAuditPdf', () => {
  it('renders the delegation appendix without crashing on catalog arrows (WinAnsi)', async () => {
    const bytes = await buildDeepAuditPdf({
      url: 'https://example.com/',
      domain: 'example.com',
      score: 55,
      letterGrade: 'F',
      issuesJson: [
        {
          check: 'AI retrieval agent access (robots.txt)',
          checkId: 'ai-crawler-access',
          passed: false,
          status: 'FAIL',
          weight: 12,
          finding: 'robots.txt blocks OAI-SearchBot → invisible in ChatGPT search.',
          fix: 'Allow the retrieval agents.',
        },
        {
          check: 'Structured data (JSON-LD) validity',
          checkId: 'json-ld',
          passed: false,
          status: 'FAIL',
          weight: 6,
          finding: 'No JSON-LD structured data found.',
          fix: 'Add schema.',
        },
      ],
      highlightedIssues: [],
      coverageSummary: null,
      generatedAt: '2026-07-21T00:00:00.000Z',
    });
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('renders the market-position section (issue #125) with accented region names', async () => {
    const bytes = await buildDeepAuditPdf({
      url: 'https://mipsmedia.com/',
      domain: 'mipsmedia.com',
      score: 77,
      letterGrade: 'C+',
      issuesJson: [{ check: 'Title', passed: true, status: 'PASS', finding: 'ok' }],
      generatedAt: '2026-07-22T00:00:00.000Z',
      marketPosition: {
        rank: 7,
        of: 29,
        medianScore: 71,
        vertical: 'MSP / IT services',
        geoRegion: 'Québec', // é must survive WinAnsi encoding
        marketStats: ['9 of 29 allow ChatGPT search', '12 of 29 allow Perplexity'],
      },
    });
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

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
