import { describe, expect, it } from 'vitest';
import { parseCrawlPending } from './deep-audit-crawl';
import { extractSameOriginLinks, normalizeUrlKey } from './crawl-url-utils';

describe('normalizeUrlKey', () => {
  it('lowercases host and strips fragment', () => {
    expect(normalizeUrlKey('HTTPS://Example.COM/path#frag')).toBe('https://example.com/path');
  });

  it('returns empty for non-http(s)', () => {
    expect(normalizeUrlKey('ftp://x.com/')).toBe('');
  });
});

describe('parseCrawlPending', () => {
  it('returns null for invalid input', () => {
    expect(parseCrawlPending(null)).toBeNull();
    expect(parseCrawlPending({})).toBeNull();
  });

  it('parses legacy partial without robots metadata', () => {
    const p = parseCrawlPending({
      ordered_urls: ['https://a.com/'],
      next_index: 10,
      chunk_size: 25,
      crawl_delay_ms: 0,
      sitemap_norms: [],
      seed_norm: 'https://a.com/',
    });
    expect(p).not.toBeNull();
    expect(p?.robots_status).toBe(200);
    expect(p?.sitemap_urls_considered).toBe(1);
  });
});

describe('extractSameOriginLinks', () => {
  it('collects same-origin https links', () => {
    const html =
      '<a href="/a">a</a><a href="https://example.com/b">b</a><a href="https://other.com/x">x</a>';
    const links = extractSameOriginLinks(html, 'https://example.com/', 20);
    expect(links).toContain('https://example.com/a');
    expect(links).toContain('https://example.com/b');
    expect(links.some((u) => u.includes('other.com'))).toBe(false);
  });
});
